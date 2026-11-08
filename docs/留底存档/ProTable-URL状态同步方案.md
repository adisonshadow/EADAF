# ProTable 状态与 URL 同步 —— 统一解决方案

> **状态**：方案已修订（纳入评审意见），待确认后实施
> **日期**：2026-08-12（修订）
> **范围**：`frontend` 全部列表页（ProTable / UrlSyncedProTable）+ 详情/编辑页「回列表」导航约定，后端无改动
> **一句话目标**：把列表页的「分页、筛选、排序」统一落到 URL 上，并保证从详情**浏览器返回**与**按钮回列表**都能原样恢复；拿到 URL 直接访问即呈现对应内容；浏览器前进/后退与列表状态一致。
> **相关方案**：`docs/TODOs/AIBase-语义化路由与AI决策跳转方案.md`（AI `navigate_to_page` 若带 query，可与本方案的 URL 直达叠加；本期不耦合实施，仅预留约定）

---

## 一、背景与问题

### 1.1 问题来源

项目从 Umi 迁移到 Vite 后，Umi 内置的三项能力随之丢失：

- **URL State / Query Params 状态同步**（路由级 query 读写）
- **路由状态序列化**（数组、日期、枚举等 → URL 字符串）
- **表格状态与路由双向绑定**（ProTable 分页/筛选 ↔ 路由 query）

Vite 只提供「裸」的 `react-router-dom`（`useSearchParams`），序列化、双向绑定、状态恢复全部要自己搭。

### 1.2 根因（两层）

1. **表格状态只在组件内存**：列表跳详情时组件卸载，返回后重新挂载 → 页码/筛选归零。
2. **「回列表」导航丢 query（更常见）**：详情/编辑页大量使用 `navigate(listPath)` / `navigate(listPath, { replace: true })`，**不带**列表页的 `location.search`。即便列表曾把状态写入 URL，点「取消/保存」回列表仍会落到空 query。浏览器后退能恢复，按钮回列表不能——用户感知的「丢失」多数走这条路径。

### 1.3 用户可感知的问题场景

1. 列表翻到第 2 页 → 点行进详情 → **浏览器返回** / **点取消回列表** → 掉回第 1 页；
2. 过滤条件（关键词 / 状态 / 日期区间 / 域）→ 进详情 → 返回 → 过滤丢失；
3. 把当前列表 URL 发给别人 / 存书签 → 打开后是空列表第 1 页，而不是「我要的那一页」；
4. 浏览器前进/后退在列表页内部无法表达「回到上次看的那一页」。

---

## 二、现状盘点（已核实）

### 2.1 技术栈

- React `19.2.0`，antd `6.4.4`，`@ant-design/pro-components` `2.8.10`（内部 `pro-table 3.21.0`）
- `react-router-dom` `7.18.0`，**声明式** `<BrowserRouter>` + `<Routes>`（`src/App.tsx`，非 `createBrowserRouter`）
- Vite `8` + pnpm；无 `nuqs`，无其他 URL 状态库；`package.json` 仅声明 `react-router-dom`，未显式声明 `react-router`

### 2.2 已有自研方案（此前「硬编码」的产物）

三件套，覆盖了约 20 个列表页（28 个引用 ProTable 的文件中，含工具组件与封装自身）：

| 文件 | 职责 |
|---|---|
| `src/utils/tableUrlHelper.ts`（152 行） | page/pageSize/筛选值 ↔ URLSearchParams 序列化（`page`/`pageSize`/`scope` 保留键） |
| `src/hooks/useUrlQueryState.ts`（164 行） | `useTableUrlState` / `useUrlPagination` / `useScopeFromUrl` / `usePatchSearchParams` |
| `src/components/UrlSyncedProTable/index.tsx`（330 行） | ProTable 封装：分页受控于 URL、筛选回填、request 包装 |

另有（**不在** `UrlSyncedProTable` 内部）：

- `scope`（域树选择）已入 URL（键 `scope`）；
- 搜索区收起/展开由**各页面**自行调用 `useProTableSearchCollapse` + localStorage（`useUserHabit`），**不打算搬进 URL**。

**关键事实：项目存在两种数据模式并存**（直接影响 URL 驱动的设计，见 6.4）：

