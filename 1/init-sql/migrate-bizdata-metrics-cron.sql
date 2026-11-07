-- 扩展 schedule_type 支持 cron 表达式调度

ALTER TABLE bizdata.metrics DROP CONSTRAINT IF EXISTS metrics_schedule_type_check;
ALTER TABLE bizdata.metrics ADD CONSTRAINT metrics_schedule_type_check
    CHECK (schedule_type IN ('manual', 'hourly', 'daily', 'cron'));
