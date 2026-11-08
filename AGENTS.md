# Agent 协作说明

本仓库远程为 [adisonshadow/EADAF](https://github.com/adisonshadow/EADAF)，默认主干分支是 **`main`**。Issue / PR / checks / release 一律用 GitHub CLI（`gh`），不要手写 curl 调 GitHub API。

## 大陆网络：进程级代理

访问 GitHub（含 `git push` / `git pull` / `gh`）直连失败时，只给当前进程设代理，**不要改 git config**：

```bash
export http_proxy=http://127.0.0.1:7897
export https_proxy=http://127.0.0.1:7897
```

代理端口以本机为准（Clash 等常见 `7897`）。连不上时先确认 `127.0.0.1:7897` 是否在监听。

## 标准流程：Issue → 分支 → PR → 合并 main

未经用户明确要求，不要 commit、不要 push、不要开 PR、不要 merge。

### 1. 先建 Issue

用 Issue 写清要做什么、范围和验收标准。后续提交和 PR 都关联这个 Issue。

```bash
gh issue create --title "简要标题" --body "$(cat <<'EOF'
## 背景
...

## 范围
- ...

## 验收
- [ ] ...
EOF
)"
```

### 2. 从最新 main 拉功能分支

不要直接在 `main` 上提交。

```bash
git checkout main
git pull origin main
git checkout -b feat/short-name
```

分支名沿用仓库习惯：`feat/...`、`fix/...`。

### 3. 提交时引用 Issue

提交信息写 **why**，不要罗列文件。正文用 `Refs #N`；该提交合入后应关闭 Issue 时用 `Closes #N`。

不要提交 `.env*`、密钥、`credentials.json`、`.zcode/plans/` 等本地文件。不要 `--no-verify` / `--no-gpg-sign`。不要改 git config。

### 4. 推送并开 PR

PR 目标为 `main`。Body 含 Summary、Test plan，并写 `Closes #N`，合并后 GitHub 会自动关闭对应 Issue。

```bash
git push -u origin HEAD

gh pr create --title "简要标题" --body "$(cat <<'EOF'
## Summary
- ...

## Test plan
- [ ] ...

Closes #N
EOF
)"
```

### 5. 合并到 main

仅在用户明确要求合并时执行。本仓库历史 PR 使用 merge commit（例如 `#2`），默认：

```bash
gh pr merge --merge
```

不要对 `main` 做 force push。远程已有提交时不要擅自 `--force`；用户明确要求且目标不是 `main`/`master` 时才可考虑。

合并后本地切回 `main` 并拉取：

```bash
git checkout main
git pull origin main
```

## 常用 `gh` 命令

```bash
gh auth status
gh issue list
gh issue view <n>
gh pr list
gh pr view <n>
gh pr checks
gh pr merge <n> --merge
```

给定 GitHub URL 时，用 `gh` 拉取 Issue / PR / check 信息，不要只靠页面猜测。

## 安装 / 升级 / 补丁说明

改了目标机上的安装、升级、补丁步骤时，同一轮改动必须更新对应的 `docs/pack-guides/*.md`。这些文件会打进包根目录，文件名是 `使用说明.md`，发布页的帮助按钮也读它们。

涉及：`eadaf-runtime/install.sh`、`up.sh`、`apply-upgrade.sh`、`apply-patch.sh`、应用包 `apply.sh`、对外端口、是否启用 MySQL、包里有没有数据或表结构。

- 只改某一种说明的正文：改对应的 markdown，不用改对照表。
- 新增或改名一种说明：同时改 `docs/pack-guides/catalog.json`。预览接口和 `pack-eadaf.sh` / `pack-app.sh` 都读这张表。
- 不要把 `docs/` 挂到网页上。页面只传 `target` 和 `kind`，不能传文件路径。

## 换行按文件格式

以 [`.gitattributes`](.gitattributes) 为准，不要按操作系统一刀切。

- **LF**：`*.sh`、`*.bash`、`*.bats`、容器入口脚本、`Dockerfile`、`*.cjs`、`*.sql`、`*.template`、`*.conf`、`*.service`。这些会在 Linux 的 sh 里执行，不能带 CR。
- **CRLF**：`*.bat`、`*.cmd`、`*.ps1`、`*.psm1`。这是 Windows 脚本。
- 改完后按后缀核对，不要把 bat/cmd 存成 LF，也不要把 sh 存成 CRLF。