| 模式 | 特征 | 代表页面 |
|---|---|---|
| **request 模式**（后端分页/搜索） | `request` 接收 `current/pageSize/筛选`，后端分页 | AIManagement 六个页面、Metrics、Member、Buckets、Browser、Applications、ExceptionResponses 等（约 19 个文件含 `request=`；其中部分树表 `pagination={false}`，见下） |
| **dataSource 模式**（页面自管） | 页面全量拉取（如 `size:-1`）+ 前端过滤/前端分页，ProTable 只做展示 | ApiServices/List（`loadData` + `filteredServices`）、MaterializedTableList、CollectionPipelines 等 |

### 2.3 仍未迁移的 ProTable 页面（问题重灾区）

以下页面还是裸 `ProTable`，筛选/分页完全不进 URL：

| 页面 | 形态 | 本期同步重点 |
|---|---|---|
| `MemberOrg/Organization/index.tsx` | 树形表，`pagination={false}` | **筛选**（展开行按 3.1 不进 URL） |
| `MemberOrg/Role/index.tsx` | 树形表，`request` + `pagination={false}` | **筛选**（非翻页场景；勿当作分页样本） |
| `Permissions/BuiltinApi/index.tsx` | 列表 | 分页 + 筛选 |
| `Permissions/components/PermissionTable/index.tsx` | 权限表格子组件 | 分页 + 筛选（注意同页多实例） |
| `BusinessData/Materialization/.../DatabaseConnectionManager.tsx` | 列表 | 分页 + 筛选 |
| `BusinessData/Materialization/TableBrowse/Schema.tsx` | 表结构预览 | 按页面实际筛选字段 |

### 2.4 现有自研方案的缺陷（代码级，逐条核实）

1. **时序竞态靠 ref + setTimeout 硬扛**：`UrlSyncedProTable` 内部有 `urlPaginationGuardRef` / `skipInitialReloadRef` / `prevUrlPageRef` / `pageRef` / `pageSizeRef` **5 个 ref** + 400ms 定时器来区分「用户翻页」与「URL 回填导致的翻页」，极易出边界 bug（快速连点、前进/后退、reload 撞车）；
2. **日期/对象序列化不可用**：`tableUrlHelper.serializeFilterValue` 对 `dayjs`/对象直接 `JSON.stringify`，RangePicker 会写出 `{"$L":...}` 之类的不可逆字符串。目前搜索区还没有日期筛选字段（现有 `dateTime` 类型多为**列展示**），该 bug 尚未爆发，但方案必须支持日期/区间；
3. **排序（sorter）没有同步**：`onChange` 只透传，排序不进 URL；
4. **`manualRequest` 未处理 + 首次请求时机不统一**：request 模式常先发默认请求，URL 回填后再 reload——重复请求 + 首屏闪烁；dataSource 模式由各自 `useEffect` 拉取，时机不一；
5. **多实例冲突**：同页多表时 `page`/`pageSize` 等键全局共享；
6. **表单回填时序**：`useEffect` + `form.setFieldsValue`，表单未就绪时静默失效；
7. **双数据源**：`urlFormValues` 与 `readFormValues()` 切换，一致性脆弱；
8. **「回列表」未纳入**：仅做表格 URL 同步，详情页 `navigate(listPath)` 仍丢状态（见 1.2）。

> 结论：现有方案**方向正确**（URL 为唯一数据源、分页受控、保留键），但实现层缺陷多、且**缺少回列表约定**。应重构为「成熟库 + 薄胶水」，并把回列表纳入本期。

---

## 三、需求与非目标

### 3.1 需要同步到 URL 的状态

| 状态 | 是否入 URL | 说明 |
|---|---|---|
| 分页 `page` / `pageSize` | ✅ | 键名 `page` / `pageSize`（沿用现状）；树表无分页则不同步 |
| 搜索表单筛选值 | ✅ | 字符串、数字、枚举、多选数组、日期、日期区间 |
| 排序 `sorter` | ✅（opt-in） | `sort=字段:asc\|desc`；**仅对声明了排序需求的列/页面启用**，避免无排序页被强制受控 `sortOrder` |
| 域/作用域 `scope` | ✅ | 沿用现有 `scope` 键 |
| 搜索区收起/展开 | ❌ | 用户偏好，继续走页面侧 `useProTableSearchCollapse` + localStorage |
| 选中行 / 展开行 | ❌ | 页面内瞬态（树形表展开行如需恢复，后续单独评估） |
| antd 列头 `filters` / `proFilter` | ❌ | **本期不做**；只同步搜索表单筛选 |
| 编辑中的表单草稿 | ❌ | 详情/编辑页表单不纳入 |

### 3.2 本期必须覆盖的导航约定

