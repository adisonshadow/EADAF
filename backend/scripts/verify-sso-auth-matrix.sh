#!/usr/bin/env bash
# EADAF 鉴权密钥自描述改造 —— 真接口回归矩阵。
#
# 覆盖：SSO 用户 JWT（应用密钥签发）/ 平台会话 JWT / 应用 Token（平台密钥签发）
#       在「带 ?app= / 不带 ?app=」下的期望行为，以及负例与刷新链路。
#
# 用法（默认打本机 dev 后端；密钥从环境变量读，不写进仓库）：
#   EADAF_APP_SECRET=<应用统一密钥> bash scripts/verify-sso-auth-matrix.sh
#
# 可用变量：
#   EADAF_BASE            默认 http://localhost:29526/api/v1
#   EADAF_APP_ID          启用 SSO 的应用（默认示例应用 YS）
#   EADAF_APP_SECRET      上面应用的统一密钥；缺省则跳过「应用 Token」一组
#   EADAF_OTHER_APP_ID    另一个启用 SSO 的应用，用于负例；缺省则跳过该条
#   EADAF_NO_SSO_APP_ID   未启用 SSO 的应用，用于负例；缺省则跳过该条
#   EADAF_ADMIN_USER / EADAF_ADMIN_PASSWORD  默认 admin / 123456（dev 模式）
set -uo pipefail

BASE="${EADAF_BASE:-http://localhost:29526/api/v1}"
APP="${EADAF_APP_ID:-1e71c653-630f-4006-b6df-081172b15752}"
APP_SECRET="${EADAF_APP_SECRET:-}"
OTHER="${EADAF_OTHER_APP_ID:-}"
NO_SSO_APP="${EADAF_NO_SSO_APP_ID:-}"
ADMIN_USER="${EADAF_ADMIN_USER:-admin}"
ADMIN_PASSWORD="${EADAF_ADMIN_PASSWORD:-123456}"

pass=0; fail=0; skip=0
check() { # check <说明> <期望码> <实际码>
  if [ "$2" = "$3" ]; then printf '  ✅ %-56s %s\n' "$1" "$3"; pass=$((pass+1))
  else printf '  ❌ %-56s 期望 %s 实际 %s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
skip_case() { printf '  ⏭️  %-56s %s\n' "$1" "$2"; skip=$((skip+1)); }
code() { curl -s -o /tmp/_eadaf_body.json -w '%{http_code}' "$@"; }
login() { # login <application_id 或空>
  local body
  if [ -n "$1" ]; then body="{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASSWORD\",\"application_id\":\"$1\",\"dev\":true}"
  else body="{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASSWORD\",\"dev\":true}"; fi
  curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d "$body" \
    | python3 -c 'import sys,json;d=json.load(sys.stdin);print((d.get("data") or {}).get("token",""))'
}

if ! curl -sf -o /dev/null "$BASE/auth/captcha"; then
  echo "后端不可达：$BASE（先启动 EADAF 后端）" >&2
  exit 2
fi

echo "== 1. SSO 用户 JWT（新登录，应带 application_id 声明）=="
SSO_TOK=$(login "$APP")
SSO_REFRESH=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASSWORD\",\"application_id\":\"$APP\",\"dev\":true}" \
  | python3 -c 'import sys,json;print((json.load(sys.stdin).get("data") or {}).get("refresh_token",""))')
python3 - "$SSO_TOK" <<'PY'
import sys, base64, json
p = sys.argv[1].split('.')[1]; p += '=' * (-len(p) % 4)
payload = json.loads(base64.urlsafe_b64decode(p))
assert payload.get('application_id'), 'access token 缺 application_id 声明'
print('  ℹ️  access token 声明:', sorted(payload))
PY

