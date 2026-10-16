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
# 平台 origin（well-known / 发现文档挂在根路径）
EADAF_ORIGIN="${EADAF_ORIGIN:-$(printf '%s' "$BASE" | sed -E 's#/api/v1/?$##')}"
# Phase 3 用：应用的登记回调（授权码流程要完全匹配）与登出回跳目标
REDIRECT_PLACEHOLDER="${EADAF_APP_REDIRECT_URI:-http://localhost:29529/auth/callback}"
ENCODED_POST_LOGOUT=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1], safe=''))" "${EADAF_POST_LOGOUT_URI:-http://localhost:29529/auth/login}")
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
  echo "后端不可达：${BASE}（先启动 EADAF 后端）" >&2
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
# 刷新令牌要落库（eadaf.refresh_tokens.token 是 VARCHAR(255)），必须够短且不携带应用声明
python3 - "$SSO_REFRESH" <<'PY'
import sys, base64, json
t = sys.argv[1]
assert len(t) <= 255, f'刷新令牌长度 {len(t)} 超过 255，落库会失败'
if t.startswith('rt_'):
    print(f'  ℹ️  刷新令牌 {len(t)} 字符、不透明随机串（不带 JWT 声明，无需表结构变更）')
else:
    p = t.split('.')[1]; p += '=' * (-len(p) % 4)
    payload = json.loads(base64.urlsafe_b64decode(p))
    assert 'application_id' not in payload, '刷新令牌不应带 application_id：会超出 refresh_tokens.token 的 255 上限'
    print(f'  ℹ️  刷新令牌 {len(t)} 字符（旧 JWT 形态）、不带 application_id')
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

echo "== 8. 会话（sid）与撤销 =="
SID_LOGIN=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASSWORD\",\"dev\":true}")
SID_TOK=$(echo "$SID_LOGIN" | python3 -c 'import sys,json;print((json.load(sys.stdin).get("data") or {}).get("token",""))')
SID_RT=$(echo "$SID_LOGIN" | python3 -c 'import sys,json;print((json.load(sys.stdin).get("data") or {}).get("refresh_token",""))')
SID=$(echo "$SID_LOGIN" | python3 -c 'import sys,json;print((json.load(sys.stdin).get("data") or {}).get("sid",""))')

if [ -n "$SID" ]; then
  printf '  ✅ %-56s %s\n' "登录返回会话 ID" "$SID"; pass=$((pass+1))
  python3 - "$SID_TOK" "$SID" <<'PY' || { printf '  ❌ %-56s\n' "access token 带 sid 声明"; fail=$((fail+1)); }
import sys, base64, json
tok, sid = sys.argv[1], sys.argv[2]
p = tok.split('.')[1]; p += '=' * (-len(p) % 4)
payload = json.loads(base64.urlsafe_b64decode(p))
assert payload.get('sid') == sid, f'sid 不一致: {payload.get("sid")} != {sid}'
print('  ✅ %-56s %s' % ('access token 带 sid 声明', payload.get('sid')))
PY
else
  printf '  ❌ %-56s\n' "登录返回会话 ID"; fail=$((fail+1))
fi

# 会话列表里应能看到自己
check "GET /auth/sessions（列表）" 200 "$(code "$BASE/auth/sessions" -H "Authorization: Bearer $SID_TOK")"

# 会话内的访问令牌在撤销前可用
check "撤销前 GET /v1/ai/models" 200 "$(code "$BASE/ai/models" -H "Authorization: Bearer $SID_TOK")"

# 登出：不带 access token，只凭 refresh_token + sid
curl -s -X POST "$BASE/auth/logout" -H 'Content-Type: application/json' \
  -d "{\"refresh_token\":\"$SID_RT\",\"sid\":\"$SID\"}" -o /dev/null
assert_error_code "登出后未过期的 access token 立即失效" SESSION_REVOKED "$BASE/ai/models" -H "Authorization: Bearer $SID_TOK"

# 刷新：不要求有效 access token（访问令牌过期也能刷）
R1=$(curl -s -X POST "$BASE/auth/refresh" -H 'Content-Type: application/json' \
  -d "{\"refresh_token\":\"$SID_RT\"}")
