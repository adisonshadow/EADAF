-- 钩子管理（Hook Center）结构迁移（幂等，可重复执行）
-- 蓝本：docs/钩子管理方案计划_reviewed.md §3.12
BEGIN;

CREATE SCHEMA IF NOT EXISTS automation;

CREATE TABLE IF NOT EXISTS automation.hooks (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                 VARCHAR(255) NOT NULL,
    description          TEXT,
    status               VARCHAR(32)  NOT NULL DEFAULT 'draft',
    -- draft | enabled | disabled | auto_disabled | deleted（软删）
    event_type           VARCHAR(64)  NOT NULL,
    event_filter         JSONB        NOT NULL DEFAULT '{}'::jsonb,
    condition_expr       TEXT,
    action_type          VARCHAR(32)  NOT NULL,
    -- http_request | internal_api | script
    action_config        JSONB        NOT NULL DEFAULT '{}'::jsonb,
    failure_policy       JSONB        NOT NULL DEFAULT '{}'::jsonb,
    consecutive_failures INT          NOT NULL DEFAULT 0,
    version              INT          NOT NULL DEFAULT 1,
    created_by           VARCHAR(64),
    updated_by           VARCHAR(64),
    created_at           TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMPTZ,
    deleted_at           TIMESTAMPTZ,
    CONSTRAINT hooks_status_chk CHECK (status IN (
      'draft','enabled','disabled','auto_disabled','deleted'
    )),
    CONSTRAINT hooks_action_type_chk CHECK (action_type IN (
      'http_request','internal_api','script'
    ))
);
CREATE INDEX IF NOT EXISTS hooks_status_event_idx
  ON automation.hooks (status, event_type)
  WHERE status <> 'deleted';

CREATE TABLE IF NOT EXISTS automation.hook_runs (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_group_id   UUID         NOT NULL,
    hook_id        UUID         NOT NULL REFERENCES automation.hooks(id),
    -- 无 ON DELETE CASCADE：钩子软删后 Run 保留
    hook_version   INT          NOT NULL,
    event_id       UUID         NOT NULL,
    event_type     VARCHAR(64)  NOT NULL,
    event_depth    INT          NOT NULL DEFAULT 0,
    trigger_source VARCHAR(32)  NOT NULL DEFAULT 'event',
    -- event | test | replay | schedule
    payload        JSONB        NOT NULL,
    action_config_snapshot JSONB,
    status         VARCHAR(32)  NOT NULL,
    -- success | failed | timeout | skipped | suppressed
    attempt        INT          NOT NULL DEFAULT 1,
    duration_ms    INT,
    error          TEXT,
    output         JSONB,
    logs           JSONB,
    started_at     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS hook_runs_hook_time_idx
  ON automation.hook_runs (hook_id, started_at DESC);
CREATE INDEX IF NOT EXISTS hook_runs_status_idx
  ON automation.hook_runs (status, started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS hook_runs_dedup_idx
  ON automation.hook_runs (event_id, hook_id, attempt);

COMMENT ON TABLE  automation.hooks IS '钩子定义：事件触发 + 条件过滤 + 动作';
COMMENT ON TABLE  automation.hook_runs IS '钩子运行历史（含 test/replay，密钥永不落明文）';
COMMENT ON COLUMN automation.hooks.event_filter IS '对象过滤 {entityCodes?, apiServiceIds?, operations?, changedFields?, cron?}';
COMMENT ON COLUMN automation.hooks.condition_expr IS '可选 JS 布尔表达式，沙箱绑定 payload 求值';
COMMENT ON COLUMN automation.hooks.action_config IS '动作差异化配置；密钥字段 auth_secret_enc 加密存储';
COMMENT ON COLUMN automation.hook_runs.payload IS '完整事件信封 {id,type,occurredAt,depth,payload}';
COMMENT ON COLUMN automation.hook_runs.action_config_snapshot IS '脱敏后的动作配置快照';

COMMIT;
