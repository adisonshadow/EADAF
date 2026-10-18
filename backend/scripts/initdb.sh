#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

export NODE_ENV="${NODE_ENV:-development}"

# shellcheck disable=SC1091
source "$PROJECT_ROOT/scripts/env.sh"
load_env_file "$PROJECT_ROOT"

DB_HOST="$POSTGRES_HOST"
DB_PORT="$POSTGRES_PORT"
DB_NAME="$POSTGRES_DATABASE"
DB_USER="$POSTGRES_USER"
DB_PASS="$POSTGRES_PASSWORD"
DB_SCHEMA="$POSTGRES_SCHEMA"

PSQL_CMD="psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME"

echo "测试数据库连接..."
PGPASSWORD="$DB_PASS" $PSQL_CMD -c "SELECT 1;" || { echo "数据库连接失败"; exit 1; }

echo "开始重置数据库表..."
PGPASSWORD="$DB_PASS" $PSQL_CMD -c "DROP SCHEMA IF EXISTS $DB_SCHEMA CASCADE; CREATE SCHEMA $DB_SCHEMA;" || { echo "重置数据库失败"; exit 1; }
echo "数据库重置完成"

echo "安装pgcrypto扩展..."
PGPASSWORD="$DB_PASS" $PSQL_CMD -c "CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA public;" || { echo "安装pgcrypto扩展失败"; exit 1; }
echo "pgcrypto扩展安装完成"

echo "开始创建数据库结构..."
PGPASSWORD="$DB_PASS" $PSQL_CMD -f "$SCRIPT_DIR/schemas.sql" || { echo "创建数据库结构失败"; exit 1; }
echo "数据库结构创建完成"

echo "开始写入系统内置应用 EADAF（不含密钥）..."
PGPASSWORD="$DB_PASS" $PSQL_CMD -f "$SCRIPT_DIR/seed-eadaf-application.sql" || { echo "写入系统内置应用失败"; exit 1; }
echo "系统内置应用 EADAF 写入完成"

echo "开始创建 AIBase 数据库结构..."
PGPASSWORD="$DB_PASS" $PSQL_CMD -f "$SCRIPT_DIR/aibase-schema.sql" || { echo "创建 AIBase 数据库结构失败"; exit 1; }
echo "AIBase 数据库结构创建完成"

echo "开始创建 AIBase Skill/Tool 数据库结构..."
PGPASSWORD="$DB_PASS" $PSQL_CMD -f "$SCRIPT_DIR/aibase-skill-tool-schema.sql" || { echo "创建 AIBase Skill/Tool 数据库结构失败"; exit 1; }
echo "AIBase Skill/Tool 数据库结构创建完成"

echo "开始创建业务数据数据库结构..."
PGPASSWORD="$DB_PASS" $PSQL_CMD -f "$SCRIPT_DIR/bizdata-schema.sql" || { echo "创建业务数据数据库结构失败"; exit 1; }
echo "业务数据数据库结构创建完成"

echo "开始创建 API 服务数据库结构..."
PGPASSWORD="$DB_PASS" $PSQL_CMD -f "$SCRIPT_DIR/migrate-bizdata-api-services.sql" || { echo "创建 API 服务数据库结构失败"; exit 1; }
echo "API 服务数据库结构创建完成"

echo "开始创建 API 异常响应模板数据库结构..."
PGPASSWORD="$DB_PASS" $PSQL_CMD -f "$SCRIPT_DIR/migrate-bizdata-api-exception-responses.sql" || { echo "创建 API 异常响应模板数据库结构失败"; exit 1; }
echo "API 异常响应模板数据库结构创建完成"

echo "开始创建采集管道数据库结构..."
PGPASSWORD="$DB_PASS" $PSQL_CMD -f "$SCRIPT_DIR/migrate-bizdata-collection-pipelines.sql" || { echo "创建采集管道数据库结构失败"; exit 1; }
echo "采集管道数据库结构创建完成"

echo "开始创建外部 API 提交（Outbound Webhook）数据库结构..."
PGPASSWORD="$DB_PASS" $PSQL_CMD -f "$SCRIPT_DIR/migrate-outbound-webhooks.sql" || { echo "创建 Outbound Webhook 数据库结构失败"; exit 1; }
echo "Outbound Webhook 数据库结构创建完成"

