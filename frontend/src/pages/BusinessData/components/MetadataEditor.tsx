import { Collapse, Form, Input, Select, Spin } from 'antd';
import { message } from '@/utils/antdAppApis';
import React, { useCallback, useEffect, useState } from 'react';
import {
  getBizdataMetadataByTarget,
  postBizdataMetadataField,
  postBizdataMetadataTable,
} from '@/services/EADAF/api/businessData';
import { useInitialState } from '@/providers/InitialStateProvider';
import { getApiData, isApiSuccess } from '@/utils/apiResponse';
import { useDataStandardOptions } from './useDataStandardOptions';

interface MetadataEditorProps {
  targetType: 'entity' | 'metric' | 'enum';
  targetId?: string;
  targetCode?: string;
  fieldKey?: string;
  /** 字段级元数据（实体字段编辑弹窗） */
  mode?: 'table' | 'field';
  collapsed?: boolean;
}

const MetadataEditor: React.FC<MetadataEditorProps> = ({
  targetType,
  targetId,
  targetCode,
  fieldKey,
  mode = 'table',
  collapsed = true,
}) => {
  const { initialState } = useInitialState();
  const metadataEnabled = initialState?.systemFeatures?.metadataEnabled;
  const { options: standardOptions, loading: standardsLoading } = useDataStandardOptions();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tableId, setTableId] = useState<string | undefined>();
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    if (!metadataEnabled || !targetId) return;
    setLoading(true);
    try {
      const res = await getBizdataMetadataByTarget({
        targetType,
        targetId,
        fieldKey: mode === 'field' ? fieldKey : undefined,
      });
      if (!isApiSuccess(res)) return;
      const data = getApiData<API.BizdataMetadataByTarget>(res);
      if (!data?.table) {
        setTableId(undefined);
        form.resetFields();
        return;
      }
      setTableId(data.table.id);
      if (mode === 'field' && data.field) {
        form.setFieldsValue({
          metadataCode: data.field.metadataCode,
          standardId: data.field.standardId,
          businessMeaning: data.field.businessMeaning,
          sensitivityLevel: data.field.sensitivityLevel,
          alias: data.field.alias,
          dataType: data.field.dataType,
          enumCode: data.field.enumCode,
        });
      } else {
        form.setFieldsValue({
          metadataCode: data.table.metadataCode,
          standardId: data.table.standardId,
          businessMeaning: data.table.businessMeaning,
          status: data.table.status,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [fieldKey, form, metadataEnabled, mode, targetId, targetType]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    if (!targetId || !targetCode) return;
    const values = await form.validateFields();
    setSaving(true);
    try {
      let currentTableId = tableId;
      if (!currentTableId) {
        const createRes = await postBizdataMetadataTable({
          targetType,
          targetId,
          code: targetCode,
          status: 'enabled',
        });
        if (!isApiSuccess(createRes)) {
          message.error(createRes.message || '创建元数据表失败');
          return;
        }
        const created = getApiData<API.BizdataMetadataTable>(createRes);
        currentTableId = created?.id;
        setTableId(currentTableId);
      }

      if (!currentTableId) return;

      if (mode === 'field' && fieldKey) {
        const res = await postBizdataMetadataField(currentTableId, {
          fieldKey,
          ...values,
        });
        if (isApiSuccess(res)) {
          message.success('元数据已保存');
        } else {
          message.error(res.message || '保存失败');
        }
      } else {
        const res = await postBizdataMetadataTable({
          targetType,
          targetId,
          code: targetCode,
          ...values,
        });
        if (isApiSuccess(res)) {
          message.success('元数据已保存');
        } else {
          message.error(res.message || '保存失败');
        }
      }
    } finally {
      setSaving(false);
    }
  };

  if (!metadataEnabled || !targetId) return null;

  const formContent = (
    <Spin spinning={loading || standardsLoading}>
      <Form form={form} layout="vertical" onFinish={() => void handleSave()}>
        <Form.Item name="metadataCode" label="元数据编码">
          <Input placeholder="唯一元数据编码" />
        </Form.Item>
        <Form.Item name="standardId" label="数据标准">
          <Select allowClear options={standardOptions} placeholder="选择数据标准" />
        </Form.Item>
        <Form.Item name="businessMeaning" label="业务释义">
          <Input.TextArea rows={2} />
        </Form.Item>
        {mode === 'field' ? (
          <>
            <Form.Item name="sensitivityLevel" label="敏感等级">
              <Input placeholder="如 L1 / L2 / 机密" />
            </Form.Item>
            <Form.Item name="alias" label="别名">
              <Input />
            </Form.Item>
            <Form.Item name="dataType" label="数据类型">
              <Input placeholder="逻辑数据类型" />
            </Form.Item>
            <Form.Item name="enumCode" label="枚举编码">
              <Input />
            </Form.Item>
          </>
        ) : (
          <Form.Item name="status" label="状态" initialValue="enabled">
            <Select
              options={[
                { label: '启用', value: 'enabled' },
                { label: '停用', value: 'disabled' },
              ]}
            />
          </Form.Item>
        )}
        <Form.Item>
          <a onClick={() => form.submit()}>{saving ? '保存中…' : '保存元数据'}</a>
        </Form.Item>
      </Form>
    </Spin>
  );

  if (mode === 'field') {
    return (
      <Collapse
        style={{ marginTop: 16 }}
        defaultActiveKey={collapsed ? undefined : ['metadata']}
        items={[{ key: 'metadata', label: '元数据', children: formContent }]}
      />
    );
  }

  return (
    <Collapse
      defaultActiveKey={collapsed ? undefined : ['metadata']}
      items={[{ key: 'metadata', label: '元数据', children: formContent }]}
    />
  );
};

export default MetadataEditor;