| 场景 | 是否本期 | 说明 |
|---|---|---|
| 浏览器后退/前进 | ✅ | 依赖历史栈中带 query 的列表条目 + URL 驱动挂载 |
| 详情「取消 / 保存后回列表」按钮 | ✅ | 必须带回列表 query（见 6.9），否则主路径仍坏 |
| URL 直达 / 刷新 / 分享 | ✅ | 挂载即按 URL 呈现 |

### 3.3 非目标

- 不改后端分页协议（保持 `offset=(page-1)*size`、1-based）；
- 不做 SSR/loader 预取（纯 SPA）；
- 不把详情/编辑页的表单状态纳入 URL；
- 不迁移到 `@tanstack/react-table` 等整套表格换血；
- **不改造 dataSource 页的前端全量分页为后端分页**（仅保证 URL 状态一致）；
- **本期不实现 AI 跳转带 query**（与语义化路由方案解耦；约定见 6.10）。

---

## 四、方案选型（三选一）

### 4.1 方案 A：nuqs 做 URL 状态基础设施 + 自研薄 ProTable 胶水层（推荐）

**选型依据见第五节 nuqs 评估**。核心思路：

- **nuqs 负责**：query 的解析/序列化（类型安全）、history 策略（replace/push）、URL 更新节流、`clearOnDefault`、key 隔离；
- **自研胶水层只负责**：表格状态 ↔ nuqs 映射、ProTable 请求时机、回列表 search 保留。

> 一句话：**nuqs 解决「URL 状态库」这一半，ProTable 绑定 + 回列表这一半仍需自研，但能比现在薄一个量级**（不再需要 5 个 ref + 400ms 定时器）。

### 4.2 方案 B：不引依赖，把现有三件套重构成熟

- 修补序列化、加 sorter/manualRequest/多实例、重写竞态守卫，并另做回列表约定；
- 优点：零新依赖；缺点：节流/key 隔离/history/类型推导都要自造，工期与风险高于 A。

### 4.3 方案 C：维持现状，继续打补丁

- 只迁移剩余裸 ProTable；2.4 缺陷与回列表问题原样保留。**不推荐**。

### 4.4 结论

**推荐方案 A**。理由：

1. nuqs 对 React 19 / react-router v7 有官方适配，维护活跃；
2. 通用能力交给库，ProTable 强相关与回列表留在项目内，职责清晰；
3. 现有键名约定、scope 保留、页面接入方式可平滑迁移。

---

## 五、nuqs 评估结论（已核实 2.9.5）

### 5.1 兼容性（✅ 全部满足）

- **版本**：`nuqs@2.9.5`（2026-08 时点 latest）；
- **React 19**：peer 声明 `react >=18.2.0 || ^19.0.0-0` ✅；
- **react-router v7**：内置适配器 `nuqs/adapters/react-router/v7`，peer 声明 `react-router ^5 || ^6 || ^7 || ^8` ✅；
- **声明式 `<Routes>` 可用**：v7 适配器基于 `useSearchParams` + `patchHistory` + `popstate`，**不依赖** `createBrowserRouter`。用法：`<BrowserRouter>` 内侧包 `<NuqsAdapter>`。

### 5.2 能力清单（与本需求相关）

| 能力 | 说明 | 对应需求 |
|---|---|---|
| `useQueryState` / `useQueryStates` | 单键/多键 URL 状态，URL 是唯一数据源 | 核心 |
| 内置 parsers + `withDefault` | 类型安全；默认值不写进 URL | 筛选序列化 |
| `createParser` | 自定义（dayjs、区间、布尔「键存在」） | 日期/复杂值 |
| `urlKeys` | 重命名 URL 键，支持多实例前缀 | 多表格同页 |
| `history: 'replace' \| 'push'` | 默认 replace | 列表内部状态 |
| `limitUrlUpdates` / `throttleMs` | 默认 50ms；Safari 建议 ≈120ms | 高频更新 |
| `clearOnDefault`（默认 true） | 默认值清键，URL 干净 | 分享/直达 |
| key 隔离 | 只响应本 hook 声明的键 | 多实例性能 |

### 5.3 边界与坑（必须写进实施计划）

1. **nuqs 不做 ProTable 绑定**——胶水层仍需自研（第六节）；
2. **pnpm 幽灵依赖**：适配器从 `react-router` import，须**显式**把 `react-router` 写入 `frontend/package.json`；
3. **`parseAsArrayOf` 默认逗号分隔**，item URI 编码；日期区间用 `ISO,ISO`（或时间戳）；
4. **布尔筛选**：不用裸 `parseAsBoolean` 作为默认；统一用「键存在」或自定义 parser（见 6.5）；
5. **URL 长度**：继续白名单（`urlFilterKeys`）；
6. **锁定 nuqs 2.9.x**，升级看 changelog；
7. **Safari**：全局节流建议 120ms 起步。

