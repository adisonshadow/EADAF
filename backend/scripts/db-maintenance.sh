#!/bin/bash

# Database Maintenance Script
# Usage: ./db-maintenance.sh [VACUUM|ANALYZE|REINDEX|ALL]

# Database connection parameters（与后端同一套 env 级联，见 scripts/env.sh）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
export NODE_ENV="${NODE_ENV:-development}"
# shellcheck disable=SC1091
source "$PROJECT_ROOT/scripts/env.sh"
load_env_file "$PROJECT_ROOT"
DB_NAME="${POSTGRES_DATABASE:?请在 .env.$NODE_ENV 中配置 POSTGRES_DATABASE}"
SCHEMA="${POSTGRES_SCHEMA:-eadaf}"
DB_HOST="${POSTGRES_HOST:-}"
DB_PORT="${POSTGRES_PORT:-}"
DB_USER="${POSTGRES_USER:-}"
LOG_DIR="logs"
LOG_FILE="$LOG_DIR/db-maintenance-$(date +%Y%m%d_%H%M%S).log"

# 连接参数只在这里拼一次。
# 历史坑：这个脚本曾经把 env 级联读进来却只用 POSTGRES_DATABASE，其余 9 处 psql 都是裸的
# `psql -d $DB_NAME` —— 于是连的是本机 socket / localhost:5432 / OS 用户，
# 而本项目的库在 Docker 里（默认 25432、用户 my_name），必然连不上。
PSQL_ARGS=(-d "$DB_NAME")
if [ -n "$DB_HOST" ]; then PSQL_ARGS+=(-h "$DB_HOST"); fi
if [ -n "$DB_PORT" ]; then PSQL_ARGS+=(-p "$DB_PORT"); fi
if [ -n "$DB_USER" ]; then PSQL_ARGS+=(-U "$DB_USER"); fi

if [ -n "${POSTGRES_PASSWORD:-}" ]; then
    export PGPASSWORD="$POSTGRES_PASSWORD"
fi

psql_cmd() {
    psql "${PSQL_ARGS[@]}" "$@"
}

# 报错时能一眼看出连的是谁，而不是只说「连不上」
db_target() {
    echo "${DB_USER:-$(id -un 2>/dev/null || echo '<默认用户>')}@${DB_HOST:-<默认 socket>}:${DB_PORT:-5432}/$DB_NAME"
}

# Create log directory if it doesn't exist
mkdir -p $LOG_DIR

# Function to log messages
log_message() {
    local message="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] $message" | tee -a "$LOG_FILE"
}

# Function to check database connection and schema existence
check_db_connection() {
    log_message "Checking database connection and schema existence..."

    if ! command -v psql > /dev/null 2>&1; then
        log_message "Error: 未找到 psql（postgresql-client）"
        log_message "  装客户端：apt install postgresql-client / brew install libpq"
        log_message "  或直接用 Docker 里的 psql："
        log_message "    docker compose exec -T postgres psql -U ${DB_USER:-postgres} -d $DB_NAME -c 'ANALYZE'"
        exit 1
    fi

    # 只抓 stderr（stdout 丢弃）：连不上时 psql 的原始报错是唯一有用的线索，不能再吞掉
    local connect_error
    if ! connect_error="$(psql_cmd -v ON_ERROR_STOP=1 -c 'SELECT 1' 2>&1 >/dev/null)"; then
        log_message "Error: Cannot connect to database $DB_NAME ($(db_target))"
        log_message "原因：${connect_error//$'\n'/ }"
        log_message "连接参数来自 env 级联：.env → .env.$NODE_ENV → .env.$NODE_ENV.local（真实环境变量优先）"
        log_message "确认最终生效值：node scripts/lib/load-env.cjs --value POSTGRES_PORT"
        log_message "库若在 Docker 里：docker compose up -d postgres（默认映射 25432）"
        exit 1
    fi
    # Check schema existence
    if ! psql_cmd -t -c "SELECT 1 FROM information_schema.schemata WHERE schema_name = '$SCHEMA'" | grep -q 1; then
        log_message "Error: Schema $SCHEMA does not exist"
        log_message "  建库：pnpm init-db；改名过的库：pnpm migrate-uac-to-eadaf"
        exit 1
    fi
    log_message "Database connection and schema existence check successful"
}

