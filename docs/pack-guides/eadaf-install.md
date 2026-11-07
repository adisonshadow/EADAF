# EADAF 安装包使用说明

把安装包拷到目标 Linux 后解压。解压出来的目录名是 `eadaf-runtime`。

```bash
tar -zxf eadaf-offline-compose-install-amd64-v1.2.0-20261007-1430.tar.gz
cd eadaf-runtime
```

编辑 `.env`：`PUBLIC_HOST`、`JWT_SECRET`、`ENCRYPTION_KEY`、数据库口令。

```bash
chmod +x install.sh up.sh status.sh ctl.sh init-db.sh
./install.sh
```

`./install.sh` 是安装入口。菜单第 1 项是全自动：先安装 Docker（已有则跳过），再执行 `./up.sh` 启动整栈，并由 `./up.sh` 在结束时执行 `./status.sh`。第 2 项只安装 Docker，不启动容器，也不会自动接着执行 `./up.sh`。每次执行都会把屏幕输出写到 `logs/install-日期-时间.log`。失败时脚本会打印这个日志路径；Docker 起不来时，同一份日志里还有 `systemctl status` 和 `journalctl`。

`./install.sh` 会先列出安装包里的平台和端口。启用 MySQL 时，这一行写成「使用MySQL作为业务数据库（端口 …）」。接着问「是否沿用上面的配置继续安装？」，按回车默认 Y，沿用这些值，不再询问 MySQL 和端口。选 n 才重新选择操作系统、架构和端口。下一步菜单按回车默认第 1 项（全自动安装并启动）。端口被占用时仍会提示重填或退出。安装包没打入 MySQL 时，全程不出现 MySQL。

在线 Compose 会走 `install-docker.sh`（已有 Docker 则跳过）。离线 Compose 安装包内带静态 Docker。

K8s（在线或离线）在同一目录执行 `./k8s/install.sh`。集群需要已经存在。

非交互示例：`./install.sh --os ubuntu --arch amd64 --action up`。

`./up.sh` 会加载镜像、启动 Postgres / Redis（以及已选择的 MySQL）、初始化库、启动 MinIO、API 与 Web，最后用 `./status.sh` 判断是否成功。库里已有表时不会 DROP。

安装包只含最小种子：超级管理员 `admin`（初始密码 `123456`）、根部门「总部」、平台权限码、应用 EADAF，以及 EADAF 自己的 Skill/Tool。不含业务应用和演示数据。容器内端口仍是 API `9526`、Web `9527`，上面填写的是宿主机映射。

装好后打开「系统健康」。`admin` 仍使用初始密码时会有警告，请修改密码或删除该账号。若安装时选择使用 MySQL 作为业务数据库，「业务数据 → 数据库连接」里会有「本地 MySQL（业务库）」，并作为默认连接；PostgreSQL 连接仍保留。

```bash
./ctl.sh reinstall eadaf-web
./ctl.sh logs eadaf-api --tail 100
./ctl.sh down          # 停栈，保留数据卷
```