---

## 六、目标架构（方案 A 详细设计）

### 6.1 分层

```
┌─ L3 页面 ─────────────────────────────────────┐
│ 列表：白名单筛选键 +（可选）从 columns 推断类型 │
│ 详情：useReturnToList / navigate 带回 search  │
├─ L2 胶水层（自研）────────────────────────────┤
│ useProTableUrlState + UrlSyncedProTable（灰度）│
│ 表格↔URL、request 时机、manualRequest、params禁令│
│ useReturnToList（回列表保留 query）             │
├─ L1 状态定义层（自研）─────────────────────────┤
│ valueType → parser 注册表（可从 columns 推断）  │
│ key 约定 + 多实例前缀 + 保留键(scope 等)        │
├─ L0 基础设施（nuqs + react-router v7 适配器）─┤
│ NuqsAdapter、useQueryStates、节流/history      │
└──────────────────────────────────────────────┘
```

### 6.2 数据流（核心原则：URL 是唯一数据源）

- **读**：分页/筛选/排序全部从 URL 解析 → 受控给 ProTable（表单回填 + 受控分页；排序仅 opt-in）；
- **写**：用户翻页/改筛选/点排序 → 更新 URL（`replace`）→ URL 变化 → 触发一次请求；
- **跳详情**：`navigate('/xxx/:id/edit')`（默认 `push`）。列表 query **不会**留在详情 URL 上，而是留在**历史栈**的上一条；浏览器后退靠 `popstate` 恢复；
- **按钮回列表**：必须显式带上离开列表时的 search（见 6.9），**不能**裸 `navigate(listPath)`；
- **URL 直达**：首次挂载从 URL 解析完整状态 → 回填表单 → **只发一次**请求（见 6.4）；
- **前进/后退**：`popstate` → URL 变化 → 重新请求。

### 6.3 history 策略

- 列表内部状态变化一律 `replace`（避免历史栈被翻页刷满）；
- 详情/编辑跳转用 `push`（react-router 默认）；
- 筛选提交改 `push` 以便「查询可后退」——**本期默认 replace，可选开关**。

### 6.4 ProTable 的 manualRequest 与 `params` 陷阱 —— 专项设计

已读 `pro-table@3.21.0` 源码，机制确认如下（仅 request 模式涉及）：

- `manualRequest=true` 时：内部 `formSearch` 初始 `undefined` → 首次 `fetchList` 直接 return；须 `actionRef.current.reload()` 后才会正常请求；
- 请求副作用依赖：`[stringify(params), stringify(formSearch), stringify(proFilter), stringify(proSort)]`；分页走 `onPageInfoChange`。

**硬性约定（现有代码注释已踩过坑，写入架构）：**

> **禁止**把动态页码或会随 URL 变化的筛选状态塞进 ProTable 的 `params`。  
> ProTable 在 `params` 变化时会把表格**重置到第 1 页**——这正是当前 5 个 ref + 400ms 守卫的主要诱因之一。  
> 分页只走受控 `pagination` + URL；筛选回填只走 form（`setFieldsValue` / `initialValues`）；request 包装层从 URL/pageRef 读权威 `current/pageSize`。

**胶水层决策（按模式区分）**：

1. **request 模式：封装内部默认开启 manualRequest 语义**（不向页面暴露）：
   - URL 有 page/筛选/排序 → 等表单就绪 → `setFieldsValue` + `reload()`；
   - URL 全空 → 触发一次默认请求（行为对齐现网「无 manualRequest」）；
   - **禁止**「先默认请求、再回填重发」；
2. **dataSource 模式：只做 URL 读写与受控展示**，不编排请求（页面自有 `useEffect`）；
3. 对外保留透传 `manualRequest`（个别页完全手动时，胶水层只做 URL 读写）；
4. 竞态：请求序号或 `AbortController`；筛选防抖 = ProTable `debounceTime` + nuqs 节流。

> dataSource 前端分页在大数据量下并非最优，属后端分页改造，**本期不做**，验收时单独标注「仅恢复页码/筛选展示」。

### 6.5 序列化设计（valueType → parser；优先从 columns 推断）