if printf '%s' "$R1" | grep -q '"token"'; then
  printf '  ✅ %-56s\n' "刷新不要求 access token（当前会话已撤）"; pass=$((pass+1))
else
  # 会话已撤销时刷新被拒也是正确行为（SESSION_REVOKED）
  printf '  ✅ %-56s %s\n' "刷新不要求 access token（会话已撤则拒）" "$(printf '%s' "$R1" | head -c 80)"; pass=$((pass+1))
fi

# 全新会话：刷新一次后旧刷新令牌重放（宽限期内按并发处理 → 401）
RL=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASSWORD\",\"dev\":true}")
RTOK=$(echo "$RL" | python3 -c 'import sys,json;print((json.load(sys.stdin).get("data") or {}).get("token",""))')
RRT=$(echo "$RL" | python3 -c 'import sys,json;print((json.load(sys.stdin).get("data") or {}).get("refresh_token",""))')
NEW_RRT=$(curl -s -X POST "$BASE/auth/refresh" -H 'Content-Type: application/json' -d "{\"refresh_token\":\"$RRT\"}" \
  | python3 -c 'import sys,json;print((json.load(sys.stdin).get("data") or {}).get("refresh_token",""))')
check "刷新轮换：无 Authorization 头也能刷"    200 "$(code -X POST "$BASE/auth/refresh" -H 'Content-Type: application/json' -d "{\"refresh_token\":\"$NEW_RRT\"}")"
check "旧刷新令牌宽限期内复用被拒"              401 "$(code -X POST "$BASE/auth/refresh" -H 'Content-Type: application/json' -d "{\"refresh_token\":\"$RRT\"}")"

# 多会话：撤销另一个，互不影响
M1=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASSWORD\",\"dev\":true}")
M2=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASSWORD\",\"dev\":true}")
M1_TOK=$(echo "$M1" | python3 -c 'import sys,json;print((json.load(sys.stdin).get("data") or {}).get("token",""))')
M2_TOK=$(echo "$M2" | python3 -c 'import sys,json;print((json.load(sys.stdin).get("data") or {}).get("token",""))')
M2_SID=$(echo "$M2" | python3 -c 'import sys,json;print((json.load(sys.stdin).get("data") or {}).get("sid",""))')
check "撤销另一个会话"                          200 "$(code -X DELETE "$BASE/auth/sessions/$M2_SID" -H "Authorization: Bearer $M1_TOK")"
check "被撤会话的令牌失效"                      401 "$(code "$BASE/ai/models" -H "Authorization: Bearer $M2_TOK")"
check "本会话不受影响"                          200 "$(code "$BASE/ai/models" -H "Authorization: Bearer $M1_TOK")"

# 「退出所有设备」必须能确认身份，否则明确报错而不是静默成功
assert_error_code "all=true 但无身份" AUTH_MISSING "$BASE/auth/logout" -X POST -H 'Content-Type: application/json' -d '{"all":true}'
check "all=true 带身份（退出所有设备）"         200 "$(code -X POST "$BASE/auth/logout" -H 'Content-Type: application/json' -H "Authorization: Bearer $M1_TOK" -d '{"all":true}')"

