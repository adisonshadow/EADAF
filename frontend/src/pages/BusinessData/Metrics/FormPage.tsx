import { BetaSchemaForm, PageContainer } from '@ant-design/pro-components';
import { Button, Form, Space, Spin } from 'antd';
import { message } from '@/utils/antdAppApis';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAIChatPrompts, useAISurface } from '@eadaf/ai-base';
import { buildMetricFormPrompts } from '@/ai/pageChatPrompts';
import PageContainerTitleWithBack from '@/components/PageContainerTitleWithBack';
import {
  getBizdataMetric,
  getBizdataMetrics,
  getDatabaseConnections,
  patchBizdataMetric,
  postBizdataMetric,
} from '@/services/EADAF/api/businessData';
import { getApiData, isApiSuccess } from '@/utils/apiResponse';
import MetricCronPicker, { metricScheduleToCronExpression } from './MetricCronPicker';
import MetadataEditor from '../components/MetadataEditor';
import { buildMetricFormColumns } from './schema';

export type MetricPageMode = 'create' | 'edit';

interface MetricFormPageProps {
  mode: MetricPageMode;
}

const MetricFormPage: React.FC<MetricFormPageProps> = ({ mode }) => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [form] = Form.useForm<API.BizdataMetric>();
  const [loading, setLoading] = useState(mode !== 'create');
  const [saving, setSaving] = useState(false);
  const [connections, setConnections] = useState<API.DatabaseConnection[]>([]);
  const [metricCodes, setMetricCodes] = useState<API.BizdataMetric[]>([]);
  const metricType = Form.useWatch('metricType', form);
  const formulaOp = Form.useWatch(['formulaConfig', 'op'], form);
  const metricLabel = Form.useWatch('label', form);
  const metricCode = Form.useWatch('code', form);

  const chatPrompts = useMemo(
    () =>
      buildMetricFormPrompts(mode, {
        label: metricLabel,
        code: metricCode,
        metricType: metricType,
      }),
    [mode, metricLabel, metricCode, metricType],
  );
  useAIChatPrompts(chatPrompts);

  useAISurface({
    id: mode === 'create' ? 'bizdata.metrics.create' : 'bizdata.metrics.edit',
    domain: 'bizdata',
    label: mode === 'create' ? '新建指标' : '编辑指标',
    read: () => {
      const values = form.getFieldsValue();
      return {
        metricId: id,
        mode,
        ...values,
      };
    },
    applyMutation: (mutation) => {
      if (mutation.domain !== 'bizdata' || mutation.type !== 'metric.updated') return;
      const payload = mutation.payload as Partial<API.BizdataMetric> | undefined;
      if (!payload) return;
      if (mutation.resourceId && mutation.resourceId !== id) return;
      form.setFieldsValue({
        queryScript: payload.queryScript ?? form.getFieldValue('queryScript'),
        formulaConfig: payload.formulaConfig ?? form.getFieldValue('formulaConfig'),
        description: payload.description ?? form.getFieldValue('description'),
        unit: payload.unit ?? form.getFieldValue('unit'),
      });
    },
    matchMutation: (mutation) =>
      mutation.domain === 'bizdata' && mutation.type === 'metric.updated',
  });

  const listPath = '/business_data/metrics';

  const connectionOptions = useMemo(
    () =>
      connections
        .filter((c) => c.dbType === 'postgresql')
        .map((c) => ({ label: `${c.name} (${c.dbType})`, value: c.id || '' })),
    [connections],
  );

  const metricCodeOptions = useMemo(
    () => metricCodes.map((m) => ({ label: `${m.label} (${m.code})`, value: m.code || '' })),
    [metricCodes],
  );

  const loadMeta = useCallback(async () => {
    const [connRes, metricsRes] = await Promise.all([
      getDatabaseConnections(),
      getBizdataMetrics({ size: 200 }),
    ]);
    if (isApiSuccess(connRes)) {
      setConnections(getApiData<API.DatabaseConnection[]>(connRes) || []);
    }
    if (isApiSuccess(metricsRes)) {
      const data = getApiData<API.BizdataMetricList>(metricsRes);
      setMetricCodes(data?.items || []);
    }
  }, []);

  const loadDetail = useCallback(async () => {
    if (mode === 'create' || !id) return;

    setLoading(true);
    try {
      const response = await getBizdataMetric(id);
      if (!isApiSuccess(response)) {
        message.error('获取指标详情失败');
        navigate(listPath, { replace: true });
        return;
      }
      const data = getApiData<API.BizdataMetric>(response);
      if (!data) {
        message.error('获取指标详情失败');
        navigate(listPath, { replace: true });
        return;
      }

      const cronExpression = metricScheduleToCronExpression(data);
      form.setFieldsValue({
        ...data,
        scheduleType: cronExpression ? 'cron' : 'manual',
        scheduleConfig: cronExpression ? { expression: cronExpression } : {},
      });
    } catch {
      message.error('获取指标详情失败');
      navigate(listPath, { replace: true });
    } finally {
      setLoading(false);
    }
  }, [form, id, listPath, mode, navigate]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (mode === 'create') {
      form.resetFields();
      form.setFieldsValue({
        metricType: 'sql',
        computeMode: 'scheduled',
        scheduleType: 'manual',
        scheduleConfig: {},
        status: 'enabled',
      });
      setLoading(false);
      return;
    }

    if (!id) {
      navigate(listPath, { replace: true });
      return;
    }

    void loadDetail();
  }, [form, id, listPath, loadDetail, mode, navigate]);

  const columns = buildMetricFormColumns(connectionOptions, metricCodeOptions, metricType, formulaOp);

  const scheduleType = Form.useWatch('scheduleType', form);
  const scheduleConfig = Form.useWatch('scheduleConfig', form);
  const cronValue = metricScheduleToCronExpression({ scheduleType, scheduleConfig });

  const handleCronChange = (expression: string) => {
    if (!expression) {
      form.setFieldsValue({ scheduleType: 'manual', scheduleConfig: {} });
      return;
    }
    form.setFieldsValue({
      scheduleType: 'cron',
      scheduleConfig: { expression },
    });
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const cronExpression = values.scheduleConfig?.expression?.trim();
      const scheduleType = cronExpression ? 'cron' : 'manual';
      const scheduleConfig = cronExpression ? { expression: cronExpression } : {};

      const payload: Partial<API.BizdataMetric> = {
        ...values,
        scheduleType,
        scheduleConfig,
        formulaConfig: values.formulaConfig || {},
      };

      if (mode === 'create') {
        const response = await postBizdataMetric(payload);
        if (isApiSuccess(response)) {
          message.success('创建成功');
          navigate(listPath);
        } else {
          message.error(response.message || '创建失败');
        }
      } else if (id) {
        const response = await patchBizdataMetric(id, payload);
        if (isApiSuccess(response)) {
          message.success('保存成功');
          navigate(listPath);
        } else {
          message.error(response.message || '保存失败');
        }
      }
    } catch {
      // validation
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer
      title={
        <PageContainerTitleWithBack
          title={mode === 'create' ? '新建指标' : '编辑指标'}
        />
      }
    >
      <Spin spinning={loading}>
        <BetaSchemaForm<API.BizdataMetric>
          form={form}
          layoutType="Form"
          columns={columns}
          submitter={false}
          grid
          rowProps={{ gutter: 16 }}
          colProps={{ span: 12 }}
        />

        <div style={{ marginTop: 8, marginBottom: 16, maxWidth: 1000 }}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>定时调度</div>
          <div style={{ color: '#888', fontSize: 12, marginBottom: 8 }}>
            配置 Cron 执行周期；点击「清除」则改为仅手动执行
          </div>
          <MetricCronPicker value={cronValue} onChange={handleCronChange} />
        </div>

        {mode === 'edit' && id && (
          <div style={{ marginBottom: 16, maxWidth: 1000 }}>
            <MetadataEditor
              targetType="metric"
              targetId={id}
              targetCode={form.getFieldValue('code')}
            />
          </div>
        )}

        <Space style={{ marginTop: 24 }}>
          <Button type="primary" loading={saving} onClick={handleSubmit}>
            保存
          </Button>
        </Space>
      </Spin>
    </PageContainer>
  );
};

export default MetricFormPage;
