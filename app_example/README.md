# app_example —— 雨伞品牌厂商 · 电商独立站销售管理系统（EADAF 业务应用示例）

> 一句话：业务系统**只写前端页面**；账号、权限、数据、AI 能力全部复用 **EADAF 平台（**`/backend`**）**。
> 示例应用只有一个极简 **BFF**（`server/index.mjs`，零依赖）：负责 SSO 换票与
> `/api` 代理，令牌只落服务端；没有自己的数据库。

- 业务域：雨伞品牌 DTC 独立站 —— 伞品（长柄/折叠/高尔夫/广告/儿童伞）、会员、订单、售后工单
- 前端：React 19 + antd 6 + Vite，5 个页面（经营概览 / 伞品管理 / 独立站订单 / 会员 / 售后工单）
- AI：右侧 AI 助手来自 `@eadaf/ai-base`（源码在 `[package/ai-base](../package/ai-base)`），
通过 EADAF 的 Skill / Tool 查询同一份业务数据；页面上点 `@` 可把订单/会员加进引用再提问

---

## 1. 复用了 EADAF 的什么

示例应用的**数据模型、物化表、API 服务全部由 EADAF 生成**，前端只调这些服务：

```
EADAF 管理台「业务数据」                     运行时
────────────────────────────                ────────────────────────────────
模型设计   YS:member:Member  ┐              物化表 bizdata_mat.ys_member ┐
          YS:product:Product ┤              物化表 …ys_product            │
          YS:order:Order     ├─ 物化 ──▶   物化表 …ys_order              ├─▶ API 服务
          YS:order:OrderItem ┤              物化表 …ys_order_item         │   /api/v1/data/YS/…
          YS:service:Complaint┘             物化表 …ys_complaint          ┘
```


| 页面    | 调用的 EADAF API 服务                                                                      | 说明                                |
| ----- | ------------------------------------------------------------------------------------- | --------------------------------- |
| 经营概览  | `GET /api/v1/data/YS/order/Order`、`.../service/Complaint`                             | 订单/销售额/发货/售后 KPI 与分布（示例量小，前端汇总）   |
| 伞品管理  | `GET /api/v1/data/YS/product/Product`                                                 | 20 款伞品（5 个品类，含库存）                 |
| 独立站订单 | `GET /api/v1/data/YS/order/Order`、`.../Order/one?order_no=`、`.../OrderItem?order_id=` | 60 笔订单 + 明细                       |
| 会员    | `GET /api/v1/data/YS/member/Member`                                                   | 20 位会员（金牌/普通），订单数与消费在前端汇总         |
| 售后工单  | `GET /api/v1/data/YS/service/Complaint`                                               | 质量 / 物流 / 服务 / 退款工单               |
| 登录    | 授权码 + PKCE（BFF 换票）→ 服务端会话                                                             | 账号与权限由平台统一管理，示例不存密码；浏览器不接触令牌 |
| AI 助手 | `POST /api/v1/ai/chat/completions`（经 ai-base）                                         | 走平台 Skill/Tool                    |


**模型域**：实体 code 前缀 `YS:`（与应用的 AI Scope slug 一致），物化目标是默认连接
（本地 MySQL 13306）的 `bizdata_mat`，物理表名 `ys_*`。响应信封统一为
`{ items, pagination: { total, page, pageSize } }`。

接口封装集中在 `[src/pages/store/storeApi.ts](src/pages/store/storeApi.ts)`，页面里没有别的数据来源；
跨实体的关联（订单→会员、明细→伞品）在 `storeApi.ts` 里用 memo 缓存做，真实项目应在 API 服务里 join/聚合。

**AI 助手读的也是这批物化表**：`sales-`* 系列 Tool（订单统计/搜索订单/投诉列表…）由后端
`[salesDataService.js](../backend/src/services/demo/salesDataService.js)` 直连 `bizdata_mat.ys_*`，
与页面/API 服务**同源同内容**，不再有本地 SQLite 演示库。可用自检脚本核对两侧是否一致：

```bash
node backend/scripts/verify-sales-tools-materialized.js
```



## 2. 和真实业务应用（CIAC-MS / FPCU2 等）的关系

参考项目 `D:\DEV\admin803`（CIAC-MS，刑侦现场三维云计算中心）的架构是：

```
frontend（Vite + antd 管理端） → backend（Express BFF：SSO 换票 + 实体代理） → EADAF（用户/权限/业务实体/数据）
```

