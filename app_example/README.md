# app_example —— 雨伞品牌厂商 · 电商独立站销售管理系统（EADAF 业务应用示例）

> 一句话：业务系统**只写前端页面**；账号、权限、数据、AI 能力全部复用 **EADAF 平台（`/backend`）**。
> 示例应用只有一个极简 **BFF**（`server/index.mjs`，零依赖）：负责 SSO 换票与
> `/api` 代理，令牌只落服务端；没有自己的数据库。

- 业务域：雨伞品牌 DTC 独立站 —— 伞品（长柄/折叠/高尔夫/广告/儿童伞）、会员、订单、售后工单
- 前端：React 19 + antd 6 + Vite，5 个页面（经营概览 / 伞品管理 / 独立站订单 / 会员 / 售后工单）
- AI：右侧 AI 助手来自 `@eadaf/ai-base`（源码在 [`package/ai-base`](../package/ai-base)），
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

| 页面 | 调用的 EADAF API 服务 | 说明 |
|------|----------------------|------|
| 经营概览 | `GET /api/v1/data/YS/order/Order`、`.../service/Complaint` | 订单/销售额/发货/售后 KPI 与分布（示例量小，前端汇总） |
| 伞品管理 | `GET /api/v1/data/YS/product/Product` | 20 款伞品（5 个品类，含库存） |
| 独立站订单 | `GET /api/v1/data/YS/order/Order`、`.../Order/one?order_no=`、`.../OrderItem?order_id=` | 60 笔订单 + 明细 |
| 会员 | `GET /api/v1/data/YS/member/Member` | 20 位会员（金牌/普通），订单数与消费在前端汇总 |
| 售后工单 | `GET /api/v1/data/YS/service/Complaint` | 质量 / 物流 / 服务 / 退款工单 |
| 登录 | 授权码 + PKCE（BFF 换票）→ 服务端会话 | 账号与权限由平台 UAC 统一管理，示例不存密码；浏览器不接触令牌 |
| AI 助手 | `POST /api/v1/ai/chat/completions`（经 ai-base） | 走平台 Skill/Tool |

**模型域**：实体 code 前缀 `YS:`（与应用的 AI Scope slug 一致），物化目标是默认连接
（本地 MySQL 13306）的 `bizdata_mat`，物理表名 `ys_*`。响应信封统一为
`{ items, pagination: { total, page, pageSize } }`。

接口封装集中在 [`src/pages/store/storeApi.ts`](src/pages/store/storeApi.ts)，页面里没有别的数据来源；
跨实体的关联（订单→会员、明细→伞品）在 `storeApi.ts` 里用 memo 缓存做，真实项目应在 API 服务里 join/聚合。

> ⚠️ **AI 助手的数据源还没切过来**：平台的 Skill/Tool 目前仍读旧的 SQLite 演示库
> （`backend/data/sales-demo.db`），与页面读的物化表是两份数据。把 Tool 指到上面的
> API 服务是待办项（见根目录 `docs/pack-and-deploy.md` 与业务数据 Scope 配置）。


## 2. 和真实业务应用（CIAC-MS / FPCU2 等）的关系

参考项目 `D:\DEV\admin803`（CIAC-MS，刑侦现场三维云计算中心）的架构是：

```
frontend（Vite + antd 管理端） → backend（Express BFF：SSO 换票 + 实体代理） → EADAF（用户/权限/业务实体/数据）
```

本示例是它的**最小化版本**，但保留了 BFF 这一层（[`server/index.mjs`](server/index.mjs)）：
它只做两件事 —— **SSO 换票**（授权码 + PKCE，令牌只落服务端）与 **`/api` 代理**
（带令牌转发、过期自动刷新）。开发时 Vite 把 `/auth`、`/api` 都代理给它，
浏览器只面对一个源和一枚 httpOnly 会话 Cookie。

真正省掉的是"业务后端"：数据、权限、AI 全部复用 EADAF，示例不建库、不写业务逻辑。
真实应用需要独立域名、独立镜像、对外 API 时，再按 [docs/pack-and-deploy.md](../docs/pack-and-deploy.md)
用 `pnpm pack:app` 打成应用包（`eadaf.app.yaml` + 镜像 + 注册 SQL）。
接法说明与可独立运行的模板见 [docs/sso-bff-template](../docs/sso-bff-template/README.md)。

## 3. 本地运行

前置：EADAF 平台已在跑（`pnpm dev`，管理端 `http://localhost:29527`，后端 `http://localhost:29526`）。

```bash
# 1) 装依赖（仓库根目录）
pnpm install

# 2) 初始化销售 Demo 数据（雨伞示例数据：20 会员 / 20 伞品 / 60 订单 / 10 售后工单）
pnpm --filter ./backend init-sales-demo-db

# 3) 在 EADAF 上自举：建桶 + 数据模型 + 物化 + API 服务（幂等）
node app_example/scripts/eadaf/provision.mjs

# 4) 把演示数据灌进物化表
EADAF_MYSQL_CMD='docker exec -i mysql-local sh -c '"'"'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" bizdata_mat'"'"'' \
  node app_example/scripts/eadaf/load-data.mjs

# 5) 启动示例应用（前端 http://localhost:29529 + BFF http://localhost:29530）
pnpm --filter ./app_example dev:all     # 同时起 BFF 与 Vite
# 或分开起：
#   pnpm --filter ./app_example dev:bff
#   pnpm --filter ./app_example dev
```

> 第 3、4 步的细节、前置条件与可调环境变量见
> [`scripts/eadaf/README.md`](scripts/eadaf/README.md)。建完可在管理台
> **业务数据 → 模型设计** 看到 `YS` 域、**物化** 看到运行记录、**API 服务** 看到 5 个服务。

首次使用还需在 EADAF 管理台准备两件事（一次性）：

1. **注册应用**：SSO 回调填 `http://localhost:29529/auth/callback`，应用 ID 填到
   `VITE_SSO_APPLICATION_ID`（默认值就是仓库里一直在用的示例应用 ID）。
2. **准备 AI Scope**：示例默认用 `sales-demo`（`VITE_DEMO_SCOPE_SLUG`），平台已带对应的订单/售后 Skill 与 Tool。

环境变量见 [`.env`](.env)：已随仓库提供示例默认值，直接改，或另建 `.env.local` 覆盖（已忽略）。

## 4. 示例数据怎么来的

- 种子 SQL：[`scripts/sales-demo-db.sql`](scripts/sales-demo-db.sql)
  —— 雨伞品类/会员/订单/售后，金额自洽（每笔订单 `total_amount` = 明细 `unit_price × quantity` 之和）
- 生成器：[`scripts/gen-sales-demo-sql.cjs`](scripts/gen-sales-demo-sql.cjs)
  → `pnpm --filter ./app_example gen:sales-demo` 重新生成 SQL（固定随机种子，结果可复现）
- 载入：`backend/scripts/init-sales-demo-db.js`（读上面的 SQL，写到 `backend/data/sales-demo.db`）

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
└── vite.config.ts            # 端口 29529；/auth 与 /api 代理到 BFF；直连 ai-base 源码（HMR）
```

## 6. 有意不做的事（保持「简单」）

- 不自建**业务**后端（BFF 只做换票与代理）、不建业务库、不做数据同步；
- 不做复杂权限菜单、工作流、报表导出（真实项目再按需加，参考 CIAC-MS）；
- 页面只做「看数据 + 少量筛选 + 明细」，更深的分析交给 AI 助手（点 `@` 引用后直接提问）。
