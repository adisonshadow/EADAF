# 应用安装包使用说明

先确认 EADAF 平台已经启动，再导入应用包。应用包不负责安装 Docker 或创建集群。`apply.sh` 读取平台目录里的 `.deploy-mode`：Compose 走 `docker compose`，K8s 走 `kubectl apply`。

```bash
tar -zxf myapp-install-amd64-v0.1.3-20261007-1430.tar.gz
cd myapp-install-amd64-v0.1.3-20261007-1430
DEPLOY_ROOT=/path/to/eadaf-runtime ./apply.sh
```

安装包只含程序：镜像与前端页面。`apply.sh` 只注册应用到 EADAF，并拉起容器。不建模型、不物化表、不写业务数据。模型、数据 API 与业务数据用管理端「应用部署 → 应用数据导出/导入」。

对外地址跟随浏览器 Host。SSO 回调和前端拼 EADAF 地址都用「当前访问的 hostname + 端口」，不把客户 IP 或域名写进包。换服务器或改域名一般不必改 `.env`。`.env` 里主要是容器内互调（如 `EADAF_API_BASE_URL=http://eadaf-api:9526`）和应用端口。

登录成功后如果跳到 localhost：登录请求的 Host 被写成了 localhost，或回调那一跳的 Host 是 localhost。需要固定地址时，在平台 `.env` 写上应用的对外地址，并把对应的 `_FORCE` 设为 `1`，然后重启应用的 BFF。这些绝对地址要在安装完成之后再写，安装过程会清掉包里残留的 localhost 地址。