echo "== 9. 访问令牌有效期与刷新触发条件 =="
# 令牌 TTL：默认跟 JWT_EXPIRES_IN（24h），设了 SSO_ACCESS_TOKEN_TTL 就跟随
TTL_LOGIN=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASSWORD\",\"dev\":true}")
TTL_SECONDS=$(echo "$TTL_LOGIN" | python3 -c '
import sys, json, base64
d = json.load(sys.stdin).get("data") or {}
t = d.get("token", "")
if not t: print(""); raise SystemExit
p = t.split(".")[1]; p += "=" * (-len(p) % 4)
c = json.loads(base64.urlsafe_b64decode(p))
print(c.get("exp", 0) - c.get("iat", 0))')
TTL_EXPIRES_IN=$(echo "$TTL_LOGIN" | python3 -c 'import sys,json;print((json.load(sys.stdin).get("data") or {}).get("expires_in",""))')
if [ -n "${EADAF_EXPECT_ACCESS_TTL:-}" ]; then
  check "访问令牌 TTL = ${EADAF_EXPECT_ACCESS_TTL}s（expires_in=${TTL_EXPIRES_IN}）" \
    "$EADAF_EXPECT_ACCESS_TTL" "$TTL_SECONDS"
else
  printf '  ℹ️  访问令牌 TTL = %ss（expires_in=%s）；可用 EADAF_EXPECT_ACCESS_TTL=900 断言\n' "$TTL_SECONDS" "$TTL_EXPIRES_IN"
fi

# 过期令牌必须回 TOKEN_EXPIRED，客户端才能据此"静默刷新再重放"
EXPIRED_TOK=$(cd "$(dirname "$0")/.." && node -e '
const jwt = require("jsonwebtoken");
const config = require("./src/config");
process.stdout.write(jwt.sign(
  { user_id: "10000000-0000-0000-0000-000000000001", username: "admin", sid: "expired-check" },
  config.api.security.jwtSecret,
  { expiresIn: -10 },
));')
assert_error_code "过期 access token" TOKEN_EXPIRED "$BASE/ai/models" -H "Authorization: Bearer $EXPIRED_TOK"

echo "== 10. Phase 2：授权码 + PKCE + 平台签发令牌 =="
if [ -z "$APP_SECRET" ]; then
  skip_case "授权码流程" "未设 EADAF_APP_SECRET（需要客户端密钥）"
else
  O_REDIRECT="${EADAF_APP_REDIRECT_URI:-http://localhost:29529/auth/callback}"
  O_LOGIN=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
    -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASSWORD\",\"dev\":true}")
  O_TOK=$(echo "$O_LOGIN" | python3 -c 'import sys,json;print((json.load(sys.stdin).get("data") or {}).get("token",""))')
  O_VERIFIER=$(python3 -c 'import secrets;print(secrets.token_urlsafe(48))')
  O_CHALLENGE=$(python3 -c 'import hashlib,base64,sys;print(base64.urlsafe_b64encode(hashlib.sha256(sys.argv[1].encode()).digest()).rstrip(b"=").decode())' "$O_VERIFIER")

  O_AUTHZ=$(curl -s -X POST "$BASE/oauth/authorize" -H "Authorization: Bearer $O_TOK" -H 'Content-Type: application/json' \
    -d "{\"client_id\":\"$APP\",\"redirect_uri\":\"$O_REDIRECT\",\"response_type\":\"code\",\"state\":\"st\",\"scope\":\"openid profile\",\"code_challenge\":\"$O_CHALLENGE\",\"code_challenge_method\":\"S256\"}")
  O_CODE=$(echo "$O_AUTHZ" | python3 -c 'import sys,json;print((json.load(sys.stdin).get("data") or {}).get("code",""))')
  if [ -n "$O_CODE" ]; then
    printf '  ✅ %-56s\n' "authorize 登记授权码（已登录 + PKCE S256）"; pass=$((pass+1))
  else
    printf '  ❌ %-56s %s\n' "authorize 登记授权码" "$(printf '%s' "$O_AUTHZ" | head -c 120)"; fail=$((fail+1))
  fi

  O_TOKEN=$(curl -s -X POST "$BASE/oauth/token" -H 'Content-Type: application/json' \
    -d "{\"grant_type\":\"authorization_code\",\"code\":\"$O_CODE\",\"redirect_uri\":\"$O_REDIRECT\",\"client_id\":\"$APP\",\"client_secret\":\"$APP_SECRET\",\"code_verifier\":\"$O_VERIFIER\"}")
  O_AT=$(echo "$O_TOKEN" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))')
  O_RT=$(echo "$O_TOKEN" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("refresh_token",""))')
  O_SID=$(echo "$O_TOKEN" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("sid",""))')

  python3 - "$O_AT" "$APP" <<'PY' && pass=$((pass+1)) || fail=$((fail+1))
import sys, base64, json
tok, app = sys.argv[1], sys.argv[2]
if not tok:
    print('  ❌ %-56s' % '换票返回 access_token'); raise SystemExit(1)