本示例是它的**最小化版本**，但保留了 BFF 这一层（`[server/index.mjs](server/index.mjs)`）：
它只做两件事 —— **SSO 换票**（授权码 + PKCE，令牌只落服务端）与 `/api` **代理**
（带令牌转发、过期自动刷新）。开发时 Vite 把 `/auth`、`/api` 都代理给它，
浏览器只面对一个源和一枚 httpOnly 会话 Cookie。

真正省掉的是"业务后端"：数据、权限、AI 全部复用 EADAF，示例不建库、不写业务逻辑。
真实应用需要独立域名、独立镜像、对外 API 时，再按 [docs/pack-and-deploy.md](../docs/pack-and-deploy.md)
用 `pnpm pack:app` 打成**部署包**（`eadaf.app.yaml` + 镜像 + 注册 SQL）。
接法说明与可独立运行的模板见 [docs/sso-bff-template](../docs/sso-bff-template/README.md)。

## 3. 本地运行

前置：EADAF 平台已在跑（`pnpm dev`：管理端 `http://localhost:29527`、后端 `http://localhost:29526`），
且 Postgres / MySQL / MinIO 已启动。

### 3.1 初始化（推荐）：导入应用数据包

初始化 = **导入一个应用数据包**（管理台「应用数据导出/导入」产出的 zip）。它一次性把
"建应用 / 建模型 / 物化建表 / 建 API 服务 / 灌业务数据 / 导用户与权限 / 传文件"全部做完，
不需要跑任何脚本，也不需要手工建模型。

```bash
# 1) 装依赖（仓库根目录）
pnpm install

# 2) 导入数据包：管理台 → 应用部署 → 应用数据导出/导入 → 选择 .zip → 自动预览 → 开始导入
#    （预览不写库；确认无误再导入。同一实例可重复导入覆盖，重跑是安全的）

# 3) 启动示例应用：BFF(http://localhost:29530) + 前端(http://localhost:29529) 一起起
pnpm --filter ./app_example dev
#    只想单独起其中一个：
#    pnpm --filter ./app_example dev:web   # 仅 vite（需自己另外跑 dev:bff）
#    pnpm --filter ./app_example dev:bff   # 仅 BFF
```

> 只跑 `vite`（`dev:web`）而不跑 BFF 时，浏览器里的 `/auth/*`、`/api/*` 会全部
> `ECONNREFUSED` —— 前端不再直连 EADAF，这两类请求都交给 BFF 转发。

数据包从哪来：本机导出过就放在 `app_example/eadaf-app-export-YS-*.zip`
（当前那份是 `eadaf-app-export-YS-20261016235555.zip`）。请打开EADAF，在 应用部署 > 应用数据导出/导入 中 将该zip文件拖入到上传区域，关闭 安全模式 可以更快应用 API，最后 提交 “按当前策略导入”。



导入后只需核对两点：

1. **应用 ID**：导入优先沿用源 `application_id`（`1e71c653-630f-4006-b6df-081172b15752`，
  即 `[.env](.env)` 里 `VITE_SSO_APPLICATION_ID` 的默认值）。若目标实例已有同 code 但 ID 不同的
   应用，导入结果里会给出提示 —— 以实际 ID 为准更新 `.env`；
2. **SSO 回调**：应用详情的 SSO 配置里 `redirect_uri` 应是 `http://localhost:29529/auth/callback`
  （BFF 默认就用这个地址；换端口/域名时，要同时改应用配置与 BFF 的 `REDIRECT_URI`）。

没有管理台界面时也可以直接打接口（先预览、再导入）：

```bash
TOKEN=...   # 管理员令牌
ZIP=app_example/eadaf-app-export-YS-20261016235555.zip

curl -s -X POST http://localhost:29526/api/v1/system/app-transfer/preview \
  -H "Authorization: Bearer $TOKEN" -F file=@$ZIP | head -c 400      # 只解析，不写库

curl -s -X POST http://localhost:29526/api/v1/system/app-transfer/import \
  -H "Authorization: Bearer $TOKEN" -F file=@$ZIP -F strategy=overwrite | head -c 400
```

> ⚠️ 数据包含**用户密码哈希**与明文密钥/数据库口令等敏感信息：不要提交进仓库、不要外发。
> 这个 zip 随仓库提供，方便开箱导入。它包含**演示用的用户密码哈希与应用密钥**（仅供本示例）；
> 如果你的导出包含真实环境的凭据，请勿提交进仓库，改用本机传递。



### 3.2 初始化（可选）：从脚本自举

不用数据包时，按下面两步从零建起来（幂等，可重跑）：