# ---------------------------------------------------------------------------
# 结构对齐增量迁移（幂等，IF NOT EXISTS）
# 清单在 scripts/incremental-migrations.txt：init-db 与 db:migrate 共用同一份，
# 保证「全新库」和「升级已有库」跑的是同一组迁移，不会各漂各的。
# 这些列/表已前向合并进上面的 base schema，此处同时运行以兼容已存在旧表的库，
# 确保「以现网为准」的结构在 init 后完整。顺序无关、可重复执行。
# ---------------------------------------------------------------------------
echo "开始执行结构对齐增量迁移..."
while IFS= read -r migration; do
  case "$migration" in
    ''|'#'*) continue ;;
  esac
  echo "  → $migration"
  PGPASSWORD="$DB_PASS" $PSQL_CMD -f "$SCRIPT_DIR/$migration" || { echo "迁移失败：$migration"; exit 1; }
done < "$SCRIPT_DIR/incremental-migrations.txt"

echo "结构对齐增量迁移完成"

echo "开始导入 EADAF 权限目录..."
PGPASSWORD="$DB_PASS" $PSQL_CMD -f "$SCRIPT_DIR/eadaf-permissions-catalog-seed.sql" || { echo "导入 EADAF 权限目录失败"; exit 1; }
echo "EADAF 权限目录导入完成"

echo "创建超级管理员..."
PGPASSWORD="$DB_PASS" $PSQL_CMD -f "$SCRIPT_DIR/superadmin.sql" || { echo "创建超级管理员失败"; exit 1; }
echo "超级管理员创建完成"

if [[ "$*" == *"--with-aibase-seed"* ]]; then
    # Demo 用 AI 全量（含 sales-demo 等）。EADAF 全局/专用 Skill 已在上面 migrate-eadaf-ai-skills.sql。
    # 全量 TRUNCATE 种子仍由 export-aibase-ai-seed.js 维护。
    echo "开始导入 AIBase providers/models 示例种子..."
    PGPASSWORD="$DB_PASS" $PSQL_CMD -f "$SCRIPT_DIR/aibase-seed.sql" || { echo "导入 AIBase 种子数据失败"; exit 1; }

    echo "开始导入 AIBase Skill/Tool 权威种子（aibase-ai-seed.sql）..."
    PGPASSWORD="$DB_PASS" $PSQL_CMD -f "$SCRIPT_DIR/aibase-ai-seed.sql" || { echo "导入 AIBase AI 权威种子失败"; exit 1; }
    echo "AIBase 种子数据导入完成"

    echo "开始对齐销售 Demo AI 工具（改为读 EADAF 物化表）..."
    PGPASSWORD="$DB_PASS" $PSQL_CMD -f "$SCRIPT_DIR/migrate-sales-tools-materialized.sql" || { echo "销售 Demo AI 工具迁移失败"; exit 1; }
    echo "销售 Demo AI 工具对齐完成"
fi

# API 契约查询 Tool/Skill：放在 AI 种子之后（--with-aibase-seed 会先 TRUNCATE Skill/Tool，避免被清掉）
PGPASSWORD="$DB_PASS" $PSQL_CMD -f "$SCRIPT_DIR/migrate-eadaf-api-contract-skill.sql" || { echo "API 契约查询 Tool/Skill 落库失败"; exit 1; }

if [[ "$*" == *"--with-mock"* ]]; then
    echo "开始导入测试数据..."
    PGPASSWORD="$DB_PASS" $PSQL_CMD -f "$SCRIPT_DIR/mock_data.sql" || { echo "导入测试数据失败"; exit 1; }
    echo "测试数据导入完成"
    echo "开始导入销售域示例实体（仅 --with-mock）..."
    PGPASSWORD="$DB_PASS" $PSQL_CMD -f "$SCRIPT_DIR/bizdata-seed.sql" || { echo "导入销售域示例实体失败"; exit 1; }
    echo "销售域示例实体导入完成"
fi

echo "数据库操作完成"