check "GET /auth/check 不带 app"                200 "$(code "$BASE/auth/check" -H "Authorization: Bearer $SSO_TOK")"
check "GET /auth/check 带 app"                  200 "$(code "$BASE/auth/check?app=$APP" -H "Authorization: Bearer $SSO_TOK")"
check "GET /v1/ai/capabilities 不带 app"        200 "$(code "$BASE/ai/capabilities" -H "Authorization: Bearer $SSO_TOK")"
check "GET /v1/ai/skills 不带 app"              200 "$(code "$BASE/ai/skills?slugs=aibase-chat-framework" -H "Authorization: Bearer $SSO_TOK")"
check "GET /v1/data/<域>/... 不带 app"          200 "$(code "$BASE/data/YS/product/Product?limit=1" -H "Authorization: Bearer $SSO_TOK")"

echo "== 2. 负例 =="
check "SSO JWT 带不存在的 app"                  401 "$(code "$BASE/auth/check?app=00000000-0000-4000-8000-000000000000" -H "Authorization: Bearer $SSO_TOK")"
check "乱码 token"                              401 "$(code "$BASE/auth/check" -H "Authorization: Bearer not-a-jwt")"
check "无 Authorization 头"                     401 "$(code "$BASE/auth/check")"
if [ -n "$OTHER" ]; then check "SSO JWT 带别的应用 app"  401 "$(code "$BASE/auth/check?app=$OTHER" -H "Authorization: Bearer $SSO_TOK")"
else skip_case "SSO JWT 带别的应用 app" "未设 EADAF_OTHER_APP_ID"; fi
if [ -n "$NO_SSO_APP" ]; then check "SSO JWT 带未启用 SSO 的应用" 401 "$(code "$BASE/auth/check?app=$NO_SSO_APP" -H "Authorization: Bearer $SSO_TOK")"
else skip_case "SSO JWT 带未启用 SSO 的应用" "未设 EADAF_NO_SSO_APP_ID"; fi

echo "== 3. 平台会话 JWT（不带 application_id 声明）=="
PLAT_TOK=$(login "")
check "GET /auth/check 不带 app"                200 "$(code "$BASE/auth/check" -H "Authorization: Bearer $PLAT_TOK")"
check "GET /auth/check 带 app（平台密钥兜底）"   200 "$(code "$BASE/auth/check?app=$APP" -H "Authorization: Bearer $PLAT_TOK")"
check "GET /v1/ai/capabilities 不带 app"        200 "$(code "$BASE/ai/capabilities" -H "Authorization: Bearer $PLAT_TOK")"

echo "== 4. 应用 Token（type=application，平台密钥签发）=="
if [ -n "$APP_SECRET" ]; then
  APP_TOK=$(curl -s -X POST "$BASE/applications/token" -H 'Content-Type: application/json' \
    -d "{\"application_id\":\"$APP\",\"app_secret\":\"$APP_SECRET\"}" \
    | python3 -c 'import sys,json;print((json.load(sys.stdin).get("data") or {}).get("token",""))')
  check "GET /v1/data/... 不带 app"             200 "$(code "$BASE/data/YS/product/Product?limit=1" -H "Authorization: Bearer $APP_TOK")"
  check "GET /v1/data/... 带 app"               200 "$(code "$BASE/data/YS/product/Product?limit=1&app=$APP" -H "Authorization: Bearer $APP_TOK")"
else
  skip_case "应用 Token 带/不带 app" "未设 EADAF_APP_SECRET"
fi