```bash
# 1) 在 EADAF 上自举：建桶 + 数据模型 + 物化 + API 服务
node app_example/scripts/eadaf/provision.mjs

# 2) 把演示数据灌进物化表（直接解析 scripts/sales-demo-db.sql，不经过任何本地库）
EADAF_MYSQL_CMD='docker exec -i mysql-local sh -c '"'"'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" bizdata_mat'"'"'' \
  node app_example/scripts/eadaf/load-data.mjs
```

> 细节、前置条件与可调环境变量见 `[scripts/eadaf/README.md](scripts/eadaf/README.md)`。

两条路建完都可以在管理台核对：**业务数据 → 模型设计** 看到 `YS` 域、**物化** 有运行记录、
**API 服务** 有 5 个服务。

### 3.3 首次使用还需确认（一次性）

1. **应用与 SSO**：数据包已带应用本体（含 SSO 配置）。若是自己新建应用，回调填
  `http://localhost:29529/auth/callback`，并把应用 ID 填到 `VITE_SSO_APPLICATION_ID`；
2. **AI Scope（一般不用管）**：示例用 `VITE_DEMO_SCOPE_SLUG` 指定（默认 `YS`）。AI Scope /
  Skill / Tool 是**平台级**资源，不在应用数据包里（导出统计 `aiScopes: 0`）——
   先用平台自带配置即可，要定制再单独建。
3. **让 AI 知道业务 API 长什么样**（否则它只拿到 `http_request`，会一个个地址瞎试）：
   导入数据包后跑一次生成好的迁移，把「业务 API 手册」写进应用顶层 Skill：

   ```bash
   docker cp backend/scripts/migrate-ys-business-api-skill.sql EADAF-dev-postgres:/tmp/ys-skill.sql
   docker exec EADAF-dev-postgres psql -U my_name -d eadaf_db -v ON_ERROR_STOP=1 -f /tmp/ys-skill.sql
   ```

   生成 / 更新方式、修复前后对比与验收方法见
   [docs/app-api-skill/README.md](../docs/app-api-skill/README.md)（API 服务改动后重跑
   `node backend/scripts/gen-app-business-api-skill.js ...`）。

环境变量见 `[.env](.env)`：已随仓库提供示例默认值，直接改，或另建 `.env.local` 覆盖（已忽略）。

## 4. 示例数据怎么来的

**推荐路径**：直接导入应用数据包（§3.1）—— 包里的行数据就是下面种子 SQL 生成的那一批
（导出统计：20 会员 / 20 伞品 / 60 订单 / 118 明细 / 10 售后）。

**从零自举路径**（§3.2）用到三样东西：

- 种子 SQL：`[scripts/sales-demo-db.sql](scripts/sales-demo-db.sql)`
—— 雨伞品类/会员/订单/售后，金额自洽（每笔订单 `total_amount` = 明细 `unit_price × quantity` 之和）
- 生成器：`[scripts/gen-sales-demo-sql.cjs](scripts/gen-sales-demo-sql.cjs)`
→ `pnpm --filter ./app_example gen:sales-demo` 重新生成 SQL（固定随机种子，结果可复现）
- 载入：`[scripts/eadaf/load-data.mjs](scripts/eadaf/load-data.mjs)`
—— **直接解析上面的 SQL**，派生确定性 UUID 后 `REPLACE INTO` 物化表（不落地任何本地库）



## 5. 目录

```
app_example/
├── src/
│   ├── auth/                 # SSO 会话客户端：登录入口 / 鉴权门（浏览器不存令牌）
│   ├── layout/AppShell.tsx   # 顶栏 + 侧边菜单（有意保持极简）
│   ├── pages/store/          # 业务页：概览 / 伞品 / 订单 / 会员 / 售后 + storeApi.ts
│   ├── components/           # ChatReferenceTarget：把业务对象加进 AI 引用
│   └── App.tsx               # AIChatProvider + 路由
├── server/index.mjs          # BFF：授权码 + PKCE 换票、/api 代理（令牌只落服务端）
├── scripts/                  # 销售 Demo 种子 SQL 与生成器、dev:all 启动器
├── eadaf-app-export-YS-*.zip # 应用数据包（随仓库提供；含演示凭据，勿放真实密钥）→ §3.1
└── vite.config.ts            # 端口 29529；/auth 与 /api 代理到 BFF；直连 ai-base 源码（HMR）
```



## 6. 有意不做的事（保持「简单」）

- 不自建**业务**后端（BFF 只做换票与代理）、不建业务库、不做数据同步；
- 不做复杂权限菜单、工作流、报表导出（真实项目再按需加，参考 CIAC-MS）；
- 页面只做「看数据 + 少量筛选 + 明细」，更深的分析交给 AI 助手（点 `@` 引用后直接提问）。

