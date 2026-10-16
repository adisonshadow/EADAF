#!/bin/bash

# env 加载：**不要在这里再写一套解析逻辑**。
# 唯一实现是 backend/scripts/lib/load-env.cjs（与后端 src/config/envFiles.js 共用同一套级联）：
#   .env  →  .env.{NODE_ENV}  →  .env.{NODE_ENV}.local      （后者覆盖前者）
#   真实环境变量（CI / pm2 / docker -e / 命令行）始终优先于上述文件
#
# 历史坑：这里原先只 `source .env.{NODE_ENV}`，读不到 .env.{NODE_ENV}.local 的个人覆盖，
# 导致备份脚本拿 .env.development 里的模板端口 25432 去连实际在 35432 的库（HTTP 500）。

load_env_file() {
  local project_root="$1"
  local helper="$project_root/scripts/lib/load-env.cjs"
  local node_env="${NODE_ENV:-development}"
  local exports

  if [ ! -f "$helper" ]; then
    echo "错误：找不到 env 解析器 $helper" >&2
    exit 1
  fi

  if ! exports="$(node "$helper" --export --fail-if-none)"; then
    echo "错误：未找到任何 env 文件（期望 backend/.env / .env.$node_env / .env.$node_env.local）" >&2
    exit 1
  fi

  # 输出形如 export K='v'；已存在的真实环境变量不会被覆盖（解析器只输出"当前环境未设置"的键）
  # shellcheck disable=SC2086
  eval "$exports"
}

wait_for_postgres() {
  local max_attempts="${1:-60}"
  local attempt=0

  echo "等待 PostgreSQL 就绪..."
  while [ "$attempt" -lt "$max_attempts" ]; do
    if docker compose exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DATABASE" > /dev/null 2>&1; then
      echo "PostgreSQL 已就绪"
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 1
  done

  echo "错误：PostgreSQL 启动超时"
  return 1
}

wait_for_redis() {
  local max_attempts="${1:-30}"
  local attempt=0

  echo "等待 Redis 就绪..."
  while [ "$attempt" -lt "$max_attempts" ]; do
    if docker compose exec -T redis redis-cli ping | grep -q PONG; then
      echo "Redis 已就绪"
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 1
  done

  echo "错误：Redis 启动超时"
  return 1
}

start_docker_services() {
  docker compose up -d
  wait_for_postgres
  wait_for_redis
}