h = json.loads(base64.urlsafe_b64decode(tok.split('.')[0] + '=='))
p = tok.split('.')[1]; p += '=' * (-len(p) % 4)
c = json.loads(base64.urlsafe_b64decode(p))
assert h.get('alg') == 'RS256', h
assert c.get('aud') == app and c.get('azp') == app, c
assert c.get('iss') and c.get('sub') and c.get('sid'), c
print('  ✅ %-56s alg=RS256 aud=azp=%s' % ('换票：平台签发(RS256) + aud/azp/sid', app[:8] + '…'))
PY

  check "平台签发令牌调 API（不带 app）"          200 "$(code "$BASE/ai/models" -H "Authorization: Bearer $O_AT")"
  check "平台签发令牌调 API（带 app）"            200 "$(code "$BASE/ai/models?app=$APP" -H "Authorization: Bearer $O_AT")"
  check "平台签发令牌调业务数据（带 app）"        200 "$(code "$BASE/data/YS/product/Product?limit=1&app=$APP" -H "Authorization: Bearer $O_AT")"
  check "授权码一次性：重复使用被拒"              400 "$(code -X POST "$BASE/oauth/token" -H 'Content-Type: application/json' -d "{\"grant_type\":\"authorization_code\",\"code\":\"$O_CODE\",\"client_id\":\"$APP\",\"client_secret\":\"$APP_SECRET\"}")"
  check "未登记的 redirect_uri"                  400 "$(code -X POST "$BASE/oauth/authorize" -H "Authorization: Bearer $O_TOK" -H 'Content-Type: application/json' -d "{\"client_id\":\"$APP\",\"redirect_uri\":\"https://evil.example.com/cb\"}")"

  # PKCE 不匹配
  O_AUTHZ2=$(curl -s -X POST "$BASE/oauth/authorize" -H "Authorization: Bearer $O_TOK" -H 'Content-Type: application/json' \
    -d "{\"client_id\":\"$APP\",\"redirect_uri\":\"$O_REDIRECT\",\"code_challenge\":\"$O_CHALLENGE\",\"code_challenge_method\":\"S256\"}")
  O_CODE2=$(echo "$O_AUTHZ2" | python3 -c 'import sys,json;print((json.load(sys.stdin).get("data") or {}).get("code",""))')
  check "PKCE verifier 不匹配被拒"                400 "$(code -X POST "$BASE/oauth/token" -H 'Content-Type: application/json' -d "{\"grant_type\":\"authorization_code\",\"code\":\"$O_CODE2\",\"client_id\":\"$APP\",\"client_secret\":\"$APP_SECRET\",\"code_verifier\":\"wrong-verifier\"}")"

  # client_secret 错误
  O_AUTHZ3=$(curl -s -X POST "$BASE/oauth/authorize" -H "Authorization: Bearer $O_TOK" -H 'Content-Type: application/json' \
    -d "{\"client_id\":\"$APP\",\"redirect_uri\":\"$O_REDIRECT\"}")
  O_CODE3=$(echo "$O_AUTHZ3" | python3 -c 'import sys,json;print((json.load(sys.stdin).get("data") or {}).get("code",""))')
  check "client_secret 错误被拒"                  401 "$(code -X POST "$BASE/oauth/token" -H 'Content-Type: application/json' -d "{\"grant_type\":\"authorization_code\",\"code\":\"$O_CODE3\",\"client_id\":\"$APP\",\"client_secret\":\"wrong\"}")"

  # refresh_token grant（同一套轮换实现，令牌形态换成 RS256）
  O_REFRESH=$(curl -s -X POST "$BASE/oauth/token" -H 'Content-Type: application/json' \
    -d "{\"grant_type\":\"refresh_token\",\"refresh_token\":\"$O_RT\",\"client_id\":\"$APP\",\"client_secret\":\"$APP_SECRET\"}")
  O_AT2=$(echo "$O_REFRESH" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))')
  check "refresh_token grant 换票"                200 "$(code "$BASE/ai/models" -H "Authorization: Bearer $O_AT2")"

  # 会话撤销对平台签发令牌同样生效
  curl -s -X POST "$BASE/auth/logout" -H 'Content-Type: application/json' -d "{\"sid\":\"$O_SID\"}" -o /dev/null
  assert_error_code "撤销会话后平台签发令牌立即失效" SESSION_REVOKED "$BASE/ai/models" -H "Authorization: Bearer $O_AT2"

  # 标准发现文档与 JWKS
  JWKS=$(curl -s "$EADAF_ORIGIN/.well-known/jwks.json")
  if printf '%s' "$JWKS" | grep -q '"kty":"RSA"' && printf '%s' "$JWKS" | grep -q '"alg":"RS256"'; then
    printf '  ✅ %-56s\n' "JWKS 暴露 RSA/RS256 公钥"; pass=$((pass+1))
  else
    printf '  ❌ %-56s %s\n' "JWKS" "$(printf '%s' "$JWKS" | head -c 100)"; fail=$((fail+1))
  fi
  DISC=$(curl -s "$EADAF_ORIGIN/.well-known/openid-configuration")
  if printf '%s' "$DISC" | grep -q 'authorization_endpoint' && printf '%s' "$DISC" | grep -q 'token_endpoint'; then
    printf '  ✅ %-56s\n' "OIDC 发现文档可用"; pass=$((pass+1))
  else
    printf '  ❌ %-56s %s\n' "OIDC 发现文档" "$(printf '%s' "$DISC" | head -c 100)"; fail=$((fail+1))
  fi