# Function to get all table names in the schema
get_table_names() {
    psql_cmd -t -c "SELECT table_name FROM information_schema.tables WHERE table_schema = '$SCHEMA' AND table_type = 'BASE TABLE' ORDER BY table_name;" | awk '{print $1}' | grep -v '^$'
}

# Function to perform VACUUM ANALYZE on all tables
perform_vacuum() {
    log_message "Starting VACUUM operation..."
    local tables=( $(get_table_names) )
    for tbl in "${tables[@]}"; do
        log_message "VACUUM ANALYZE $SCHEMA.$tbl ..."
        if psql_cmd -c "VACUUM ANALYZE $SCHEMA.\"$tbl\";" 2>> "$LOG_FILE"; then
            log_message "VACUUM ANALYZE $SCHEMA.$tbl completed."
        else
            log_message "WARN: VACUUM ANALYZE $SCHEMA.$tbl failed (possible permission issue)."
        fi
    done
    log_message "VACUUM operation finished."
}

# Function to perform ANALYZE on all tables
perform_analyze() {
    log_message "Starting ANALYZE operation..."
    local tables=( $(get_table_names) )
    for tbl in "${tables[@]}"; do
        log_message "ANALYZE $SCHEMA.$tbl ..."
        if psql_cmd -c "ANALYZE $SCHEMA.\"$tbl\";" 2>> "$LOG_FILE"; then
            log_message "ANALYZE $SCHEMA.$tbl completed."
        else
            log_message "WARN: ANALYZE $SCHEMA.$tbl failed (possible permission issue)."
        fi
    done
    log_message "ANALYZE operation finished."
}

# Function to perform REINDEX
perform_reindex() {
    log_message "Starting REINDEX operation..."
    if ! psql_cmd -c "SELECT has_schema_privilege(current_user, '$SCHEMA', 'CREATE')" | grep -q t; then
        log_message "Error: Current user does not have CREATE privilege on schema $SCHEMA"
        return 1
    fi
    if psql_cmd -c "REINDEX SCHEMA $SCHEMA;" 2>> "$LOG_FILE"; then
        log_message "REINDEX completed successfully"
    else
        log_message "Error: REINDEX operation failed. Check $LOG_FILE for details"
        return 1
    fi
}

# Function to show maintenance status
show_maintenance_status() {
    log_message "Checking maintenance status..."
    psql_cmd -c "
        SELECT 
            schemaname,
            relname as table_name,
            n_dead_tup as dead_tuples,
            n_live_tup as live_tuples,
            CASE 
                WHEN n_live_tup > 0 THEN (n_dead_tup * 100.0 / n_live_tup)
                ELSE 0
            END as dead_tuple_ratio,
            last_vacuum,
            last_analyze
        FROM pg_stat_user_tables
        WHERE schemaname = '$SCHEMA'
        ORDER BY dead_tuple_ratio DESC NULLS LAST;
    " | tee -a "$LOG_FILE"
}

# Function to display usage
show_usage() {
    echo "Usage: $0 [VACUUM|ANALYZE|REINDEX|ALL]"
    echo "  VACUUM   - Clean up dead tuples and update statistics"
    echo "  ANALYZE  - Update table statistics"
    echo "  REINDEX  - Rebuild indexes"
    echo "  ALL      - Perform all maintenance operations"
    exit 1
}

# Main execution
main() {
    log_message "Starting database maintenance script"
    check_db_connection

    # Check if operation is specified
    if [ $# -eq 0 ]; then
        show_usage
    fi

    # Process the operation
    case "$1" in
        "VACUUM")
            perform_vacuum
            ;;
        "ANALYZE")
            perform_analyze
            ;;
        "REINDEX")
            perform_reindex
            ;;
        "ALL")
            perform_vacuum
            perform_analyze
            perform_reindex
            ;;
        *)
            show_usage
            ;;
    esac

    # Show maintenance status after operations
    show_maintenance_status

    log_message "Database maintenance completed"
}

# Execute main function
main "$@" 