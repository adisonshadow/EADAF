#!/usr/bin/env bash
# scripts/dev.sh
#
# 串行启动 monorepo 开发环境：
#   1) 先启动 backend（pnpm --filter backend dev），等到它真正监听端口后再继续
#   2) 再启动 frontend（pnpm --filter frontend dev）
#
# 设计要点：
#   - 若 29526（或 API_PORT）上已有健康的本仓库 backend / nodemon，则复用，避免 EADDRINUSE。
#   - 本次脚本自己拉起的 backend，Ctrl+C 时会杀掉整棵进程树（含 nodemon 子进程）。
#   - 复用已有 backend 时，Ctrl+C 只停 frontend，不杀 nodemon（改文件会热重载）。
#   - 强制重启：pnpm killdev && pnpm dev

set -euo pipefail

# ----------------------------- 基础配置 -----------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

BACKEND_FILTER="${BACKEND_FILTER:-./backend}"
FRONTEND_FILTER="${FRONTEND_FILTER:-./frontend}"
BACKEND_WAIT_TIMEOUT="${BACKEND_WAIT_TIMEOUT:-60}"

BACKEND_LOG="$(mktemp -t eadaf-backend-dev.XXXXXX.log)"
BACKEND_PID_FILE="$(mktemp -t eadaf-backend-dev.XXXXXX.pid)"
BACKEND_PORT=""
BACKEND_STARTED_BY_US=0
CLEANUP_DONE=0

# ----------------------------- 工具函数 -----------------------------

read_api_port() {
  local val helper
  if [[ -n "${API_PORT:-}" && "${API_PORT}" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "$API_PORT"
    return
  fi
  # 与后端共用同一套 env 级联（含 .env.$NODE_ENV.local 的个人覆盖），不要再手工 grep 单个文件：
  # 否则端口写在覆盖层里时这里读到的是旧值。
  helper="$REPO_ROOT/backend/scripts/lib/load-env.cjs"
  if [[ -f "$helper" ]] && command -v node >/dev/null 2>&1; then
    val="$(node "$helper" --value API_PORT 2>/dev/null || true)"
    if [[ "$val" =~ ^[0-9]+$ ]]; then
      printf '%s\n' "$val"
      return
    fi
  fi
  printf '%s\n' "29526"
}

port_listening() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
  elif command -v nc >/dev/null 2>&1; then
    nc -z -w 1 127.0.0.1 "$port" >/dev/null 2>&1
  else
    (echo >/dev/tcp/127.0.0.1/"$port") >/dev/null 2>&1
  fi
}

backend_healthy() {
  local port="$1"
  local body=""
  if command -v curl >/dev/null 2>&1; then
    body="$(curl -fsS -m 2 "http://127.0.0.1:${port}/api/v1/health" 2>/dev/null || true)"
  fi
  [[ "$body" == *'"code":200'* || "$body" == *'"status":"ok"'* ]]
}

describe_port() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true
  fi
}

# 打印本机局域网 IPv4（给 monorepo 启动摘要用；backend 日志写到文件时终端也能看到）
print_lan_urls() {
  local port="$1"
  local label="${2:-}"
  local ip
  while read -r ip; do
    [[ -n "$ip" ]] || continue
    if [[ -n "$label" ]]; then
      echo "    ${label} http://${ip}:${port}"
    else
      echo "    http://${ip}:${port}"
    fi
  done < <(
    ifconfig 2>/dev/null | awk '/inet / && $2 != "127.0.0.1" { print $2 }' \
      || ip -4 -o addr show scope global 2>/dev/null | awk '{ print $4 }' | cut -d/ -f1
  )
}

# 杀掉 pid 及其全部子孙（nodemon → node src/app.js）。
kill_tree() {
  local pid="$1"
  local sig="${2:-TERM}"
  local child
  [[ -n "${pid:-}" ]] || return 0
  kill -0 "$pid" 2>/dev/null || return 0
  while read -r child; do
    [[ -n "$child" ]] && kill_tree "$child" "$sig"
  done < <(pgrep -P "$pid" 2>/dev/null || true)
  kill -"$sig" "$pid" 2>/dev/null || true
}

