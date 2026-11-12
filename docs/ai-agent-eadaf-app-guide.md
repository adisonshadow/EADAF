# 用 AI 编程 Agent 做 EADAF 应用

这份说明从工艺预览（应用代号 NCDP）接入里提炼，给下一次「让 Agent 在 EADAF 上建一个业务应用」用。它不是 NCDP 的操作手册。不要把应用密钥写进本文档、前端包、Git 提交说明或聊天记录的可公开部分。

## 人必须先交出来的东西

Agent 不能猜这些。缺一项就先停下来问，不要写死一个看起来像对的编号。

| 要交的 | 用来做什么 | NCDP 这次的例子 |
| --- | --- | --- |
| EADAF 已经在跑 | 换 Token、建模型、物化、发布 API | 开发后端 `localhost:29526`，开发前端 `localhost:29527`；部署后端 `9526`，部署前端 `9527` |
| 应用代号 | 公开目录、数据范围、实体前缀 | `NCDP` |
| 应用密钥 | 只放在本应用服务端，用来换应用 Token | 人交给 Agent 写入服务端环境变量，变量名不要带 `VITE_` |
| 本应用端口 | 浏览器只访问这一处 | 开发和部署都是 `9006` |
| 公开目录地址 | 用代号解析 `application_id`，不要把 UUID 写死 | `GET /api/v1/applications-public/NCDP/api-catalog` |
| 集成文档和示例位置 | 对照平台约定，而不是照抄旧示例里已经过时的写法 | `D:\DEV\EADAF\docs\external-app-integration-guide.md`、`D:\DEV\EADAF\docs\eadaf-api-skill\SKILL.md`、`D:\DEV\EADAF\app_example` |
| `eadaf.app.yaml` 样例 | 打包描述。样例短，是因为平台里有对应 preset | `D:\DEV\Asset-Management-Hub803\FPCU2\eadaf.app.yaml` 只有 `preset: fpcu2`。没有 `ncdp` preset 时必须自己写 `services` |

人还要说清楚：这是内部演示还是要公开。密钥进不进仓库，由人明确说。默认做法是密钥只留在服务端环境变量里。

## 业务要怎么讲

用下面这几句讲完，Agent 才建得出模型和权限，而不是先做一堆页面。

1. **谁登录。** 平台 SSO，还是应用自己的用户表。NCDP 是后者：EADAF 用户只做管理；工艺预览自己有 `NCDP:account:User`，用户名允许中文，密码只存 scrypt 哈希。
2. **有哪些东西。** 每种东西一个实体，说清表名和字段。NCDP 的方案是 `NCDP:studio:Project`，表 `ncdp_project`。
3. **谁能看，谁能改。** NCDP：登录后列表混在一起，按修改时间倒序；谁都能打开；只有主人能改和删；复制会变成当前用户的新记录。这条必须由服务端核对，不能只藏按钮。
4. **哪些字段是文件。** 说「参考图和 AI 预览图是文件」。业务 JSON 里只留文件 `objectId`。不要把 data URL 或二进制塞进 DataAPI。MySQL 的 `TEXT` 只有 64KB，图片会撑爆。
5. **缩略图尺寸。** NCDP 方案库卡片大约 `160×200`，参考样图小图大约 `128×160`，`fit=cover`。点开看原图。

没讲清的权限，Agent 应停下来问，不要默认成「全部公开可写」。

## Agent 按这个顺序做

1. **换应用 Token。** `POST /api/v1/applications/token`，body 是 `application_id` 和 `app_secret`。`application_id` 从公开目录读。调内置 API 用 `Authorization: Bearer`，不要加 `?app=`。
2. **写应用范围。** 没有范围时，公开目录 `apis.json` 是空的，业务数据接口也会 403。
   - `api_data_scope.domainCodes` 含应用代号，例如 `["NCDP"]`
   - `bizdata_scope_codes` 含同一个代号
   - `builtin_api_scope.permissionCodes` 至少含这次要用的存储和建模权限
   - 更新应用用 `PUT /api/v1/applications/{id}` 时要带上原来的名称、状态、SSO 和 API 开关，避免把没传的字段写成空
   - 应用 Token 如果改不了这些，停下来，把管理台要勾的名字原样告诉人。不要假装已经授权
