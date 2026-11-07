-- 三员审批队列，以及操作日志上的「当时三员身份」。可重复执行。
ALTER TABLE eadaf.operation_logs
  ADD COLUMN IF NOT EXISTS operator_three_member_role VARCHAR(32);

CREATE TABLE IF NOT EXISTS eadaf.three_member_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type VARCHAR(64) NOT NULL,
  summary VARCHAR(500) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  requester_id UUID NOT NULL,
  requester_name VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  comment TEXT,
  reviewer_id UUID,
  reviewer_name VARCHAR(100),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON COLUMN eadaf.operation_logs.operator_three_member_role IS '写入时操作者的三员身份，空表示普通用户';