wait_until_dead() {
  local pid="$1"
  local i
  for _ in 1 2 3 4 5; do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 0.2
  done
}

kill_owned_backend() {
  local pid=""
  if [[ -f "$BACKEND_PID_FILE" && -s "$BACKEND_PID_FILE" ]]; then
    pid="$(cat "$BACKEND_PID_FILE")"
  fi
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    echo "🛑 停止本次启动的 backend (pid=$pid) ..."
    kill_tree "$pid" TERM
    wait_until_dead "$pid"
    if kill -0 "$pid" 2>/dev/null; then
      kill_tree "$pid" KILL
    fi
  fi
}

cleanup() {
  [[ "$CLEANUP_DONE" -eq 1 ]] && return 0
  CLEANUP_DONE=1
  echo ""
  echo "↩️  收到退出信号，正在清理子进程 ..."
  if [[ -n "${FRONTEND_PID:-}" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    kill_tree "$FRONTEND_PID" TERM
    wait "$FRONTEND_PID" 2>/dev/null || true
  fi
  if [[ "$BACKEND_STARTED_BY_US" -eq 1 ]]; then
    kill_owned_backend
  else
    echo "♻️  保留已在运行的 backend / nodemon（改 backend 文件会自动重载）。"
  fi
  rm -f "$BACKEND_LOG" "$BACKEND_PID_FILE" 2>/dev/null || true
  echo "👋 已退出。"
}
trap cleanup EXIT INT TERM

wait_for_port() {
  local port="$1"
  local timeout="${2:-$BACKEND_WAIT_TIMEOUT}"
  local elapsed=0
  while (( elapsed < timeout )); do
    if command -v nc >/dev/null 2>&1; then
      if nc -z -w 1 127.0.0.1 "$port" >/dev/null 2>&1; then
        return 0
      fi
    else
      if (echo >/dev/tcp/127.0.0.1/"$port") >/dev/null 2>&1; then
        return 0
      fi
    fi
    sleep 0.5
    elapsed=$((elapsed + 1))
  done
  return 1
}

print_startup_report() {
  # 自检写在 backend 日志里，父进程终端默认看不到，这里把最近一次贴回来。
  local report
  report="$(awk '
    index($0, "────────────── 启动自检 ──────────────") { capture = 1; buf = $0; next }
    capture { buf = buf "\n" $0 }
    index($0, "────────────────────────────────────────────────────────────") && capture { last = buf; capture = 0 }
    END { if (last != "") print last }
  ' "$BACKEND_LOG" 2>/dev/null || true)"
  if [[ -z "$report" ]]; then
    report="$(grep -a '启动自检通过' "$BACKEND_LOG" 2>/dev/null | tail -n 1 || true)"
  fi
  if [[ -n "$report" ]]; then
    echo ""
    printf '%s\n' "$report"
    echo ""
  fi
}

start_backend() {
  echo "    启动 pnpm --filter \"$BACKEND_FILTER\" dev"
  echo "    日志: $BACKEND_LOG"
  pnpm --filter "$BACKEND_FILTER" dev >"$BACKEND_LOG" 2>&1 &
  BACKEND_PID=$!
  echo "$BACKEND_PID" >"$BACKEND_PID_FILE"
  BACKEND_STARTED_BY_US=1
  echo "    backend pid=$BACKEND_PID"

  echo "    等待 backend 启动（最多 ${BACKEND_WAIT_TIMEOUT}s）..."
  local started=0
  local deadline started_line
  deadline=$(( $(date +%s) + BACKEND_WAIT_TIMEOUT ))
  while :; do
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
      echo ""
      echo "❌ backend 进程已退出，请查看日志尾部："
      echo "------------------------------------------------------------"
      tail -n 60 "$BACKEND_LOG" || true
      echo "------------------------------------------------------------"
      exit 1
    fi

    # 兼容新旧启动日志：
    #   旧: API Server started on port 29526
    #   新: API Server started on 0.0.0.0:29526
    started_line="$(grep -m1 -E 'API Server started on (port )?[0-9.:a-fA-F]+' "$BACKEND_LOG" 2>/dev/null || true)"
    if [[ -n "$started_line" ]]; then
      # 端口以 .env / API_PORT 为准，不能从带 timestamp 的 JSON 日志中取“最后一个数字”。
      BACKEND_PORT="$EXPECTED_PORT"
      started=1
      echo "    检测到启动日志：$started_line"
      print_startup_report
      break
    fi

    # 日志可能因缓冲晚出现：端口已可连 + 健康检查通过也算就绪
    if port_listening "$EXPECTED_PORT" && backend_healthy "$EXPECTED_PORT"; then
      BACKEND_PORT="$EXPECTED_PORT"
      started=1
      echo "    检测到端口 $EXPECTED_PORT 已可连且健康检查通过"
      print_startup_report
      break
    fi

    if [[ $(date +%s) -ge $deadline ]]; then
      break
    fi
    sleep 0.5
  done

  if [[ "$started" -eq 1 && -n "$BACKEND_PORT" ]]; then
    if wait_for_port "$BACKEND_PORT" "$BACKEND_WAIT_TIMEOUT"; then
      echo "    ✅ 端口 $BACKEND_PORT 已就绪"
    else
      echo "    ⚠️  backend 已打印启动日志，但端口 $BACKEND_PORT 在超时内仍未可连（可能仍在初始化）。"
      echo "        继续启动 frontend，若接口报错请稍后重试或检查 backend 日志。"
    fi
  else
    echo ""
    echo "❌ backend 在 ${BACKEND_WAIT_TIMEOUT}s 内未打印启动成功日志。"
    echo "   日志尾部："
    echo "------------------------------------------------------------"
    tail -n 60 "$BACKEND_LOG" || true
    echo "------------------------------------------------------------"
    exit 1
  fi
}

# ----------------------------- 启动 backend -----------------------------

EXPECTED_PORT="$(read_api_port)"
BACKEND_PORT="$EXPECTED_PORT"

echo "================================================================"
echo "🟢 [1/2] backend  (pnpm --filter \"$BACKEND_FILTER\" dev)"
echo "================================================================"

if port_listening "$EXPECTED_PORT"; then
  if backend_healthy "$EXPECTED_PORT"; then
    echo "♻️  端口 $EXPECTED_PORT 上已有可用 backend，跳过重复启动（nodemon 会热重载）。"
    echo "    启动自检只在 backend 进程起来时打印，这次不会再打一遍。"
    echo "    Local:   http://localhost:${EXPECTED_PORT}/api/v1/health"
    print_lan_urls "$EXPECTED_PORT" "Network:"
    echo "    若要再看启动自检：pnpm killdev && pnpm dev"
  else
    echo "❌ 端口 $EXPECTED_PORT 已被占用，但健康检查失败，无法确认是本仓库 backend："
    describe_port "$EXPECTED_PORT"
    echo ""
    echo "    请先执行：pnpm killdev"
    echo "    或手动结束占用进程后再 pnpm dev。"
    exit 1
  fi
else
  start_backend
  echo "    Local:   http://localhost:${BACKEND_PORT}/api/v1/health"
  print_lan_urls "$BACKEND_PORT" "Network:"
fi

echo ""
echo "================================================================"
echo "🟢 [2/2] 启动 frontend (pnpm --filter \"$FRONTEND_FILTER\" dev)"
echo "        backend: http://localhost:${BACKEND_PORT:-<unknown>}"
print_lan_urls "${BACKEND_PORT:-$EXPECTED_PORT}" "        backend Network:"
echo "================================================================"
echo ""

pnpm --filter "$FRONTEND_FILTER" dev &
FRONTEND_PID=$!
wait "$FRONTEND_PID" || true