3. **建实体和字段，然后物化。** 先 `materialization/preview` 看连接和 SQL，再 `execute`。没物化成功就不要写业务数据。
4. **一个服务只启用一个 operation，然后发布。** `enabledOperations` 只放一项，名字必须来自平台目录（`find`、`findOne`、`findById`、`insertOne`、`updateOne`、`deleteOne`）。编码是 `{实体 code}{后缀}`，例如 `NCDP:studio:ProjectFind`。创建前用 `by-code` 查重。发布后的路径是 `/api/v1/data/{routePath}`。
5. **建文件桶并授权。** `POST /api/v1/storage/buckets`，`accessMode: authenticated`，绑到本应用。上传、预览、裁剪、下载、删除都走平台接口。裁剪是 `GET /api/v1/storage/objects/{objectId}/crop?w=&h=&fit=cover`，响应是 webp。
6. **服务端持密钥。** 浏览器只访问本应用。登录态是服务端自己签的 HttpOnly Cookie。页面不要看到 EADAF Token。
7. **页面只谈自己的登录态。** 列表、只读、作者、缩略图地址都由本应用 API 给。缩略图用本应用上的同源裁剪地址，由服务端换应用 Token 再去请求平台。

NCDP 的服务端接口是 `/api/ncdp/auth/*`、`/api/ncdp/projects`、`/api/ncdp/files/{objectId}` 和 `/crop`。开发时挂在 Vite 同一进程，部署时同一个 Node 进程在 `9006` 同时给静态页和这些接口。

## 这次踩过、下次不要再踩

- **不要自己建 `id`、`created_at`、`updated_at`。** 平台把它们当成系统字段：写进 body 会报「未建模字段」；不写又要求列非空。正确做法是实体里不声明这三列，让物化补上 `gen_random_uuid()` 和 `CURRENT_TIMESTAMP`。插入时执行层会补 `id`。业务上的「最近修改」用一个可写字段，NCDP 用的是 `edited_at`，列表在服务端按它倒序。
- **不要照抄 `app_example` 把 find/update/delete 塞进同一个服务。** 那个示例早于「一服务一 operation」。NCDP 是八个服务：用户 `UserFind`、`UserFindOne`、`UserInsertOne`；方案 `ProjectFind`、`ProjectFindById`、`ProjectInsertOne`、`ProjectUpdateOne`、`ProjectDeleteOne`。
- **SQL 模式可以绑定已物化实体。** TypeScript Handler 还要另写 `handlerScript`。没有现成脚本时用 `scriptMode: "sql"` 加 `entityId`，`enabledOperations` 仍然只有一项。
- **写接口的 body 要包一层。** `insertOne` 发 `{ "body": { ...字段 } }`，`updateOne` 发 `{ "set": { ...字段 } }`。`id`、`created_at`、`updated_at` 不要放进这层。
- **`find` 的 `limit` 上限是 100。** 更多数据用 `skip` 翻页，再在本应用里排序。
- **过滤可以直接用字段名。** 按用户名取一条是 `GET .../UserFindOne?username=`。
- **换图或删除方案时，只删没有被其他记录引用的 object。** 复制方案会共用原来的 objectId。
- **远程生图地址不要长期留在 JSON 里。** 保存时把 data URL 和 http 图片转存进文件桶，JSON 里改成 `eadaf:{objectId}`，返回给浏览器时改成同源地址。相同内容用哈希避免自动保存反复上传。
- **没有 preset 的应用，`eadaf.app.yaml` 必须写 `services`。** 否则 `pack:app` 的通用打包会因为服务列表为空失败。页面和 API 在同一端口时，写一个 `role: web` 的服务即可。
- **容器里不要用 `localhost` 访问 EADAF。** 平台注入 `EADAF_API_BASE_URL`（Compose 里一般是 `http://eadaf-api:9526`）。服务端要先读这个变量，再回退到本机开发用的 `EADAF_API`。镜像里的 `.env.production` 不能覆盖进程已经传入的变量，否则注册会在换 Token 时得到 `fetch failed`，而宿主机上的 `9526` 从外面看仍然是通的。
- **走平台 SSO 的应用不要自己发明登录登出。** 业务页失效先回本应用登录页；这个登录页在没有 `logged_out=1` 时转到 EADAF，并且不得清掉 EADAF 的登录态。退出必须打开 EADAF `/auth/logout` 中转页，不能只删本站 `localStorage`。约定见 [外部应用集成指南的用户 SSO 小节](./external-app-integration-guide.md#用户-sso-单点登录)。NCDP 这种自建用户表不走这条。

## 明确不要做

- 把密钥打进前端，或给变量加 `VITE_` 前缀
- 把图片二进制或 data URL 塞进 DataAPI
- 自造 operation 名（没有 `getDetailById` 这种）
- 跳过物化就写数
- 一个服务塞进多个 operation
- 应用 Token 改不了授权时，假装范围已经生效
- 把 EADAF Token 放进浏览器 Cookie 或本地存储
