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
