-- 雨伞品牌 · 电商独立站（YS）业务 API Skill —— 由 gen-app-business-api-skill.js 生成，勿手改
-- 幂等：可重复执行。作用：
--   1) 写入应用顶层 Skill（随「应用数据导出」一起走，所有页面常驻注入）
--   2) upsert 专用 Skill（AI 管理 → Skills 可见、可维护）
--   3) 绑定到本应用（capabilities 只把已绑定的专用 Skill 发给该应用）
--   4) 给该 Skill 挂 http_request（相对路径调用业务 API 的唯一工具）

BEGIN;

-- 1) 应用顶层 Skill
UPDATE eadaf.applications
   SET top_level_skill_markdown = $eadaf_ai$# 雨伞品牌 · 电商独立站（YS）业务 API 手册

> 生成时间 `2026-10-17T15:00:25.621Z`，来源 `GET /api/v1/applications-public/YS/api-catalog`（应用 ID `1e71c653-630f-4006-b6df-081172b15752`）。
> 本文件由 `backend/scripts/gen-app-business-api-skill.js` 生成：API 服务有变动就重跑脚本，**不要手改**（人工口径写在 notes 里）。

## 0. 四条铁律（先看这里，能省掉大部分试错）

1. **数据只有一个来源**：平台已发布的业务数据 API，前缀 `/api/v1/data/`。调用时**只写相对路径**，例如 `/api/v1/data/YS/member/Member?limit=5`。`http_request` 会自动把相对路径指向当前平台，并带上**当前登录用户**的身份；不要自己拼 `Authorization`。
2. **不要猜地址**：`localhost` / `127.0.0.1` / `192.168.x` / 其它端口、少了 `v1` 的 `/api/...`、`/api/v1/bizdata`、`/api/v1/business-data`、复数或驼峰路径（如 `/YS/orders`）、`/public/applications/...`（那是给人看的文档网页，不是接口）、GraphQL、直连数据库 —— 一律不要试。写成**绝对地址**（`http://host:29526/...`）反而不会带身份，只会拿到 401。
3. **服务只有下表这 5 个**，路径逐字照抄；表里没有的实体 / 接口一律不存在。
4. **判读响应**：`code === 200` 才有 `data`。列表 → `data.items` + `data.pagination`；单条 → `data.item`。HTTP 200 但 `code !== 200` 也算失败（典型：字段名写错）。

## 1. 服务总览

| 服务 | routePath（接在 `/api/v1/data/` 之后） | 记录字段 |
| --- | --- | --- |
| 会员 | `YS/member/Member` | `id` `name` `phone` `email` `city` `level` `created_at` |
| 订单 | `YS/order/Order` | `id` `order_no` `member_id` `status` `total_amount` `created_at` `shipped_at` |
| 订单明细 | `YS/order/OrderItem` | `id` `order_id` `product_id` `quantity` `unit_price` |
| 伞品 | `YS/product/Product` | `id` `sku` `name` `category` `price` `stock` |
| 售后工单 | `YS/service/Complaint` | `id` `order_id` `member_id` `type` `content` `status` `created_at` `resolved_at` |

## 2. 通用调用规则

### 2.1 列表查询 `find`

```http
GET /api/v1/data/{routePath}?limit=20&skip=0&filter={"字段":"值"}
```

- `limit` 1–100（默认 20）；`skip` ≥ 0 为偏移量
- 过滤三种写法等价：`filter={"字段":"值"}`、顶层 `?字段=值`、`?filter[字段]=值`；**只支持等值匹配**，值写 `null` 表示 IS NULL
- **不支持** `>` `<` `LIKE`、排序、分组、聚合：需要统计 / 排序 / Top-N 时，把数据取回（`limit` 最大 100，多页用 `skip`）在回答里算
- `data.pagination.total` 是命中总数；要全量就按 `skip += limit` 继续取，直到取满 `total`

### 2.2 单条

```http
GET /api/v1/data/{routePath}/one?filter={"业务键":"值"}   → data.item（没有则 null）
GET /api/v1/data/{routePath}/{uuid}                       → data.item
```

