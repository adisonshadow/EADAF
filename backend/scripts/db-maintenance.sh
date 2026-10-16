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
LOG_DIR="logs"
LOG_FILE="$LOG_DIR/db-maintenance-$(date +%Y%m%d_%H%M%S).log"

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
    # Check connection
    if ! psql -d $DB_NAME -c "SELECT 1" > /dev/null 2>&1; then
        log_message "Error: Cannot connect to database $DB_NAME"
        exit 1
    fi
    # Check schema existence
    if ! psql -d $DB_NAME -t -c "SELECT 1 FROM information_schema.schemata WHERE schema_name = '$SCHEMA'" | grep -q 1; then
        log_message "Error: Schema $SCHEMA does not exist"
        exit 1
    fi
    log_message "Database connection and schema existence check successful"
}

# Function to get all table names in the schema
get_table_names() {
    psql -d $DB_NAME -t -c "SELECT table_name FROM information_schema.tables WHERE table_schema = '$SCHEMA' AND table_type = 'BASE TABLE' ORDER BY table_name;" | awk '{print $1}' | grep -v '^$'
}

# Function to perform VACUUM ANALYZE on all tables
perform_vacuum() {
    log_message "Starting VACUUM operation..."
    local tables=( $(get_table_names) )
    for tbl in "${tables[@]}"; do
        log_message "VACUUM ANALYZE $SCHEMA.$tbl ..."
        if psql -d $DB_NAME -c "VACUUM ANALYZE $SCHEMA.\"$tbl\";" 2>> "$LOG_FILE"; then
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
        if psql -d $DB_NAME -c "ANALYZE $SCHEMA.\"$tbl\";" 2>> "$LOG_FILE"; then
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
    if ! psql -d $DB_NAME -c "SELECT has_schema_privilege(current_user, '$SCHEMA', 'CREATE')" | grep -q t; then
        log_message "Error: Current user does not have CREATE privilege on schema $SCHEMA"
        return 1
    fi
    if psql -d $DB_NAME -c "REINDEX SCHEMA $SCHEMA;" 2>> "$LOG_FILE"; then
        log_message "REINDEX completed successfully"
    else
        log_message "Error: REINDEX operation failed. Check $LOG_FILE for details"
        return 1
    fi
}

# Function to show maintenance status
show_maintenance_status() {
    log_message "Checking maintenance status..."
    psql -d $DB_NAME -c "
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