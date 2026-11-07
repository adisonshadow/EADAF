# 应用升级包使用说明

先确认 EADAF 平台已经在运行。升级包不重装 Docker，也不创建集群。

解压后不要盖到正在运行的应用目录上。`DEPLOY_ROOT` 指向已经在跑的 EADAF 平台目录。

```bash
tar -zxf myapp-upgrade-amd64-v0.1.4-20261007-1430.tar.gz
cd myapp-upgrade-amd64-v0.1.4-20261007-1430
DEPLOY_ROOT=/path/to/eadaf-runtime ./apply.sh
```

升级包只含程序：镜像与前端页面。不改模型、不物化表、不写业务数据。这些用管理端「应用部署 → 应用数据导出/导入」。