### 2.3 计数

`GET /api/v1/data/{routePath}?limit=1` 后读 `data.pagination.total`。**不要**调 `/count`：该 operation 当前被 `/{id}` 路由抢先匹配，会返回 uuid 解析错误。

## 3. 各服务细节

### 3.1 会员 `YS/member/Member`

雨伞独立站会员（EADAF 物化表 ys_member）；实体 `YS:member:Member`。

- 可用操作：`find`(GET)、`findOne`(GET /one)、`findById`(GET /:id)、`count`(GET /count)（`count` 不要直接调，见 §2.3 的替代写法）
- 字段：
  - `id`（string） — 主键
  - `name`（string） — 会员姓名
  - `phone?`（string）（可空） — 手机号
  - `email?`（string）（可空） — 邮箱
  - `city?`（string）（可空） — 城市
  - `level`（string） — 会员等级
  - `created_at`（string） — 注册时间

### 3.2 订单 `YS/order/Order`

雨伞独立站订单（EADAF 物化表 ys_order）；实体 `YS:order:Order`。

- 可用操作：`find`(GET)、`findOne`(GET /one)、`findById`(GET /:id)、`count`(GET /count)（`count` 不要直接调，见 §2.3 的替代写法）
- 字段：
  - `id`（string） — 主键
  - `order_no`（string） — 订单号
  - `member_id`（string） — 会员ID
  - `status`（string） — 订单状态
  - `total_amount`（number） — 订单金额
  - `created_at`（string） — 下单时间
  - `shipped_at?`（string）（可空） — 发货时间

### 3.3 订单明细 `YS/order/OrderItem`

订单行项目（EADAF 物化表 ys_order_item）；实体 `YS:order:OrderItem`。

- 可用操作：`find`(GET)、`findOne`(GET /one)、`findById`(GET /:id)、`count`(GET /count)（`count` 不要直接调，见 §2.3 的替代写法）
- 字段：
  - `id`（string） — 主键
  - `order_id`（string） — 订单ID
  - `product_id`（string） — 伞品ID
  - `quantity`（number） — 数量
  - `unit_price`（number） — 单价

### 3.4 伞品 `YS/product/Product`

伞品主数据（EADAF 物化表 ys_product）；实体 `YS:product:Product`。

- 可用操作：`find`(GET)、`findOne`(GET /one)、`findById`(GET /:id)、`count`(GET /count)（`count` 不要直接调，见 §2.3 的替代写法）
- 字段：
  - `id`（string） — 主键
  - `sku`（string） — SKU
  - `name`（string） — 伞品名称
  - `category?`（string）（可空） — 品类
  - `price`（number） — 单价
  - `stock`（number） — 库存

### 3.5 售后工单 `YS/service/Complaint`

售后工单（EADAF 物化表 ys_complaint）；实体 `YS:service:Complaint`。

- 可用操作：`find`(GET)、`findOne`(GET /one)、`findById`(GET /:id)、`count`(GET /count)（`count` 不要直接调，见 §2.3 的替代写法）
- 字段：
  - `id`（string） — 主键
  - `order_id`（string） — 订单ID
  - `member_id`（string） — 会员ID
  - `type`（string） — 工单类型
  - `content`（string） — 问题描述
  - `status`（string） — 工单状态
  - `created_at`（string） — 创建时间
  - `resolved_at?`（string）（可空） — 解决时间

## 4. 常见坑（已在本实例实测）

1. 过滤值**大小写敏感**，用数据里实际存储的值；管理台枚举键（如 `OPEN` / `VIP`）不等于数据值，用错会得到 0 条。
2. `/{id}` 只认 UUID；用业务单号（如 `SO202501001`）请走 `/one?filter={...}`。
3. `limit > 100` 直接 400。
4. 金额字段是字符串（如 `"1047.00"`），比较 / 求和前先转数字。
5. 单次响应过大会被上下文预算裁剪（列表按条截断，还会带 `truncated` 标记）——看起来像"数据不全"其实是自己一次要太多。**先用 `filter` 把范围缩小**（按状态 / 品类 / 会员）再取，别一上来就全表拉。
6. 业务错误也是 HTTP 200 + `code !== 200`；`http_request` 的返回体外层是 `{ok,status,body}`，业务信封在 `body` 里。
7. 重复请求同样的 URL 不会得到新结果；换参数或换服务才有意义。