echo "== 5. 刷新令牌 =="
# 刷新令牌要落库（uac.refresh_tokens.token 原为 VARCHAR(255)），必须够短且自带应用信息为可选项
python3 - "$SSO_REFRESH" <<'PY'
import sys, base64, json
t = sys.argv[1]
p = t.split('.')[1]; p += '=' * (-len(p) % 4)
payload = json.loads(base64.urlsafe_b64decode(p))
assert 'application_id' not in payload, '刷新令牌不应带 application_id：会超出 refresh_tokens.token 的 255 上限'
assert len(t) <= 255, f'刷新令牌长度 {len(t)} 超过 255，落库会失败'
print(f'  ℹ️  刷新令牌 {len(t)} 字符、不带 application_id（无需表结构变更）')
PY
NEW=$(curl -s -X POST "$BASE/auth/refresh" -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $SSO_TOK" -d "{\"refresh_token\":\"$SSO_REFRESH\"}")
NEW_TOK=$(echo "$NEW" | python3 -c 'import sys,json;print((json.load(sys.stdin).get("data") or {}).get("token",""))')
NEW_REFRESH=$(echo "$NEW" | python3 -c 'import sys,json;print((json.load(sys.stdin).get("data") or {}).get("refresh_token",""))')
python3 - "$NEW_TOK" <<'PY'
import sys, base64, json
p = sys.argv[1].split('.')[1]; p += '=' * (-len(p) % 4)
payload = json.loads(base64.urlsafe_b64decode(p))
assert payload.get('application_id'), '刷新后 access token 丢了 application_id 声明'
print('  ℹ️  刷新后仍带声明:', payload.get('application_id'))
PY
check "刷新后 GET /v1/ai/capabilities 不带 app" 200 "$(code "$BASE/ai/capabilities" -H "Authorization: Bearer $NEW_TOK")"
check "刷新（显式带 app）"                      200 "$(code -X POST "$BASE/auth/refresh" -H 'Content-Type: application/json' -H "Authorization: Bearer $NEW_TOK" -d "{\"refresh_token\":\"$NEW_REFRESH\",\"app\":\"$APP\"}")"
check "刷新（无效 refresh_token）"              401 "$(code -X POST "$BASE/auth/refresh" -H 'Content-Type: application/json' -H "Authorization: Bearer $NEW_TOK" -d '{"refresh_token":"garbage"}')"

echo "== 6. 单点登出中转（/auth/end-session）=="
# 只允许回跳到应用自己的 redirect_uri / frontend_url 同源地址
POST_LOGOUT_URI="${EADAF_POST_LOGOUT_URI:-http://localhost:29529/auth/login}"
ENCODED_TARGET=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1], safe=''))" "$POST_LOGOUT_URI")
LOCATION=$(curl -s -o /dev/null -D - "$BASE/auth/end-session?app=$APP&post_logout_redirect_uri=$ENCODED_TARGET&state=logout" \
  | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}')
if printf '%s' "$LOCATION" | grep -q 'logged_out=1' && printf '%s' "$LOCATION" | grep -q 'state=logout'; then
  printf '  ✅ %-56s %s\n' "合法回跳地址 → 302 带 logged_out/state" "$LOCATION"; pass=$((pass+1))
else
  printf '  ❌ %-56s 实际 Location=%s（默认目标 %s 是否与应用同源？可用 EADAF_POST_LOGOUT_URI 覆盖）\n' \
    "合法回跳地址 → 302 带 logged_out/state" "${LOCATION:-无}" "$POST_LOGOUT_URI"; fail=$((fail+1))
fi
check "跨站回跳地址（开放重定向）"              400 "$(code "$BASE/auth/end-session?app=$APP&post_logout_redirect_uri=https%3A%2F%2Fevil.example.com%2Fsteal")"
check "缺少 app 参数"                          400 "$(code "$BASE/auth/end-session?post_logout_redirect_uri=$ENCODED_TARGET")"

echo "== 7. 401 可编程错误码 =="
assert_error_code() { # assert_error_code <说明> <期望 error_code> <curl 参数...>
  local body
  body=$(curl -s "$@")
  if printf '%s' "$body" | grep -q "\"error_code\":\"$2\""; then
    printf '  ✅ %-56s %s\n' "$1" "$2"; pass=$((pass+1))
  else
    printf '  ❌ %-56s 响应=%s\n' "$1" "$(printf '%s' "$body" | head -c 120)"; fail=$((fail+1))
  fi
}
assert_error_code "乱码 token" TOKEN_INVALID "$BASE/ai/models" -H "Authorization: Bearer garbage"
assert_error_code "无 Authorization 头" AUTH_MISSING "$BASE/ai/models"
assert_error_code "非 Bearer 格式" AUTH_MALFORMED "$BASE/ai/models" -H "Authorization: Token abc"
assert_error_code "?app= 指向不可用应用" APP_CONTEXT_INVALID "$BASE/ai/models?app=00000000-0000-4000-8000-000000000000" -H "Authorization: Bearer $PLAT_TOK"

echo
echo "结果：通过 $pass / 失败 $fail / 跳过 $skip"
[ "$fail" -eq 0 ]