L1 建字段类型注册表。**页面默认只声明白名单键（`urlFilterKeys`）**；类型优先从 `columns` 的 `valueType` / `valueEnum` / `dataIndex` **推断**，避免每页再维护一份 urlState 类型配置。推断不足或冲突时，允许页面显式覆盖。

| 字段类型（valueType） | nuqs parser | URL 示例 |
|---|---|---|
| `string` | `parseAsString.withDefault('')` | `?keyword=abc` |
| `number` | `parseAsInteger` / `parseAsFloat` | `?age=18` |
| `boolean` | **自定义「键存在」parser**（默认）；不直接用 `parseAsBoolean` | `?enabled` 或 `?enabled=1` |
| `enum` | `parseAsStringEnum(枚举值列表)`（可从 `valueEnum` 推断） | `?status=published` |
| `array`（多选/标签） | `parseAsArrayOf(parseAsString, ',')` | `?tags=a,b,c` |
| `date` | `parseAsIsoDateTime` + dayjs 转换层 | `?date=2026-08-12T00:00:00Z` |
| `dateRange` | 自定义：`start,end` ISO | `?range=2026-08-01,2026-08-12` |
| `json`（谨慎） | `parseAsJson` | `?cfg=%7B...%7D` |
| 自定义 | `createParser({ parse, serialize, eq })` | — |

约定：

- 时间统一 UTC ISO-8601 入库，展示本地化；
- 键名默认与 `dataIndex` 一致；多实例用 ASCII 前缀，例如 `urlKeys={{ page: 'devices_page', pageSize: 'devices_pageSize' }}` 或 `withPrefix('devices_')`——**禁止**用中文键名；
- 保留键（`scope` 等）豁免，迁移 `DEFAULT_RESERVED_URL_KEYS` 到 L1。

### 6.6 排序（sorter）同步 —— opt-in

- URL：`sort=field:order`（本期单字段；多字段预留 `field1:asc,field2:desc`）；
- 写入：`onChange(_, __, sorter)` → 写 URL；
- 恢复：仅为**启用了 URL 排序**的列注入受控 `sortOrder`；
- 无排序需求的页面不开启，避免无意义的受控排序副作用；
- 实施时验证「受控 sortOrder + request」是否重复触发请求，用竞态防护兜住。

### 6.7 多实例与命名空间

- 同页多表声明独立 `urlKeys` / 前缀（如 `devices_page`、`users_page`）；
- 单实例保持友好 URL：`?page=2&status=ok`。

### 6.8 组件落地策略（避免 20 页一次性换行为）

**不**在阶段 2 原地静默替换 `UrlSyncedProTable` 默认实现导致约 20 个已接入页同时换血。采用灰度：

1. 新增 `useProTableUrlState` + 内部 v2 实现路径；
2. `UrlSyncedProTable` 增加显式开关（如 `engine="nuqs"` / 默认暂保持旧引擎，或相反：试点页传 `engine="legacy"`）；
3. 先在 **2.3 裸页 + 1～2 个已接入代表页**（一个 request、一个 dataSource）切到新引擎并验收；
4. 再批量切已接入页；最后删除旧引擎与 5-ref 守卫。

兼容 props（`urlFilterKeys` / `urlArrayKeys` / `syncUrl` / `urlPageKey` 等）全程保留。

### 6.9 回列表保留 query（本期必做）

**问题**：详情页普遍 `navigate(listPath)`，丢掉列表 search。

**约定（二选一，推荐组合使用）**：

1. **优先**：提供 `useReturnToList(listPath)`（或 `navigateToList(listPath)`）：
   - 进入详情时把当时的 `location.search`（或 `useLocation().state.fromSearch`）记下；
   - 取消/保存回列表时：`navigate({ pathname: listPath, search: savedSearch })`；
   - 若从外部深链直达详情、无来源 search，则回裸 `listPath`（可接受）；
2. **可选补充**：在「未使用 replace 清掉历史」的场景下，取消可用 `navigate(-1)`；**保存成功后**若曾 `replace` 掉列表历史，则必须走方案 1，不能依赖 `-1`。

**改造范围**：所有从带 URL 状态的列表进入的 FormPage / 详情「回列表」按钮（至少覆盖 AIManagement、MemberOrg、Metrics、ServiceProvider、ApiServices 等已用 `navigate(listPath)` 的页面）。可渐进：先改与试点列表对应的 FormPage，再扫尾。

**禁止**：新代码再写裸 `navigate(listPath)` 回列表（可用 lint / code review 盯）。

### 6.10 与 AI 语义化路由的关系（本期不解耦实施，只定约定）