## 5. 本应用口径（人工维护）

### 5.1 数据规模与口径

- 示例数据量很小：会员 20、伞品 20、订单 60、订单明细 118、售后工单 10 —— **一次 `limit=100` 基本就能取全**，不要一页页翻，也不要一条条查。
- 金额字段（`total_amount`、`unit_price`、`price`）都是**字符串**（如 `"1047.00"`），求和 / 比较前先 `Number(...)`。
- 时间字段是 ISO 字符串（如 `"2025-01-02T07:15:00.000Z"`），可按字典序比较、按前缀取年月。
- 前端页面读的就是这几个 API 服务，AI 用同样的接口取数，两边结论应当一致。
- **平台内置 API**（`/api/v1/business-data/…`、`/api/v1/storage/…`、`/api/v1/user/…` 等）不在本手册里：
  调之前先用 `eadaf_api_contract({ app: "YS", keyword: "…" })` 查契约（路径、参数名、必填、请求体），
  查到再调，禁止猜（详见 Skill `eadaf-api-contract`）。

### 5.2 枚举取值（过滤时逐字用小写）

| 字段 | 可用值 | 含义 |
| --- | --- | --- |
| `Order.status` | `pending` / `paid` / `shipped` / `completed` / `cancelled` | 待付款 / 待发货 / 已发货 / 已完成 / 已取消 |
| `Complaint.type` | `quality` / `logistics` / `service` / `refund` | 质量问题 / 物流问题 / 服务问题 / 退款 |
| `Complaint.status` | `open` / `processing` / `resolved` / `closed` | 待处理 / 处理中 / 已解决 / 已关闭 |
| `Member.level` | `vip` / `normal` | 金牌会员 / 普通会员 |
| `Product.category` | `长柄伞` / `折叠伞` / `高尔夫伞` / `广告伞` / `儿童伞` | 中文取值，需 URL 编码 |

> 管理台枚举键是大写（`OPEN`、`VIP`…），但**数据里是小写**，用大写过滤会得到 0 条。

### 5.3 表间关系（自己按 id 关联，服务不做 join）

- `Order.member_id` → `Member.id`
- `OrderItem.order_id` → `Order.id`；`OrderItem.product_id` → `Product.id`
- `Complaint.order_id` → `Order.id`；`Complaint.member_id` → `Member.id`

### 5.4 典型问法 → 直接这么调

| 用户问 | 调用 |
| --- | --- |
| 订单 SO202501001 的详情 | `GET /api/v1/data/YS/order/Order/one?filter={"order_no":"SO202501001"}` |
| 某会员的订单 | `Member/one?filter={"name":"张伟"}`（或 `{"phone":"..."}`）拿 `id` → `Order?filter={"member_id":"<id>"}&limit=100` |
| 各状态订单数量 / 金额 | **分别按 5 个状态各取一次** `Order?filter={"status":"<s>"}&limit=100`（单状态最多十几单，不会被裁剪）：数量用 `pagination.total`，金额累加 `total_amount` |
| 订单趋势 / 月度汇总 | 分两页取全：`Order?limit=50&skip=0`、`Order?limit=50&skip=50`（单页约 6KB，不会被裁剪），再按 `created_at` 前 7 位分月汇总 |
| 待处理售后工单 | `Complaint?filter={"status":"open"}&limit=100` |
| 售后类型 / 状态分布 | `Complaint?limit=100` → 按 `type` / `status` 分组计数 |
| 某工单详情 | `Complaint/one?filter={"id":"<UUID>"}`，或 `/one?filter={"order_id":"<订单 UUID>"}` 取该单工单 |
| 库存低于 20 的伞品 | `Product?limit=100` → 筛 `stock < 20` |
| 某伞品卖了多少 | `OrderItem?filter={"product_id":"<id>"}&limit=100` → 累加 `quantity` |
| 某订单买了什么 | `OrderItem?filter={"order_id":"<订单 UUID>"}&limit=100` |
| 会员数 / 订单数 / 工单数 | 列表接口加 `?limit=1`，直接读 `data.pagination.total` |

