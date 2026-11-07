# EADAF 升级包使用说明

把升级包拷到目标机后解压。目录名与压缩包文件名相同，不要直接盖到正在运行的 `eadaf-runtime` 上。

`DEPLOY_ROOT` 指向已经在跑的平台目录。升级保留 `.env` 和数据卷，不重装 Docker / 集群，也不改已有用户、组织、权限、应用、Skill/Tool。

```bash
tar -zxf eadaf-offline-compose-upgrade-amd64-v1.2.0-20261007-1430.tar.gz
cd eadaf-offline-compose-upgrade-amd64-v1.2.0-20261007-1430
DEPLOY_ROOT=/path/to/eadaf-runtime ./apply.sh
```

导入时先跑表结构升级：已记入 `eadaf.schema_migrations` 的 SQL 跳过，只执行新增脚本，然后才重建 API。升级包不含用户、组织、权限目录、应用、Skill/Tool。要更新这些数据，用管理端「应用部署 → EADAF数据导出/导入」或「应用数据导出/导入」。

若现场还留着旧整包里的 FPCU 容器，这次升级不会删除它们。之后用应用包接管。
