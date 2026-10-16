import { Drawer, Form, Input, InputNumber, Select, Space, Button } from 'antd';
import React, { useEffect, useState } from 'react';
import { message } from '@/utils/antdAppApis';
import {
  getBizdataMetrics,
  patchBizdataMetricCard,
  postBizdataMetricCard,
} from '@/services/EADAF/api/businessData';
import { getApiData, getApiErrorMessage, isApiSuccess } from '@/utils/apiResponse';

const VIZ_OPTIONS = [
  { value: 'statistic_trend', label: '单指标趋势（涨跌）' },
  { value: 'line', label: '折线图（时序）' },
  { value: 'bar', label: '柱状图（按维度）' },
  { value: 'ring', label: '环形图（维度占比）' },
];

type Props = {
  open: boolean;
  editing?: API.BizdataMetricCard | null;
  onClose: () => void;
  onSaved: () => void;
};

const MetricCardFormDrawer: React.FC<Props> = ({ open, editing, onClose, onSaved }) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [metricOptions, setMetricOptions] = useState<Array<{ value: string; label: string }>>([]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const res = await getBizdataMetrics({ size: 200, status: 'enabled' });
      const data = getApiData<API.BizdataMetricList>(res);
      setMetricOptions(
        (data?.items || []).map((m) => ({
          value: m.id!,
          label: `${m.label || m.code} (${m.code})`,
        })),
      );
    })();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (editing && (editing.id || editing.code || editing.title || editing.metricId)) {
      form.setFieldsValue({
        code: editing.code,
        title: editing.title,
        description: editing.description,
        domainCode: editing.domainCode,
        metricId: editing.metricId || editing.metric?.id,
        vizType: editing.vizType || 'statistic_trend',
        timeRange: editing.config?.timeRange || '30d',
        aggregate: editing.config?.aggregate || 'latest',
        chartPlacement: editing.config?.chartPlacement || 'bottom',
        sortOrder: editing.sortOrder ?? 0,
        status: editing.status || 'enabled',
      });
    } else {
      form.resetFields();
      form.setFieldsValue({
        vizType: 'statistic_trend',
        timeRange: '30d',
        aggregate: 'latest',
        chartPlacement: 'bottom',
        sortOrder: 0,
        status: 'enabled',
      });
    }
  }, [open, editing, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const body = {
        code: values.code,
        title: values.title,
        description: values.description,
        domainCode: values.domainCode,
        metricId: values.metricId,
        vizType: values.vizType,
        sortOrder: values.sortOrder,
        status: values.status,
        config: {
          timeRange: values.timeRange,
          aggregate: values.aggregate,
          chartPlacement: values.chartPlacement,
        },
      };
      const res = editing?.id
        ? await patchBizdataMetricCard(editing.id, body)
        : await postBizdataMetricCard(body);
      if (!isApiSuccess(res)) {
        message.error(getApiErrorMessage(res, '保存失败'));
        return;
      }
      message.success(editing?.id ? '卡片已更新' : '卡片已创建');
      onSaved();
      onClose();
    } catch (err) {
      message.error(getApiErrorMessage(err, '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      title={editing?.id ? '编辑指标卡片' : '新建指标卡片'}
      open={open}
      onClose={onClose}
      width={480}
      destroyOnClose
      extra={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={saving} onClick={() => void handleSubmit()}>
            保存
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical">
        <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
          <Input placeholder="如：已发布文章数" />
        </Form.Item>
        <Form.Item name="code" label="卡片 Code" rules={[{ required: true, message: '请输入 code' }]}>
          <Input placeholder="如 content:article:published_count:trend" />
        </Form.Item>
        <Form.Item
          name="domainCode"
          label="所属域"
          rules={[{ required: true, message: '请输入域编码' }]}
          extra="看板按域分层展示，如 content / sales"
        >
          <Input placeholder="content" />
        </Form.Item>
        <Form.Item
          name="metricId"
          label="绑定指标"
          rules={[{ required: true, message: '请选择指标' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            options={metricOptions}
            placeholder="选择已有指标定义"
          />
        </Form.Item>
        <Form.Item name="vizType" label="可视化类型" rules={[{ required: true }]}>
          <Select options={VIZ_OPTIONS} />
        </Form.Item>
        <Form.Item name="timeRange" label="时间窗">
          <Select
            options={[
              { value: '7d', label: '近 7 天' },
              { value: '30d', label: '近 30 天' },
              { value: '90d', label: '近 90 天' },
            ]}
          />
        </Form.Item>
        <Form.Item
          noStyle
          shouldUpdate={(prev, next) => prev.vizType !== next.vizType}
        >
          {() => {
            const viz = form.getFieldValue('vizType');
            if (viz !== 'bar' && viz !== 'ring') return null;
            return (
              <Form.Item name="aggregate" label="维度聚合">
                <Select
                  options={[
                    { value: 'latest', label: '最近一次执行' },
                    { value: 'sum', label: '时间窗内求和' },
                  ]}
                />
              </Form.Item>
            );
          }}
        </Form.Item>
        <Form.Item name="chartPlacement" label="图表位置">
          <Select
            options={[
              { value: 'bottom', label: '下方' },
              { value: 'right', label: '右侧' },
            ]}
          />
        </Form.Item>
        <Form.Item name="sortOrder" label="排序">
          <InputNumber style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="status" label="状态">
          <Select
            options={[
              { value: 'enabled', label: '启用' },
              { value: 'disabled', label: '停用' },
            ]}
          />
        </Form.Item>
        <Form.Item name="description" label="说明">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Drawer>
  );
};

export default MetricCardFormDrawer;
