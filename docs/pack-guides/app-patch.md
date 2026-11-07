# 应用补丁包使用说明

先确认 EADAF 平台已经在运行。补丁只换所选程序（前端、后端，或两者），不重装 Docker，也不创建集群。

解压后不要盖到正在运行的应用目录上。`DEPLOY_ROOT` 指向已经在跑的 EADAF 平台目录。

```bash
tar -zxf myapp-patch-web-amd64-v0.1.4-20261007-1430.tar.gz
cd myapp-patch-web-amd64-v0.1.4-20261007-1430
DEPLOY_ROOT=/path/to/eadaf-runtime ./apply.sh
```

补丁包不含模型、表结构或业务数据。要更新这些，用管理端「应用部署 → 应用数据导出/导入」。