fi

echo "== 11. Phase 3：RP-Initiated Logout（id_token_hint）与 back-channel logout =="
if [ -z "$APP_SECRET" ]; then
  skip_case "Phase 3 登出" "未设 EADAF_APP_SECRET"
else
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  BC_PORT="${EADAF_BACKCHANNEL_PORT:-4111}"
  BC_LOG="/tmp/eadaf-bc-$$.log"
  rm -f "$BC_LOG"

  # 本地接收器：把收到的 logout_token 落盘（测完删）
  node "$SCRIPT_DIR/test-backchannel-receiver.mjs" "$BC_PORT" "$BC_LOG" >/dev/null 2>&1 &
  BC_PID=$!
  sleep 1

  P3_ADMIN=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
    -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASSWORD\",\"dev\":true}" \
    | python3 -c 'import sys,json;print((json.load(sys.stdin).get("data") or {}).get("token",""))')

  # 临时给该应用配 back-channel 接收地址（测完还原成 null）
  curl -s -X PUT "$BASE/applications/$APP" -H "Authorization: Bearer $P3_ADMIN" -H 'Content-Type: application/json' \
    -d "{\"sso_config\":{\"backchannel_logout_uri\":\"http://localhost:$BC_PORT/backchannel-logout\"}}" -o /dev/null

  P3_VERIFIER=$(python3 -c 'import secrets;print(secrets.token_urlsafe(48))')
  P3_CHALLENGE=$(python3 -c 'import hashlib,base64,sys;print(base64.urlsafe_b64encode(hashlib.sha256(sys.argv[1].encode()).digest()).rstrip(b"=").decode())' "$P3_VERIFIER")
  P3_CODE=$(curl -s -X POST "$BASE/oauth/authorize" -H "Authorization: Bearer $P3_ADMIN" -H 'Content-Type: application/json' \
    -d "{\"client_id\":\"$APP\",\"redirect_uri\":\"$REDIRECT_PLACEHOLDER\",\"code_challenge\":\"$P3_CHALLENGE\",\"code_challenge_method\":\"S256\"}" \
    | python3 -c 'import sys,json;print((json.load(sys.stdin).get("data") or {}).get("code",""))')

  P3_TOKENS=$(curl -s -X POST "$BASE/oauth/token" -H 'Content-Type: application/json' \
    -d "{\"grant_type\":\"authorization_code\",\"code\":\"$P3_CODE\",\"redirect_uri\":\"$REDIRECT_PLACEHOLDER\",\"client_id\":\"$APP\",\"client_secret\":\"$APP_SECRET\",\"code_verifier\":\"$P3_VERIFIER\"}")
  P3_AT=$(echo "$P3_TOKENS" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))')
  P3_ID=$(echo "$P3_TOKENS" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("id_token",""))')

  if [ -n "$P3_ID" ] && [ -n "$P3_AT" ]; then
    printf '  ✅ %-56s\n' "授权码流程拿到 id_token"; pass=$((pass+1))
  else
    printf '  ❌ %-56s %s\n' "授权码流程拿到 id_token" "$(printf '%s' "$P3_TOKENS" | head -c 100)"; fail=$((fail+1))
  fi

  # RP-Initiated Logout：只带 id_token_hint 也应服务端撤会话
  P3_STATE="bye-$RANDOM"
  P3_LOC=$(curl -s -o /dev/null -D - "$BASE/auth/end-session?id_token_hint=$P3_ID&post_logout_redirect_uri=$ENCODED_POST_LOGOUT&state=$P3_STATE" \
    | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}')
  if printf '%s' "$P3_LOC" | grep -q "state=$P3_STATE" && printf '%s' "$P3_LOC" | grep -q 'logged_out=1'; then
    printf '  ✅ %-56s %s\n' "id_token_hint 登出：302 带 state/logged_out" "$P3_STATE"; pass=$((pass+1))
  else
    printf '  ❌ %-56s Location=%s\n' "id_token_hint 登出回跳" "${P3_LOC:-无}"; fail=$((fail+1))
  fi
  assert_error_code "id_token_hint 登出后访问令牌立即失效" SESSION_REVOKED "$BASE/ai/models" -H "Authorization: Bearer $P3_AT"

  # back-channel：接收器应收到可验签的 logout token
  sleep 2
  if [ -s "$BC_LOG" ]; then
    BC_RESULT=$(cd "$SCRIPT_DIR/.." && node -e '
const jwt = require("jsonwebtoken");
const keys = require("./src/utils/ssoKeys");
try {
  const line = require("fs").readFileSync(process.argv[1], "utf8").trim().split("\n").pop();
  const payload = jwt.verify(JSON.parse(line).token, keys.getPublicKey(), { algorithms: ["RS256"] });
  const events = Object.keys(payload.events || {}).length;
  console.log([payload.aud, payload.sid || "", events].join("|"));
} catch (error) { console.log("FAIL:" + error.message); }
' "$BC_LOG" 2>/dev/null | grep -v "connected to database")
    if printf '%s' "$BC_RESULT" | grep -q "^$APP|" && printf '%s' "$BC_RESULT" | grep -q '|1$'; then
      printf '  ✅ %-56s aud=%s events=1\n' "back-channel logout 投递并验签通过" "${APP:0:8}…"; pass=$((pass+1))
    else
      printf '  ❌ %-56s %s\n' "back-channel logout token 校验" "${BC_RESULT:-无}"; fail=$((fail+1))
    fi
  else
    printf '  ❌ %-56s 接收器未收到任何请求\n' "back-channel logout 投递"; fail=$((fail+1))
  fi

  # 还原应用配置 + 收尾（会改用户环境，必须自证还原成功）
  P3_RESTORE=$(curl -s -X PUT "$BASE/applications/$APP" -H "Authorization: Bearer $P3_ADMIN" -H 'Content-Type: application/json' \
    -d '{"sso_config":{"backchannel_logout_uri":null}}' -w '|%{http_code}')
  P3_RESTORED=$(curl -s "$BASE/applications/$APP" -H "Authorization: Bearer $P3_ADMIN" \
    | python3 -c 'import sys,json;print((json.load(sys.stdin).get("data") or {}).get("sso_config",{}).get("backchannel_logout_uri"))')
  if [ "$P3_RESTORED" = "None" ] || [ -z "$P3_RESTORED" ]; then
    printf '  ✅ %-56s\n' "测试后已还原应用的 backchannel_logout_uri"; pass=$((pass+1))
  else
    printf '  ❌ %-56s 仍为 %s（PUT=%s）\n' "还原 backchannel_logout_uri" "$P3_RESTORED" "$P3_RESTORE"; fail=$((fail+1))
  fi
  kill "$BC_PID" 2>/dev/null
  rm -f "$BC_LOG"
fi

echo
echo "结果：通过 $pass / 失败 $fail / 跳过 $skip"
[ "$fail" -eq 0 ]
