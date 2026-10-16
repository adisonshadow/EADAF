-- 对需要重建的索引执行REINDEX操作
REINDEX INDEX eadaf.idx_users_email;
REINDEX INDEX eadaf.department_closure_pkey;
REINDEX INDEX eadaf.data_permission_rules_pkey;
REINDEX INDEX eadaf.data_permission_rules_deleted_at_idx;
REINDEX INDEX eadaf.data_permission_rules_status_idx;
REINDEX INDEX eadaf.operation_logs_pkey;
REINDEX INDEX eadaf.operation_logs_status_idx;
REINDEX INDEX eadaf.permissions_status_idx;
REINDEX INDEX eadaf.users_username_key;
REINDEX INDEX eadaf.login_attempts_pkey;
REINDEX INDEX eadaf.departments_code_key;
REINDEX INDEX eadaf.departments_status_idx;
REINDEX INDEX eadaf.roles_status_idx;
REINDEX INDEX eadaf.permissions_code_key;
REINDEX INDEX eadaf.permissions_deleted_at_idx;
REINDEX INDEX eadaf.department_history_pkey; 