# EADAF 补丁包使用说明

把补丁包拷到目标机后解压。目录名与压缩包文件名相同，不要直接盖到正在运行的 `eadaf-runtime` 上。

补丁只换所选程序（前端 `web`、后端 `api`，或两者）。不重装 Docker，不跑表结构，也不改已有数据。

```bash
tar -zxf eadaf-offline-compose-patch-web+api-amd64-v1.2.0-20261007-1430.tar.gz
cd eadaf-offline-compose-patch-web+api-amd64-v1.2.0-20261007-1430
DEPLOY_ROOT=/path/to/eadaf-runtime ./apply.sh
```

`DEPLOY_ROOT` 指向已经在跑的平台目录。用户、组织、权限、应用、Skill/Tool 和业务数据都不在补丁包里。要更新这些，用管理端「应用部署 → EADAF数据导出/导入」或「应用数据导出/导入」。
