import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  MinusCircleOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { Button, Divider, Form, Input, Modal, Space } from 'antd';
import { message } from '@/utils/antdAppApis';
import React, { useEffect, useState } from 'react';
import {
  patchBusinessDataEnum,
  postBusinessDataEnum,
} from '@/services/EADAF/api/businessData';
import { isApiSuccess } from '@/utils/apiResponse';
import {
  buildEnumPayloadFromOptions,
  optionsFromEnum,
  validateEnumCode,
  type EnumOptionRow,
} from '../../utils/enumUtils';

type EnumFormValues = {
  code: string;
  label: string;
  description?: string;
  options: EnumOptionRow[];
};

interface EnumFormModalProps {
  open: boolean;
  editing?: API.BusinessDataEnum | null;
  onClose: () => void;
  onSuccess: () => void;
}

const EnumFormModal: React.FC<EnumFormModalProps> = ({ open, editing, onClose, onSuccess }) => {
  const [form] = Form.useForm<EnumFormValues>();
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(editing?.id);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      form.setFieldsValue({
        code: editing.code,
        label: String(editing.enumInfo?.label || ''),
        description: editing.enumInfo?.description,
        options: optionsFromEnum(editing),
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ options: [] });
    }
  }, [open, editing, form]);

  const handleSubmit = async (values: EnumFormValues) => {
    if (!validateEnumCode(values.code)) {
      message.error('枚举 code 须以字母开头，仅含字母、数字、下划线和冒号');
      return;
    }
    if (!values.options?.length) {
      message.error('请至少添加一个枚举选项');
      return;
    }

    const ordered = values.options.map((opt, index) => ({
      ...opt,
      order: index + 1,
    }));
    const payload = buildEnumPayloadFromOptions(
      values.code,
      values.label,
      values.description,
      ordered,
      editing || undefined,
    );

    setSaving(true);
    try {
      const res = isEdit
        ? await patchBusinessDataEnum(editing!.id!, {
            enumInfo: payload.enumInfo,
            values: payload.values,
            items: payload.items,
          })
        : await postBusinessDataEnum(payload);
      if (!isApiSuccess(res)) {
        message.error(isEdit ? '更新枚举失败' : '创建枚举失败');
        return;
      }
      message.success(isEdit ? '枚举已更新' : '枚举已创建');
      onClose();
      onSuccess();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={isEdit ? '编辑枚举' : '添加枚举'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={saving}
      width={640}
      destroyOnClose
      maskClosable={false}
    >
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          name="code"
          label="枚举代码"
          rules={[
            { required: true, message: '请输入枚举代码' },
            {
              validator: (_, value) =>
                !value || validateEnumCode(value)
                  ? Promise.resolve()
                  : Promise.reject(new Error('格式如 production:WorkOrderStatus')),
            },
          ]}
        >
          <Input placeholder="如 production:WorkOrderStatus" disabled={isEdit} />
        </Form.Item>
        <Form.Item name="label" label="显示名称" rules={[{ required: true, message: '请输入显示名称' }]}>
          <Input placeholder="如 work_order_status" />
        </Form.Item>
        <Form.Item name="description" label="描述">
          <Input placeholder="可选" />
        </Form.Item>

        <Divider titlePlacement="start" plain>
          枚举选项
        </Divider>

        <Form.List name="options">
          {(fields, { add, remove, move }) => (
            <>
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => add({ value: '', label: '', description: '' })}
                style={{ marginBottom: 12 }}
              >
                添加选项
              </Button>
              {fields.map((field, index) => (
                <div
                  key={field.key}
                  style={{
                    display: 'flex',
                    gap: 8,
                    marginBottom: 8,
                    padding: 8,
                    background: 'rgba(0,0,0,0.02)',
                    borderRadius: 6,
                    alignItems: 'flex-start',
                  }}
                >
                  <Space direction="vertical" size={0} style={{ paddingTop: 4 }}>
                    <Button
                      type="text"
                      size="small"
                      icon={<ArrowUpOutlined />}
                      disabled={index === 0}
                      onClick={() => move(index, index - 1)}
                    />
                    <Button
                      type="text"
                      size="small"
                      icon={<ArrowDownOutlined />}
                      disabled={index === fields.length - 1}
                      onClick={() => move(index, index + 1)}
                    />
                  </Space>
                  <Form.Item
                    {...field}
                    name={[field.name, 'value']}
                    rules={[{ required: true, message: '值' }]}
                    style={{ flex: 1, marginBottom: 0 }}
                  >
                    <Input placeholder="值（如 PENDING）" />
                  </Form.Item>
                  <Form.Item
                    {...field}
                    name={[field.name, 'label']}
                    rules={[{ required: true, message: '标签' }]}
                    style={{ flex: 1, marginBottom: 0 }}
                  >
                    <Input placeholder="显示标签" />
                  </Form.Item>
                  <Form.Item
                    {...field}
                    name={[field.name, 'description']}
                    style={{ flex: 1, marginBottom: 0 }}
                  >
                    <Input placeholder="描述（可选）" />
                  </Form.Item>
                  <MinusCircleOutlined
                    style={{ color: '#ff4d4f', marginTop: 8, cursor: 'pointer' }}
                    onClick={() => remove(field.name)}
                  />
                </div>
              ))}
            </>
          )}
        </Form.List>
      </Form>
    </Modal>
  );
};

export default EnumFormModal;