- 本方案保证：列表状态在 URL query 上可直达；
- 语义化路由方案中的 `navigate_to_page` **未来**若需打开「带筛选的列表」，应支持附带 `search`/`query`；
- 本期两边独立交付，不阻塞；联调列为后续增强。

### 6.11 保留现状（不迁移）

- `scope`、搜索区收起、`DEFAULT_PRO_TABLE_OPTIONS`、`useProTableSearchCollapse` 均保留在现有位置；
- `tableUrlHelper` / `useUrlQueryState` 对非表格场景（如 `TableBrowse/Data`）保留薄壳或收编进 L1，避免破坏性移除。

---

## 七、实施计划（分阶段）

预估合计约 **8～12 天**（含回列表与灰度切换）。

### 阶段 0：准备与验证（0.5～1 天）

1. 安装 `nuqs@2.9.x`；显式加入 `react-router`；
2. `App.tsx` 挂 `<NuqsAdapter>`；
3. 最小 demo 必须覆盖：
   - `useQueryStates` 读写、`replace`、`popstate`、URL 直达；
   - **带 query 的列表 → 进详情 → 点取消回列表（带 search）**，而不仅是浏览器后退。

### 阶段 1：L1 状态定义层（1～2 天）

4. valueType → parser 注册表（含 dayjs/区间/枚举/数组/布尔键存在）；
5. 从 `columns` 推断 parser 的辅助函数 + 白名单覆盖；
6. key 约定、保留键、`withPrefix` 多实例工具；兼容壳。

### 阶段 2：L2 胶水 + 回列表（2.5～3.5 天）

7. `useProTableUrlState`：URL 驱动、manualRequest 编排、表单就绪回填、**禁止动态 params**、竞态防护、opt-in sorter；
8. `UrlSyncedProTable` 灰度接入（`engine` 开关），保留 props 兼容；
9. 实现 `useReturnToList` / `navigateToList`，并改试点 FormPage。

### 阶段 3：页面迁移（2.5～3.5 天）

10. 2.3 裸页切换到新引擎（树表只同步筛选）；
11. 试点 1～2 个已接入页 → 批量切换已接入页 → 下线 legacy 引擎；
12. 扫尾 FormPage「回列表」；sorter 仅对有需求的页 opt-in；统一 pageSize 默认值口径。

### 阶段 4：测试与回归（1～2 天）

13. 第八节矩阵；重点：按钮回列表、快速连点、前进/后退、URL 直达、多实例、Safari、请求次数。

---

## 八、验收标准（测试矩阵）

每个列表页（至少覆盖 2.3 的 6 个页面 + 1 个 request 代表页 + 1 个 dataSource 代表页；有日期筛选后再加 1 页）必须通过：

| # | 场景 | 期望 |
|---|---|---|
| 1a | 翻到第 3 页 → 进详情 → **浏览器返回** | 回到第 3 页，筛选不变 |
| 1b | 翻到第 3 页 → 进详情 → **点取消/保存回列表** | 回到第 3 页，筛选不变（search 被带回） |
| 2a | 设置过滤 → 进详情 → 浏览器返回 | 过滤与结果恢复 |
| 2b | 设置过滤 → 进详情 → 按钮回列表 | 过滤与结果恢复 |
| 3 | 复制 URL 新标签打开 / 刷新 | URL 直达正确结果 |
| 4 | 浏览器前进/后退 5 次 | 与 URL 一致，无白屏 |
| 5 | 快速连续翻页 5 次 | 只生效最后一次请求 |
| 6 | （opt-in 页）点列排序 → 进详情 → 返回/回列表 | 排序保持 |
| 7 | 同页两个表格（如有） | 前缀隔离、互不干扰 |
| 8 | 默认筛选值 | URL 中不出现该键（clearOnDefault） |
| 9 | Safari / iOS | 不丢历史、状态恢复正常 |
| 10 | 后端请求次数 | 挂载/回填无「默认 + 重复」双请求 |
| 11 | 树表（Organization / Role） | 筛选入 URL 并可恢复；无分页键亦可 |

---

