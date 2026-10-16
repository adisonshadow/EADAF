# EADAF 外部应用接入指南

> **以「故检修理管理系统 FMMS」为例**，讲解外部系统如何接入 EADAF 平台，配置鉴权并调用 API。
>
> 本指南面向 **FMMS 后端开发者**。EADAF 侧的数据模型创建、API 服务发布、指标配置等管理操作由 EADAF 管理员完成，本指南不展开。

---

## 目录

1. [整体架构与对接全景](#1-整体架构与对接全景)
2. [EADAF 管理员侧准备（FMMS 需了解）](#2-eadaf-管理员侧准备fmms-需了解)
3. [第一步：获取应用凭证](#第一步获取应用凭证)
4. [第二步：换取访问令牌](#第二步换取访问令牌)
5. [第三步：调用内置 API](#第三步调用内置-api)
6. [第四步：调用业务数据 API](#第四步调用业务数据-api)
7. [第五步：提交采集数据（采集管道）](#第五步提交采集数据采集管道)
8. [第六步：文件存储](#第六步文件存储)
9. [API 发现：公开目录](#api-发现公开目录)
10. [完整代码示例](#完整代码示例)
11. [用户 SSO 单点登录](#用户-sso-单点登录)
12. [常见问题与注意事项](#常见问题与注意事项)

---

## 1. 整体架构与对接全景

```
┌─────────────────────────┐         ┌──────────────────────────────────┐
│   FMMS（故检修理管理系统）  │         │            EADAF 平台              │
│                         │         │                                  │
│  FMMS 后端服务           │         │  ┌────────────────────────────┐  │
│  （Java / Python / …）   │         │  │  内置 API（用户/组织/权限）   │  │
│                         │  HTTPS  │  │  GET /api/v1/users          │  │
│   1. 换取 Token          │ ──────► │  │  GET /api/v1/departments    │  │
│   2. 调用 API            │ ◄────── │  └────────────────────────────┘  │
│   3. 提交采集数据         │         │  ┌────────────────────────────┐  │
│   4. 上传/下载文件        │         │  │  业务数据 API（已发布服务）   │  │
│                         │         │  │  GET /api/v1/data/fmms/...  │  │
└─────────────────────────┘         │  └────────────────────────────┘  │
                                    │  ┌────────────────────────────┐  │
                                    │  │  采集管道（数据接入）         │  │
                                    │  │  POST /api/v1/ingest/...   │  │
                                    │  └────────────────────────────┘  │
                                    └──────────────────────────────────┘
```

**核心概念：**

| 概念 | 说明 |
|------|------|
| **应用（Application）** | EADAF 中注册的 FMMS 实体，拥有独立的 `application_id` + `app_secret` |
| **app_secret** | 应用统一密钥，用于换取访问令牌（**仅在 FMMS 服务端保存，绝不暴露到前端**） |
| **访问令牌（JWT）** | 用 `app_secret` 换取的 Bearer Token，默认有效期 24 小时 |
| **内置 API** | EADAF 平台自带的用户/组织/角色/权限等管理 API |
| **业务数据 API** | EADAF 管理员为 FMMS 数据模型创建并发布的 REST API |
| **采集管道** | FMMS 向 EADAF 提交原始数据（如设备传感器读数）的入口 |
| **用户 SSO JWT** | 终端用户经 EADAF 登录后回调下发的用户令牌（与下方应用 Token **不是同一种**） |

> 若 FMMS 需要「用户登录 EADAF 后进入业务前端」，见 [用户 SSO 接入指南](./sso-integration-guide.md)。本章后续步骤讲的是 **服务端应用 Token** 调 API。

---

## 2. EADAF 管理员侧准备（FMMS 需了解）

在 FMMS 开始对接前，EADAF 管理员需要完成以下准备工作（这些由管理员在 EADAF 控制台操作）：

| 步骤 | 操作 | 产出 |
|------|------|------|
| ① | 在「应用管理」创建应用，名称填「FMMS 故检修理管理系统」，code 填 `FMMS` | 获得 `application_id`（UUID） |
| ② | 点击「密钥管理」→「生成密钥」 | 获得 `app_secret`（64 位十六进制字符串） |
| ③ | 点击「API 配置」→ 开启「启用 API」 | 应用 API 功能激活 |
| ④ | 在「可访问 API 域」勾选 FMMS 需要的业务数据域 | 授权数据 API 访问范围 |
| ⑤ | 在「可访问内置 API」勾选 FMMS 需要的内置 API（如用户列表、部门列表等） | 授权内置 API 访问范围 |
| ⑥ | （如需采集）创建采集管道并发布，将 FMMS 应用加入允许列表 | 获得 ingest 路由路径 |

**FMMS 开发者需要向 EADAF 管理员索要：**

- `application_id`（如 `550e8400-e29b-41d4-a716-446655440000`）
- `app_secret`（如 `a1b2c3d4...` 共 64 位）
- EADAF 服务基地址（如 `https://eadaf.your-company.com`）
- 已授权的 API 清单（或公开目录地址）

---

## 第一步：获取应用凭证

EADAF 管理员在控制台完成应用注册和密钥生成后，会提供以下信息：

```
application_id = 550e8400-e29b-41d4-a716-446655440000
app_secret     = a1b2c3d4e5f6...（64 位十六进制，仅出现一次，请妥善保存）
base_url       = https://eadaf.your-company.com
```

> ⚠️ **安全要求**
> - `app_secret` **只在 FMMS 服务端保存**（环境变量 / 密钥管理服务），绝不写入前端代码、Git 仓库、日志或 URL 参数
> - 生产环境务必使用 HTTPS
> - 开发/测试/生产环境使用不同的应用和密钥

---

## 第二步：换取访问令牌

FMMS 后端使用 `application_id` + `app_secret` 向 EADAF 换取 JWT 访问令牌。

### 请求

```http
POST {base_url}/api/v1/applications/token
Content-Type: application/json

{
  "application_id": "550e8400-e29b-41d4-a716-446655440000",
  "app_secret": "a1b2c3d4e5f6..."
}
```

### 成功响应

```json
{
  "code": 200,
  "message": "获取成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### 错误响应

| HTTP 状态码 | message | 原因 |
|------------|---------|------|
| 400 | application_id 和 app_secret 不能为空 | 参数缺失 |
| 401 | 无效的 app_secret | 密钥错误 |
| 404 | 应用不存在 | application_id 错误 |

### 令牌有效期

- 默认 **24 小时**（EADAF 服务端可配置 `JWT_EXPIRES_IN`）
- 令牌过期后需重新调用本接口换取新令牌
- 建议 FMMS 在令牌到期前主动刷新（如提前 5 分钟）

### 说明

该接口为**公开接口**，无需携带已有 Token。EADAF 通过 body 中的 `application_id + app_secret` 校验应用身份后签发 JWT。外部应用首次对接时直接调用即可。

---

## 第三步：调用内置 API

获取令牌后，FMMS 可以调用 EADAF 的内置 API（用户、组织、角色、权限等）。

### 认证方式

所有 API 请求在 Header 中携带：

```
Authorization: Bearer {token}
```

### 示例：获取用户列表

```http
GET {base_url}/api/v1/users?page=1&size=20
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**响应：**

```json
{
  "code": 200,
  "message": "获取用户列表成功",
  "data": {
    "total": 156,
    "items": [
      {
        "user_id": "10000000-0000-4000-8000-000000000001",
        "username": "zhang_san",
        "name": "张三",
        "email": "zhangsan@company.com",
        "department_id": "dept-001",
        "status": "ACTIVE"
      }
    ],
    "page": 1,
    "size": 20
  }
}
```

### 常用内置 API 速查

| 功能 | 方法 | 路径 | 需要授权 code |
|------|------|------|--------------|
| 用户列表 | GET | `/api/v1/users` | `user:account:list` |
| 用户详情 | GET | `/api/v1/users/:user_id` | `user:account:get` |
| 创建用户 | POST | `/api/v1/users` | `user:account:create` |
| 部门列表 | GET | `/api/v1/departments` | `organization:department:list` |
| 部门树 | GET | `/api/v1/departments/tree` | `organization:department:tree` |
| 部门成员 | GET | `/api/v1/departments/:department_id/users` | `organization:department:members` |
| 角色列表 | GET | `/api/v1/roles` | `authorization:role:list` |
| 权限列表 | GET | `/api/v1/permissions` | `authorization:permission:list` |
| 业务数据模型 | GET | `/api/v1/business-data/schema` | `bizdata:entity:schema` |
| 执行物化 | POST | `/api/v1/business-data/materialization/execute` | `bizdata:materialization:execute` |
| 指标看板 | GET | `/api/v1/business-data/metrics/dashboard` | `bizdata:metrics:dashboard` |
| AI 对话 | POST | `/api/v1/ai/chat/completions` | `ai:runtime:chat` |

> **授权机制说明**：应用令牌（`type: 'application'`）调用内置 API 时，仅检查该 API 的 `code` 是否在应用的 `builtin_api_scope.permissionCodes` 中。**不受角色/组织限制**（角色/组织限制仅对用户令牌生效）。EADAF 系统应用（code=`EADAF`）不受任何限制。

### 示例：获取部门树

```http
GET {base_url}/api/v1/departments/tree
Authorization: Bearer {token}
```

```json
{
  "code": 200,
  "data": [
    {
      "department_id": "dept-001",
      "name": "设备维修中心",
      "code": "repair_center",
      "children": [
        {
          "department_id": "dept-001-01",
          "name": "机械维修科",
          "code": "mechanical"
        }
      ]
    }
  ]
}
```

---

## 第四步：调用业务数据 API

EADAF 管理员为 FMMS 的数据模型（如故障工单、设备台账、维修记录）创建并发布 API 服务后，FMMS 可通过数据 API 查询和操作业务数据。

### 调用方式

```http
GET {base_url}/api/v1/data/{routePath}
Authorization: Bearer {token}
```

`routePath` 是 API 服务的路由路径（由 EADAF 管理员在创建 API 服务时定义，如 `fmms/faultOrderFind`）。

写操作（删除 / 更新）按 OpenAPI 使用 REST 方法与 path id，例如：

```http
DELETE {base_url}/api/v1/data/IPS/master/WorkstationDelete/{id}
PATCH  {base_url}/api/v1/data/IPS/master/WorkstationUpdate/{id}
Content-Type: application/json

{ "body": { "name": "新名称" } }
```

亦兼容 `POST` 到无后缀的 `routePath`，在 JSON body 中传 `id`。错误响应（含 405）均为 `{ "code", "message", "data" }` JSON 信封。

### 示例：查询故障工单列表

```http
GET {base_url}/api/v1/data/fmms/faultOrderFind?operation=find&limit=10&skip=0&filter={"status":"open"}
Authorization: Bearer {token}
```

> 业务数据 API 的分页请求参数为 **`limit` + `skip`**（不要用平台内置用户列表的 `page`/`size` 混用）。

**响应（分页列表必须遵守）：**

```json
{
  "code": 200,
  "message": "调用成功",
  "data": {
    "items": [
      {
        "order_no": "GD-2026-0001",
        "equipment_code": "EQ-001",
        "fault_desc": "主轴轴承异响",
        "status": "open",
        "created_at": "2026-07-10T08:30:00Z"
      }
    ],
    "pagination": {
      "total": 42,
      "page": 1,
      "pageSize": 10,
      "totalPages": 5,
      "hasNext": true
    }
  }
}
```

| 字段 | 说明 |
|------|------|
| `items` | 当前页记录 |
| `pagination.total` | 总记录数（必须） |
| `pagination.page` | 当前页，从 1 开始 |
| `pagination.pageSize` | 每页条数 |
| `pagination.totalPages` | 总页数 |
| `pagination.hasNext` | 是否有下一页 |

**所有带分页的业务数据列表 API** 均须返回上述 `items` + `pagination` 结构；禁止仅平铺 `total`/`count`。

### 参数传递

参数可通过三种方式传递：

| 方式 | 示例 | 适用场景 |
|------|------|---------|
| Query 参数 | `?limit=10&skip=0&operation=find` | GET 请求，简单过滤与分页 |
| JSON Body | `{"status": "open", "level": "urgent"}` | POST 请求 |
| parameters 嵌套 | `{"parameters": {"status": "open"}}` | POST 请求（推荐） |

### SSE 流式查询

对于大数据量查询，支持 SSE 流式返回：

```http
GET {base_url}/api/v1/stream/data/fmms/faultOrderFind?status=open
Authorization: Bearer {token}
Accept: text/event-stream
```

**SSE 事件流：**

```
event: meta
data: {"serviceId":"...","code":"fmms:faultOrderFind","operation":"find"}

event: item
data: {"index":0,"item":{"order_no":"GD-2026-0001",...}}

event: item
data: {"index":1,"item":{"order_no":"GD-2026-0002",...}}

event: done
data: {"total":42,"count":2}
```

> **注意**：SSE 仅支持读类操作（find / aggregate 等），不支持写入操作。

### ⚠️ 业务数据 API 调用限制

> 应用令牌调用业务数据 API 时，目标 API 服务必须设置为**「无限制」**访问策略。如果 API 服务配置了角色/组织限制，应用令牌会收到 `403 无权访问该 API 服务`。如需受限访问，请联系 EADAF 管理员调整。

---

## 第五步：提交采集数据（采集管道）

FMMS 可通过采集管道向 EADAF 提交原始数据（如设备传感器读数、实时状态），由 EADAF 侧的管道脚本解析、转换并存储。

### 请求格式

```http
POST {base_url}/api/v1/ingest/{routePath}
Authorization: Bearer {token}
Content-Type: application/octet-stream

<原始字节数据>
```

- `routePath`：采集管道的路由路径（由 EADAF 管理员创建管道时定义）
- **Content-Type**：根据管道协议类型选择（`application/octet-stream` / `text/plain` 等）
- **请求体**：原始数据（非 JSON），最大 **1MB**

### 示例：提交设备传感器数据

```bash
curl -X POST "{base_url}/api/v1/ingest/fmms/sensorIngest" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@/tmp/sensor_data.bin"
```

**响应：**

```json
{
  "code": 200,
  "message": "数据采集成功",
  "data": {
    "processed": 1,
    "pipeline": "fmms:sensorIngest"
  }
}
```

### 采集管道授权

采集管道可配置应用白名单（`restrictSources` + `applicationIds`）：
- **未开启限制**：任何持有有效令牌的应用均可提交
- **已开启限制**：仅白名单内的 `application_id` 可提交，否则返回 `403`

---

## 第六步：文件存储

FMMS 可使用 EADAF 的文件存储能力上传/下载附件（如维修照片、检测报告）。

### 上传文件

```http
POST {base_url}/api/v1/storage/objects/upload
Authorization: Bearer {token}
Content-Type: multipart/form-data

# FormData:
#   bucketId: <目标 Bucket ID>
#   file: <文件二进制>
```

### 下载文件

```http
GET {base_url}/api/v1/storage/objects/{objectId}/download
Authorization: Bearer {token}
```

### 预览图片

```http
GET {base_url}/api/v1/storage/objects/{objectId}/preview
Authorization: Bearer {token}
```

---

## API 发现：公开目录

FMMS 开发者可通过公开目录接口**无需登录**地查看 FMMS 应用被授权的全部 API 清单（含参数结构、响应结构）。

### 请求

```http
GET {base_url}/api/v1/applications-public/{key}/api-catalog
```

`key` 可以是应用 code（`FMMS`）或 `application_id`。

### 返回内容

```json
{
  "code": 200,
  "data": {
    "application": {
      "application_id": "550e8400-...",
      "name": "FMMS 故检修理管理系统",
      "code": "FMMS"
    },
    "tree": [
      {
        "code": "fmms",
        "name": "fmms",
        "isDomainNode": true,
        "children": [...]
      }
    ],
    "services": [
      {
        "code": "fmms:faultOrderFind",
        "name": "故障工单查询",
        "routePath": "fmms/faultOrderFind",
        "basePath": "/api/v1/data/fmms/faultOrderFind",
        "operations": [
          {
            "operation": "find",
            "httpMethod": "GET",
            "routePattern": "",
            "parametersSchema": { "type": "object", "properties": {...} },
            "mockParameters": { "status": "open" },
            "responseInterface": "interface Result { items: FaultOrder[]; pagination: { total: number; page: number; pageSize: number; totalPages: number; hasNext: boolean } }"
          }
        ]
      }
    ],
    "builtinApis": [
      {
        "code": "user:account:list",
        "label": "用户列表",
        "routePath": "/api/v1/users",
        "httpMethods": ["GET"],
        "actions": ["read"]
      }
    ],
    "builtinApiTree": [...]
  }
}
```

> 💡 **提示**：公开目录还提供了 Swagger 风格的在线文档页面，访问地址为：
> `{前端地址}/public/applications/FMMS/api-docs`
> 可直接在浏览器中打开查阅，无需登录。

---

## 完整代码示例

### Python 示例

```python
import json
import requests
import os

class EADAFClient:
    """EADAF 平台 API 客户端"""

    def __init__(self, base_url, application_id, app_secret):
        self.base_url = base_url.rstrip('/')
        self.application_id = application_id
        self.app_secret = app_secret
        self.token = None

    def get_token(self):
        """换取访问令牌"""
        headers = {"Content-Type": "application/json"}

        resp = requests.post(
            f"{self.base_url}/api/v1/applications/token",
            json={
                "application_id": self.application_id,
                "app_secret": self.app_secret,
            },
            headers=headers,
        )
        data = resp.json()
        if data.get("code") == 200:
            self.token = data["data"]["token"]
            return self.token
        raise Exception(f"获取 Token 失败: {data.get('message')}")

    def _request(self, method, path, **kwargs):
        """发送已认证请求"""
        if not self.token:
            raise Exception("未获取 Token，请先调用 get_token()")
        headers = kwargs.pop("headers", {})
        headers["Authorization"] = f"Bearer {self.token}"
        resp = requests.request(
            method,
            f"{self.base_url}{path}",
            headers=headers,
            **kwargs,
        )
        return resp.json()

    # ===== 内置 API =====

    def list_users(self, page=1, size=20):
        """获取用户列表"""
        return self._request("GET", "/api/v1/users", params={"page": page, "size": size})

    def get_department_tree(self):
        """获取部门树"""
        return self._request("GET", "/api/v1/departments/tree")

    # ===== 业务数据 API =====

    def query_fault_orders(self, status=None, limit=10, skip=0):
        """查询故障工单（业务数据 find：limit/skip）"""
        params = {"operation": "find", "limit": limit, "skip": skip}
        if status:
            params["filter"] = json.dumps({"status": status})
        return self._request("GET", "/api/v1/data/fmms/faultOrderFind", params=params)

    # ===== 采集管道 =====

    def ingest_sensor_data(self, raw_bytes):
        """提交传感器原始数据"""
        resp = requests.post(
            f"{self.base_url}/api/v1/ingest/fmms/sensorIngest",
            data=raw_bytes,
            headers={
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/octet-stream",
            },
        )
        return resp.json()


# ===== 使用示例 =====
if __name__ == "__main__":
    client = EADAFClient(
        base_url=os.getenv("EADAF_BASE_URL", "https://eadaf.your-company.com"),
        application_id=os.getenv("EADAF_APP_ID"),
        app_secret=os.getenv("EADAF_APP_SECRET"),
    )

    # 1. 获取 Token（公开接口，直接用 application_id + app_secret 换取）
    token = client.get_token()
    print(f"Token: {token[:20]}...")

    # 2. 调用内置 API
    users = client.list_users(page=1, size=5)
    print(f"用户总数: {users['data']['total']}")

    dept_tree = client.get_department_tree()
    print(f"部门: {len(dept_tree['data'])} 个根部门")

    # 3. 查询业务数据
    orders = client.query_fault_orders(status="open")
    print(f"未处理工单: {orders['data']['pagination']['total']} 条")

    # 4. 提交采集数据
    sensor_data = b"\x01\x02\x03\x04"  # 实际的传感器原始字节
    result = client.ingest_sensor_data(sensor_data)
    print(f"采集结果: {result}")
```

### Java 示例（关键片段）

```java
// EADAF 客户端 - Token 获取与 API 调用
public class EadafClient {
    private final String baseUrl;
    private final String applicationId;
    private final String appSecret;
    private String token;

    // 换取 Token（公开接口，无需已有 Token）
    public void refreshToken() throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(baseUrl + "/api/v1/applications/token").openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setDoOutput(true);
        String body = String.format(
            "{\"application_id\":\"%s\",\"app_secret\":\"%s\"}",
            applicationId, appSecret
        );
        conn.getOutputStream().write(body.getBytes(StandardCharsets.UTF_8));

        // 解析响应获取 token
        String response = new String(conn.getInputStream().readAllBytes());
        // JSON 解析提取 data.token ...
        this.token = parseTokenFromResponse(response);
    }

    // 调用内置 API
    public String listUsers(int page, int size) throws Exception {
        return apiGet("/api/v1/users?page=" + page + "&size=" + size);
    }

    // 调用业务数据 API
    public String queryFaultOrders(String status) throws Exception {
        return apiGet("/api/v1/data/fmms/faultOrderFind?status=" + status);
    }

    private String apiGet(String path) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(baseUrl + path).openConnection();
        conn.setRequestProperty("Authorization", "Bearer " + token);
        return new String(conn.getInputStream().readAllBytes());
    }
}
```

---

## 用户 SSO 单点登录

当需要**终端用户**登录 EADAF 并进入业务前端（而非仅服务端调 API）时，使用用户 SSO，而不是 `applications/token`。

要点（详情见权威文档）：

- EADAF 应用配置的 `redirect_uri` 填 **BFF** 回调，不要填前端页面
- 对接推荐 `HEADER_REDIRECT`；平台默认仍为 `POST_REDIRECT`
- 用户 JWT 与应用 API Token 使用同一应用密钥体系签发/验签，但**令牌用途不同**，不可混用
- HashRouter（Electron）二次跳转必须带 `/#/auth/callback?...`

完整流程、BFF 接口清单、联调与排障：**[用户 SSO 接入指南](./sso-integration-guide.md)**。

---

## 常见问题与注意事项

### Token 相关

| 问题 | 解决方案 |
|------|---------|
| Token 过期（401） | 重新调用 `/api/v1/applications/token` 换取新 Token |
| `app_secret` 泄露 | 立即通知 EADAF 管理员重新生成密钥，旧 Token 失效 |
| 频繁换 Token | Token 默认 24h 有效，建议缓存并在到期前 5 分钟刷新 |
| 用户 SSO 登录后又回登录页 | 见 [SSO 故障速查](./sso-integration-guide.md#10-常见故障速查)：Hash 回调格式、StrictMode、check 误清 token |
| SSO `check` 总是 401 | 验签密钥须与「密钥管理」一致，且请求带 `?app={application_id}` |
| 业务应用一发 EADAF 请求就掉登录 | 该接口的 401 被当成会话失效：SSO 用户 JWT（应用密钥签发）调 AI / DataAPI 等接口时漏带 `?app=` 必然 401。见 [SSO §6.3 验签密钥怎么选](./sso-integration-guide.md#63-验签密钥怎么选app-与令牌自述)，并让 401 先复核 `/auth/check?app=` 再清登录态 |
| DataAPI 403 但用户已登录 | 缺的是**应用 Token / 域授权**，与用户 SSO JWT 无关 |

### 权限相关

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| `403 无权访问该内置 API：未授权` | 该内置 API 未在应用的「可访问内置 API」中授权 | 联系 EADAF 管理员在应用 API 配置中勾选对应 API |
| `403 无权访问该 API 服务` | 业务数据 API 配置了角色/组织限制，应用令牌无法通过 | 联系 EADAF 管理员将 API 访问策略改为「无限制」 |
| `401 无效的应用令牌` | 应用未启用 API 或状态非 ACTIVE | 联系管理员检查应用状态和 `api_enabled` |
| `403 当前业务系统无权向该采集管道提交数据` | 采集管道开启了来源限制且未包含 FMMS | 联系管理员将 FMMS 加入管道应用白名单 |

### 请求格式

| 问题 | 原因 |
|------|------|
| `413 请求体超过 1MB 限制` | 采集管道请求体超过 1MB，需分批提交 |
| `400` 参数错误 | 检查请求参数是否符合 API 目录中的 JSON Schema 定义 |
| 采集数据解析失败 | 确认 Content-Type 与管道协议类型匹配 |

### 最佳实践

1. **Token 管理**：在 FMMS 服务端缓存 Token，设置定时刷新（提前于过期时间），避免每次请求都换 Token
2. **错误重试**：对 401 错误实现自动刷新 Token 后重试的机制
3. **分页查询**：业务数据列表使用 `limit` + `skip`，响应读取 `data.items` 与 `data.pagination`；平台内置列表仍可用 `page` + `size`。大数据量也可使用 SSE 流式接口
4. **环境隔离**：开发/测试/生产环境使用不同的 EADAF 应用和密钥
5. **日志脱敏**：日志中不要记录完整的 `app_secret` 和 `token`
6. **超时设置**：HTTP 客户端设置合理的连接超时（建议 10s）和读取超时（建议 30s）

---

## 附录：标准响应格式

所有 EADAF API 使用统一的响应格式：

```json
{
  "code": 200,
  "message": "success",
  "data": { ... }
}
```

错误响应：

```json
{
  "code": 403,
  "message": "无权访问该内置 API：未授权",
  "data": null
}
```

---

> **文档版本**：2026-08-09  
> **适用 EADAF 版本**：当前开发版  
> **SSO 权威文档**：[sso-integration-guide.md](./sso-integration-guide.md)  
> **如有疑问**：联系 EADAF 平台管理员
