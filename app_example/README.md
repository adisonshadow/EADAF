# app_example —— 雨伞品牌厂商 · 电商独立站销售管理系统（EADAF 业务应用示例）

> 一句话：业务系统**只写前端页面**；账号、权限、数据、AI 能力全部复用 **EADAF 平台（`/backend`）**。
> 示例应用没有自己的后端、没有自己的数据库。

- 业务域：雨伞品牌 DTC 独立站 —— 伞品（长柄/折叠/高尔夫/广告/儿童伞）、会员、订单、售后工单
- 前端：React 19 + antd 6 + Vite，5 个页面（经营概览 / 伞品管理 / 独立站订单 / 会员 / 售后工单）
- AI：右侧 AI 助手来自 `@eadaf/ai-base`（源码在 [`package/ai-base`](../package/ai-base)），
  通过 EADAF 的 Skill / Tool 查询同一份业务数据；页面上点 `@` 可把订单/会员加进引用再提问

---

## 1. 复用了 EADAF `/backend` 的什么

示例应用的所有数据都来自平台后端已内置的 **销售 Demo** 模块（`/api/v1/demo/sales/*`），
数据源是 `backend/data/sales-demo.db`（SQLite），**前端与 AI Tool 共用同一份数据**：

| 页面 | 复用的 EADAF 接口 | 说明 |
|------|-------------------|------|
| 经营概览 | `GET /api/v1/demo/sales/stats/orders`、`GET .../stats/complaints` | 订单/销售额/发货/售后 KPI 与分布 |
| 伞品管理 | `GET /api/v1/demo/sales/products` | 20 款伞品（5 个品类，含库存） |
| 独立站订单 | `GET /api/v1/demo/sales/orders`、`GET .../orders/{orderNo}` | 60 笔订单 + 明细（含会员信息） |
| 会员 | `GET /api/v1/demo/sales/users` | 20 位会员（金牌/普通），订单数与消费在前端汇总 |
| 售后工单 | `GET /api/v1/demo/sales/complaints` | 质量 / 物流 / 服务 / 退款工单 |
| 登录 | `GET /api/v1/auth/check` + EADAF SSO | 账号与权限由平台 UAC 统一管理，示例不存密码 |
| AI 助手 | `POST /api/v1/ai/chat/completions`（经 ai-base） | 走平台 Skill/Tool，可查询上表同一份数据 |

接口封装集中在 [`src/pages/store/storeApi.ts`](src/pages/store/storeApi.ts)，页面里没有别的数据来源。

## 2. 和真实业务应用（CIAC-MS / FPCU2 等）的关系

参考项目 `D:\DEV\admin803`（CIAC-MS，刑侦现场三维云计算中心）的架构是：

```
frontend（Vite + antd 管理端） → backend（Express BFF：SSO 换票 + 实体代理） → EADAF（用户/权限/业务实体/数据）
```

本示例是它的**最小化版本**：为突出「能复用的都复用」，刻意省掉 BFF ——
前端直接调用 EADAF 的接口（开发环境经 Vite proxy 到 `29526`）。
真实应用需要独立域名、独立镜像、对外 API 时，再按 [docs/pack-and-deploy.md](../docs/pack-and-deploy.md)
用 `pnpm pack:app` 打成应用包（`eadaf.app.yaml` + 镜像 + 注册 SQL）。

## 3. 本地运行

前置：EADAF 平台已在跑（`pnpm dev`，管理端 `http://localhost:29527`，后端 `http://localhost:29526`）。

```bash
# 1) 装依赖（仓库根目录）
pnpm install

# 2) 初始化销售 Demo 数据（雨伞示例数据：20 会员 / 20 伞品 / 60 订单 / 10 售后工单）
pnpm --filter ./backend init-sales-demo-db

# 3) 启动示例应用（http://localhost:29529）
pnpm --filter ./app_example dev
```

首次使用还需在 EADAF 管理台准备两件事（一次性）：

1. **注册应用**：SSO 回调填 `http://localhost:29529/auth/callback`，应用 ID 填到
   `VITE_SSO_APPLICATION_ID`（默认值就是仓库里一直在用的示例应用 ID）。
2. **准备 AI Scope**：示例默认用 `sales-demo`（`VITE_DEMO_SCOPE_SLUG`），平台已带对应的订单/售后 Skill 与 Tool。

环境变量见 [`.env.example`](.env.example)：`cp .env.example .env.development` 后按需修改。

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
│   ├── auth/                 # EADAF SSO：登录页 / 回调 / 鉴权门（token 存 localStorage）
│   ├── layout/AppShell.tsx   # 顶栏 + 侧边菜单（有意保持极简）
│   ├── pages/store/          # 业务页：概览 / 伞品 / 订单 / 会员 / 售后 + storeApi.ts
│   ├── components/           # ChatReferenceTarget：把业务对象加进 AI 引用
│   └── App.tsx               # AIChatProvider + 路由
├── scripts/                  # 销售 Demo 种子 SQL 与生成器
└── vite.config.ts            # 端口 29529；/api 代理到 EADAF 后端；直连 ai-base 源码（HMR）
```

## 6. 有意不做的事（保持「简单」）

- 不自建后端 / BFF，不建业务库，不做数据同步；
- 不做复杂权限菜单、工作流、报表导出（真实项目再按需加，参考 CIAC-MS）；
- 页面只做「看数据 + 少量筛选 + 明细」，更深的分析交给 AI 助手（点 `@` 引用后直接提问）。