> ⚠️ 本实例**没有** sales_* 原生 Tool 可用（那两个演示 Skill 未绑定本应用；其内置查询只支持 MySQL 物化连接，而本实例物化连接是 PostgreSQL，调用会报 `SYSTEM_ERROR`）。所以：**统计与分布一律用上面的业务 API 取回数据后自己算**，不要去试 sales_* / run_code 探测。

### 5.5 回答口径

- 用中文回答，金额保留两位小数，数量与占比写清单位。
- 报告 / 分布 / 趋势类问题除了文字表格，按平台的 GPT-Vis 图表约定（`<custom-pie>` / `<custom-column>` / `<custom-line>`，见全局 Skill）插 1～2 个图表，数值只能来自 API 返回，不要编。
- 数据为空时先确认过滤值大小写和字段名，再说明确实没有符合条件的记录。
$eadaf_ai$,
       updated_at = CURRENT_TIMESTAMP
 WHERE code = 'YS';

-- 2) 专用 Skill（正文与顶层 Skill 完全一致，避免两处漂移）
INSERT INTO aibase.skills (
  id, scope_id, name, slug, description, content_markdown,
  is_active, is_global, is_dedicated, completion_strategy
)
VALUES (
  '55555555-5555-4555-8555-5555555555c1',
  (SELECT id FROM aibase.scopes WHERE slug = 'sales-demo'),
  '雨伞独立站业务 API',
  'ys-business-api',
  '雨伞品牌 · 电商独立站 业务 API 契约（会员 / 订单 / 订单明细 / 伞品 / 售后工单）：路径、字段、过滤、响应信封；正文与「应用顶层 Skill」一致，已常驻提示词，无需再次加载。',
  $eadaf_ai$# 雨伞品牌 · 电商独立站（YS）业务 API 手册

> 生成时间 `2026-10-17T15:00:25.621Z`，来源 `GET /api/v1/applications-public/YS/api-catalog`（应用 ID `1e71c653-630f-4006-b6df-081172b15752`）。
> 本文件由 `backend/scripts/gen-app-business-api-skill.js` 生成：API 服务有变动就重跑脚本，**不要手改**（人工口径写在 notes 里）。

## 0. 四条铁律（先看这里，能省掉大部分试错）

1. **数据只有一个来源**：平台已发布的业务数据 API，前缀 `/api/v1/data/`。调用时**只写相对路径**，例如 `/api/v1/data/YS/member/Member?limit=5`。`http_request` 会自动把相对路径指向当前平台，并带上**当前登录用户**的身份；不要自己拼 `Authorization`。
2. **不要猜地址**：`localhost` / `127.0.0.1` / `192.168.x` / 其它端口、少了 `v1` 的 `/api/...`、`/api/v1/bizdata`、`/api/v1/business-data`、复数或驼峰路径（如 `/YS/orders`）、`/public/applications/...`（那是给人看的文档网页，不是接口）、GraphQL、直连数据库 —— 一律不要试。写成**绝对地址**（`http://host:29526/...`）反而不会带身份，只会拿到 401。
3. **服务只有下表这 5 个**，路径逐字照抄；表里没有的实体 / 接口一律不存在。
4. **判读响应**：`code === 200` 才有 `data`。列表 → `data.items` + `data.pagination`；单条 → `data.item`。HTTP 200 但 `code !== 200` 也算失败（典型：字段名写错）。

## 1. 服务总览

| 服务 | routePath（接在 `/api/v1/data/` 之后） | 记录字段 |
| --- | --- | --- |
| 会员 | `YS/member/Member` | `id` `name` `phone` `email` `city` `level` `created_at` |
| 订单 | `YS/order/Order` | `id` `order_no` `member_id` `status` `total_amount` `created_at` `shipped_at` |
| 订单明细 | `YS/order/OrderItem` | `id` `order_id` `product_id` `quantity` `unit_price` |
| 伞品 | `YS/product/Product` | `id` `sku` `name` `category` `price` `stock` |
| 售后工单 | `YS/service/Complaint` | `id` `order_id` `member_id` `type` `content` `status` `created_at` `resolved_at` |

## 2. 通用调用规则

### 2.1 列表查询 `find`

```http
GET /api/v1/data/{routePath}?limit=20&skip=0&filter={"字段":"值"}
```

- `limit` 1–100（默认 20）；`skip` ≥ 0 为偏移量
- 过滤三种写法等价：`filter={"字段":"值"}`、顶层 `?字段=值`、`?filter[字段]=值`；**只支持等值匹配**，值写 `null` 表示 IS NULL
- **不支持** `>` `<` `LIKE`、排序、分组、聚合：需要统计 / 排序 / Top-N 时，把数据取回（`limit` 最大 100，多页用 `skip`）在回答里算
- `data.pagination.total` 是命中总数；要全量就按 `skip += limit` 继续取，直到取满 `total`

### 2.2 单条

```http
GET /api/v1/data/{routePath}/one?filter={"业务键":"值"}   → data.item（没有则 null）
GET /api/v1/data/{routePath}/{uuid}                       → data.item
```

### 2.3 计数

`GET /api/v1/data/{routePath}?limit=1` 后读 `data.pagination.total`。**不要**调 `/count`：该 operation 当前被 `/{id}` 路由抢先匹配，会返回 uuid 解析错误。

## 3. 各服务细节

### 3.1 会员 `YS/member/Member`

雨伞独立站会员（EADAF 物化表 ys_member）；实体 `YS:member:Member`。

- 可用操作：`find`(GET)、`findOne`(GET /one)、`findById`(GET /:id)、`count`(GET /count)（`count` 不要直接调，见 §2.3 的替代写法）
- 字段：
  - `id`（string） — 主键
  - `name`（string） — 会员姓名
  - `phone?`（string）（可空） — 手机号
  - `email?`（string）（可空） — 邮箱
  - `city?`（string）（可空） — 城市
  - `level`（string） — 会员等级
  - `created_at`（string） — 注册时间

### 3.2 订单 `YS/order/Order`

雨伞独立站订单（EADAF 物化表 ys_order）；实体 `YS:order:Order`。

- 可用操作：`find`(GET)、`findOne`(GET /one)、`findById`(GET /:id)、`count`(GET /count)（`count` 不要直接调，见 §2.3 的替代写法）
- 字段：
  - `id`（string） — 主键
  - `order_no`（string） — 订单号
  - `member_id`（string） — 会员ID
  - `status`（string） — 订单状态
  - `total_amount`（number） — 订单金额
  - `created_at`（string） — 下单时间
  - `shipped_at?`（string）（可空） — 发货时间

### 3.3 订单明细 `YS/order/OrderItem`

订单行项目（EADAF 物化表 ys_order_item）；实体 `YS:order:OrderItem`。

- 可用操作：`find`(GET)、`findOne`(GET /one)、`findById`(GET /:id)、`count`(GET /count)（`count` 不要直接调，见 §2.3 的替代写法）
- 字段：
  - `id`（string） — 主键
  - `order_id`（string） — 订单ID
  - `product_id`（string） — 伞品ID
  - `quantity`（number） — 数量
  - `unit_price`（number） — 单价

### 3.4 伞品 `YS/product/Product`

伞品主数据（EADAF 物化表 ys_product）；实体 `YS:product:Product`。

- 可用操作：`find`(GET)、`findOne`(GET /one)、`findById`(GET /:id)、`count`(GET /count)（`count` 不要直接调，见 §2.3 的替代写法）
- 字段：
  - `id`（string） — 主键
  - `sku`（string） — SKU
  - `name`（string） — 伞品名称
  - `category?`（string）（可空） — 品类
  - `price`（number） — 单价
  - `stock`（number） — 库存

### 3.5 售后工单 `YS/service/Complaint`

售后工单（EADAF 物化表 ys_complaint）；实体 `YS:service:Complaint`。

- 可用操作：`find`(GET)、`findOne`(GET /one)、`findById`(GET /:id)、`count`(GET /count)（`count` 不要直接调，见 §2.3 的替代写法）
- 字段：
  - `id`（string） — 主键
  - `order_id`（string） — 订单ID
  - `member_id`（string） — 会员ID
  - `type`（string） — 工单类型
  - `content`（string） — 问题描述
  - `status`（string） — 工单状态
  - `created_at`（string） — 创建时间
  - `resolved_at?`（string）（可空） — 解决时间

## 4. 常见坑（已在本实例实测）

1. 过滤值**大小写敏感**，用数据里实际存储的值；管理台枚举键（如 `OPEN` / `VIP`）不等于数据值，用错会得到 0 条。
2. `/{id}` 只认 UUID；用业务单号（如 `SO202501001`）请走 `/one?filter={...}`。
3. `limit > 100` 直接 400。
4. 金额字段是字符串（如 `"1047.00"`），比较 / 求和前先转数字。
5. 单次响应过大会被上下文预算裁剪（列表按条截断，还会带 `truncated` 标记）——看起来像"数据不全"其实是自己一次要太多。**先用 `filter` 把范围缩小**（按状态 / 品类 / 会员）再取，别一上来就全表拉。
6. 业务错误也是 HTTP 200 + `code !== 200`；`http_request` 的返回体外层是 `{ok,status,body}`，业务信封在 `body` 里。
7. 重复请求同样的 URL 不会得到新结果；换参数或换服务才有意义。

## 5. 本应用口径（人工维护）

### 5.1 数据规模与口径

- 示例数据量很小：会员 20、伞品 20、订单 60、订单明细 118、售后工单 10 —— **一次 `limit=100` 基本就能取全**，不要一页页翻，也不要一条条查。
- 金额字段（`total_amount`、`unit_price`、`price`）都是**字符串**（如 `"1047.00"`），求和 / 比较前先 `Number(...)`。
- 时间字段是 ISO 字符串（如 `"2025-01-02T07:15:00.000Z"`），可按字典序比较、按前缀取年月。
- 前端页面读的就是这几个 API 服务，AI 用同样的接口取数，两边结论应当一致。
- **平台内置 API**（`/api/v1/business-data/…`、`/api/v1/storage/…`、`/api/v1/user/…` 等）不在本手册里：
  调之前先用 `eadaf_api_contract({ app: "YS", keyword: "…" })` 查契约（路径、参数名、必填、请求体），
  查到再调，禁止猜（详见 Skill `eadaf-api-contract`）。

### 5.2 枚举取值（过滤时逐字用小写）

| 字段 | 可用值 | 含义 |
| --- | --- | --- |
| `Order.status` | `pending` / `paid` / `shipped` / `completed` / `cancelled` | 待付款 / 待发货 / 已发货 / 已完成 / 已取消 |
| `Complaint.type` | `quality` / `logistics` / `service` / `refund` | 质量问题 / 物流问题 / 服务问题 / 退款 |
| `Complaint.status` | `open` / `processing` / `resolved` / `closed` | 待处理 / 处理中 / 已解决 / 已关闭 |
| `Member.level` | `vip` / `normal` | 金牌会员 / 普通会员 |
| `Product.category` | `长柄伞` / `折叠伞` / `高尔夫伞` / `广告伞` / `儿童伞` | 中文取值，需 URL 编码 |

> 管理台枚举键是大写（`OPEN`、`VIP`…），但**数据里是小写**，用大写过滤会得到 0 条。

### 5.3 表间关系（自己按 id 关联，服务不做 join）

- `Order.member_id` → `Member.id`
- `OrderItem.order_id` → `Order.id`；`OrderItem.product_id` → `Product.id`
- `Complaint.order_id` → `Order.id`；`Complaint.member_id` → `Member.id`

### 5.4 典型问法 → 直接这么调

| 用户问 | 调用 |
| --- | --- |
| 订单 SO202501001 的详情 | `GET /api/v1/data/YS/order/Order/one?filter={"order_no":"SO202501001"}` |
| 某会员的订单 | `Member/one?filter={"name":"张伟"}`（或 `{"phone":"..."}`）拿 `id` → `Order?filter={"member_id":"<id>"}&limit=100` |
| 各状态订单数量 / 金额 | **分别按 5 个状态各取一次** `Order?filter={"status":"<s>"}&limit=100`（单状态最多十几单，不会被裁剪）：数量用 `pagination.total`，金额累加 `total_amount` |
| 订单趋势 / 月度汇总 | 分两页取全：`Order?limit=50&skip=0`、`Order?limit=50&skip=50`（单页约 6KB，不会被裁剪），再按 `created_at` 前 7 位分月汇总 |
| 待处理售后工单 | `Complaint?filter={"status":"open"}&limit=100` |
| 售后类型 / 状态分布 | `Complaint?limit=100` → 按 `type` / `status` 分组计数 |
| 某工单详情 | `Complaint/one?filter={"id":"<UUID>"}`，或 `/one?filter={"order_id":"<订单 UUID>"}` 取该单工单 |
| 库存低于 20 的伞品 | `Product?limit=100` → 筛 `stock < 20` |
| 某伞品卖了多少 | `OrderItem?filter={"product_id":"<id>"}&limit=100` → 累加 `quantity` |
| 某订单买了什么 | `OrderItem?filter={"order_id":"<订单 UUID>"}&limit=100` |
| 会员数 / 订单数 / 工单数 | 列表接口加 `?limit=1`，直接读 `data.pagination.total` |

> ⚠️ 本实例**没有** sales_* 原生 Tool 可用（那两个演示 Skill 未绑定本应用；其内置查询只支持 MySQL 物化连接，而本实例物化连接是 PostgreSQL，调用会报 `SYSTEM_ERROR`）。所以：**统计与分布一律用上面的业务 API 取回数据后自己算**，不要去试 sales_* / run_code 探测。

### 5.5 回答口径

- 用中文回答，金额保留两位小数，数量与占比写清单位。
- 报告 / 分布 / 趋势类问题除了文字表格，按平台的 GPT-Vis 图表约定（`<custom-pie>` / `<custom-column>` / `<custom-line>`，见全局 Skill）插 1～2 个图表，数值只能来自 API 返回，不要编。
- 数据为空时先确认过滤值大小写和字段名，再说明确实没有符合条件的记录。
$eadaf_ai$,
  true, false, true, '{"terminationStrictness":"off"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE
   SET scope_id = EXCLUDED.scope_id,
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       content_markdown = EXCLUDED.content_markdown,
       is_active = true,
       is_global = false,
       is_dedicated = true,
       completion_strategy = EXCLUDED.completion_strategy,
       updated_at = CURRENT_TIMESTAMP;

-- 3) Skill ↔ 应用绑定（capabilities 只发已绑定的专用 Skill）
INSERT INTO aibase.skill_applications (skill_id, application_id)
SELECT s.id, a.application_id
  FROM aibase.skills s, eadaf.applications a
 WHERE s.slug = 'ys-business-api'
   AND a.code = 'YS'
ON CONFLICT (skill_id, application_id) DO NOTHING;

-- 4) Skill → http_request
INSERT INTO aibase.skill_tools (skill_id, tool_id, sort_order)
SELECT s.id, t.id, 0
  FROM aibase.skills s, aibase.tools t
 WHERE s.slug = 'ys-business-api' AND t.slug = 'http-request'
ON CONFLICT (skill_id, tool_id) DO NOTHING;

COMMIT;

-- 自检
SELECT s.slug, s.is_dedicated, length(s.content_markdown) AS body_len,
       (SELECT count(*) FROM aibase.skill_applications sa WHERE sa.skill_id = s.id) AS app_links,
       (SELECT count(*) FROM aibase.skill_tools st WHERE st.skill_id = s.id) AS tool_links
  FROM aibase.skills s WHERE s.slug = 'ys-business-api';
SELECT code, length(coalesce(top_level_skill_markdown, '')) AS top_level_len
  FROM eadaf.applications WHERE code = 'YS';