## 九、风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| nuqs 2.x API 演进 | 升级破坏 | 锁版本；页面不直接依赖 nuqs API |
| pro-table 时序黑盒（manualRequest / 受控分页 / 排序） | 边界难料 | 阶段 0 demo；禁止动态 `params`；竞态防护；矩阵覆盖 |
| 误把筛选写入 `params` | 又触发重置第 1 页 / 守卫回潮 | 代码约定 + review 检查点 + 封装层兜底 |
| 详情回列表漏改 | 主路径仍丢状态 | 6.9 工具函数 + FormPage 扫尾清单 + 验收 1b/2b |
| 原地替换导致 20 页齐崩 | 回归面过大 | 6.8 灰度开关，先试点再批量 |
| 日期/时区错乱 | 查询结果错 | UTC ISO + dayjs 转换层 |
| URL 超长 | 截断 | 白名单；必要时省略次要字段 |
| pnpm 幽灵依赖（react-router） | 构建/运行失败 | 显式声明，阶段 0 验证 |

---

## 十、已拍板项（本修订）

| # | 议题 | 结论 |
|---|---|---|
| D1 | 回列表是否本期 | **是**——浏览器返回与按钮回列表均需恢复（6.9） |
| D2 | UrlSyncedProTable v2 落地 | **灰度开关**，禁止一次性静默替换（6.8） |
| D3 | 树表（Role / Organization） | 本期只同步**筛选**；展开行、分页不在范围 |
| D4 | 排序 | **opt-in**，不强制所有页受控 sortOrder |
| D5 | 列头 filters / proFilter | **本期不做** |
| D6 | 与 AI 语义路由 | 约定可带 query，**本期不耦合实施** |

---

## 附录 A：关键源码事实（供实施参考，均已核实）

- **pro-table 3.21.0**（`node_modules/.pnpm/@ant-design+pro-table@3.21.0_*/node_modules/@ant-design/pro-table/es/`）
  - `typing.d.ts:301` — `manualRequest?: boolean`（旧文档常写作 `manual`）；
  - `Table.js:349` — `manualRequest || search !== false` 时 `formSearch` 初始 `undefined`；
  - `Table.js:453` — `manual: formSearch === undefined` 传给 `useFetchData`；
  - `useFetchData.js:80,185` — `manualRequestRef` 初始 true，首次 fetchList return；reload 后置 false；
  - effects — `[stringify(params), stringify(formSearch), stringify(proFilter), stringify(proSort)]` 变化触发防抖请求；**`params` 变化会重置页码——胶水层禁止把动态 URL 状态塞进 params**。
- **nuqs 2.9.5**
  - 适配器：`nuqs/adapters/react-router/v7`；基于 `useSearchParams` + `patchHistory` + `popstate`；
  - `parseAsArrayOf(itemParser, separator=',')`；
  - `Options`：`history`（默认 replace）、`limitUrlUpdates`/`throttleMs`、`clearOnDefault`、`urlKeys`。
- **回列表现状（抽样）**：`AIManagement/*/FormPage.tsx`、`MemberOrg/*/FormPage.tsx`、`Metrics/FormPage.tsx`、`ServiceProvider/Applications/FormPage.tsx` 等普遍 `navigate(listPath)` 不带 search。

## 附录 B：迁移后各文件职责

| 文件（建议） | 职责 |
|---|---|
| `src/utils/tableUrlState/parsers.ts` | valueType → nuqs parser 注册表 |
| `src/utils/tableUrlState/inferFromColumns.ts` | 从 ProColumns 推断 parser / 键 |
| `src/utils/tableUrlState/keys.ts` | 键名约定、保留键、`withPrefix` |
| `src/hooks/useProTableUrlState.ts` | L2：表格 ↔ URL（供组件与手写表格复用） |
| `src/hooks/useReturnToList.ts` | 进详情保存 search、回列表拼 search |
| `src/components/UrlSyncedProTable/index.tsx` | 灰度接入 v2，保留 props 兼容，最终下线 legacy |
| `src/utils/tableUrlHelper.ts` / `src/hooks/useUrlQueryState.ts` | 薄壳供非表格场景，不再承载表格主逻辑 |

---

## 附录 C：实施状态记录（2026-08-12）

> 本附录记录按本方案的实施进度，供后续批量切换与扫尾参考。

### 已完成 ✅

| 阶段 | 内容 | 落地文件 |
|---|---|---|
| 0 | 安装 `nuqs@2.9.5`，显式声明 `react-router@7.18.0`（pnpm 幽灵依赖）；`App.tsx` 挂 `<NuqsAdapter>` | `frontend/package.json`、`frontend/src/App.tsx` |
| 1 | L1 状态定义层：键名/保留键/`withPrefix`、valueType→parser 注册表（含 dayjs/区间/枚举/数组/布尔「键存在」）、从 columns 推断 parser | `src/utils/tableUrlState/{keys,parsers,inferFromColumns}.ts` |
| 2 | L2 胶水：`useProTableUrlState`（URL 驱动、分页可选、sort opt-in、**不塞 params**）、`useReturnToList`/`useOpenDetail`（回列表保留 query）、`UrlSyncedProTable` 灰度引擎（`engine="legacy"|\"nuqs\"`，默认 legacy） | `src/hooks/useProTableUrlState.ts`、`src/hooks/useReturnToList.ts`、`src/components/UrlSyncedProTable/index.tsx` |
| 3 | 迁移裸页（实际 3 个有状态）：Role（role_name/status）、Organization（name）、PermissionTable（code/status）——均为树表，`syncPagination={false}` 只同步筛选 | 上述页面 `engine="nuqs"` |
| 3 | 试点已接入页：Member（request 模式，username/name/status）、ApiServices/List（dataSource 模式，status/tag/code） | 上述页面 `engine="nuqs"` |
| 3 | 回列表闭环（MemberOrg）：Member/Organization 列表跳详情带 `state.fromSearch`（`useOpenDetail`）；对应 FormPage 回列表拼回 search（`useReturnToList`），Organization 保存成功保留 highlight | `MemberOrg/{Member,Organization}/{index,FormPage}.tsx` |
| — | `pnpm-store` 缓存目录加入 `.gitignore`（沙盒内新 store 路径） | 根 `.gitignore` |

### 验证 ✅

- `tsc -b`：84 个错误 = 基线（stash 对比确认），新增代码 0 错误；
- `vite build`：构建成功（9s，仅既有警告）；
- dev server（9527）：App.tsx、新模块、迁移页面模块全部 200 编译通过。

### 待办/剩余 ⏳

| # | 内容 | 说明 |
|---|---|---|
| R1 | **运行时验收**（需浏览器/人工）：按第八节测试矩阵逐页验证，重点——翻页→详情→返回/按钮回列表、URL 直达刷新、前进/后退、快速连点、Safari；`ApiServices/List` 与 `Member` 的 dataSource/request 时序 | dev server 已在跑，可直接验收 |
| R2 | 批量切换已接入页：将剩余 ~17 个 legacy 页逐个加 `engine="nuqs"` 与 `urlFilterKeys` 白名单（当前搜索区无日期筛选，类型推断以字符串/枚举为主） | 每页独立验收后再切 |
| R3 | 旧引擎下线：全部切换后删除 legacy 实现与 5-ref 守卫；`tableUrlHelper`/`useUrlQueryState` 保留薄壳 | 与 R2 同批 |
| R4 | 其余 FormPage 回列表扫尾（AIManagement/Metrics/ServiceProvider 等） | 模式见 `useReturnToList` |
| R5 | sorter opt-in 试点页（本期未启用任何页面的 `sortable`） | 按需开 |
| R6 | 有日期筛选需求的页面接入 date/dateRange parser | parser 已就绪 |

### 缺陷修复记录（2026-08-12 第二轮）

**问题**：v2 引擎过滤提交后表格内容不更新。

**根因（两条链路，均已确认）**：
1. request 模式：ProTable 表单提交时**先** `onFormSearchSubmit`（内部 setFormSearch + setPageInfo(1)）**再**调 `onSubmit`；而 `useFetchData` 的 pageInfo 是**非受控** state（不随受控 pagination 变化），且内部请求发生时 `pageRef.current` 尚未被 handleSubmit 同步 → 请求带旧页码/旧筛选；旧实现又用 `lastUserActionRef` 跳过了修正 reload → 无正确请求。
2. dataSource 模式：nuqs 默认 shallow 用 `history.replaceState` 直写 URL，**react-router 的 `useSearchParams` 感知不到** → 页面自管拉取（`useTableUrlState → loadData`）不触发。

**修复**：
- request 包装合并 `filterValues`（URL 筛选权威）+ 请求序号竞态防护；
- 请求编排改为**无条件 reload**：page/pageSize/filterKey/sortKey 任一变化（提交/翻页/排序/前进后退/直达）→ reload；删除 `lastUserActionRef` 跳过逻辑；
- `useQueryStates` 启用 `shallow: false` → URL 写入同时走 react-router `navigate`，`useSearchParams` 依赖方（dataSource 页面）可感知。

### 已知边界

- `BuiltinApi`、`DatabaseConnectionManager`、`TableBrowse/Schema` 为 `search={false}` 静态表（无分页/筛选状态），本期未迁移（无可同步状态）；
- nuqs 键隔离仅对本 hook 声明的键生效：`scope` 等既有 URL 键不受表格状态影响。
