import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { Button, Empty, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table } from 'antd';
import { message } from '@/utils/antdAppApis';
import type { ColumnsType } from 'antd/es/table';
import React, { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { patchBusinessDataEntity } from '@/services/EADAF/api/businessData';
import { getApiErrorMessage, isApiSuccess } from '@/utils/apiResponse';

export interface IndexManagerRef {
  openCreate: () => void;
  autoCreate: () => void;
}

interface IndexManagerProps {
  entity: API.BusinessDataEntity;
  fieldKeys: string[];
  disabled?: boolean;
  onSaved: () => void;
  onAutoCreate: () => void;
}

const INDEX_TYPES = [
  { label: '默认 (btree)', value: 'btree' },
  { label: 'hash', value: 'hash' },
  { label: 'gin', value: 'gin' },
  { label: 'gist', value: 'gist' },
];

function readIndexes(entity: API.BusinessDataEntity): API.BusinessDataIndex[] {
  const raw = entity.layout?.indexes;
  return Array.isArray(raw) ? raw : [];
}

const IndexManager = forwardRef<IndexManagerRef, IndexManagerProps>(
  ({ entity, fieldKeys, disabled, onSaved, onAutoCreate }, ref) => {
    const [modalOpen, setModalOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState<API.BusinessDataIndex | null>(null);
    const [form] = Form.useForm();
    const indexes = useMemo(() => readIndexes(entity), [entity]);

    const persistIndexes = async (nextIndexes: API.BusinessDataIndex[]) => {
      if (!entity.id) return;
      setSaving(true);
      try {
        const res = await patchBusinessDataEntity(entity.id, {
          layout: { ...(entity.layout || {}), indexes: nextIndexes },
        });
        if (isApiSuccess(res)) {
          message.success('索引已保存');
          onSaved();
        } else {
          message.error(getApiErrorMessage(res, '保存索引失败'));
        }
      } finally {
        setSaving(false);
      }
    };

    const openCreate = () => {
      if (disabled) return;
      setEditing(null);
      form.resetFields();
      form.setFieldsValue({ unique: false, type: 'btree', fields: [] });
      setModalOpen(true);
    };

    useImperativeHandle(ref, () => ({
      openCreate,
      autoCreate: () => {
        if (disabled) return;
        onAutoCreate();
      },
    }));

    const handleOk = async () => {
      const values = await form.validateFields();
      const payload: API.BusinessDataIndex = {
        id: editing?.id || uuidv4(),
        name: values.name,
        fields: values.fields,
        unique: values.unique,
        type: values.type,
      };
      const exists = indexes.some((item) => item.name === payload.name && item.id !== payload.id);
      if (exists) {
        message.error('索引名称已存在');
        return;
      }
      const next = editing
        ? indexes.map((item) => (item.id === editing.id ? payload : item))
        : [...indexes, payload];
      setModalOpen(false);
      await persistIndexes(next);
    };

    const handleDelete = async (id: string) => {
      await persistIndexes(indexes.filter((item) => item.id !== id));
    };

    const columns: ColumnsType<API.BusinessDataIndex> = [
      { title: '索引名', dataIndex: 'name', width: 160 },
      {
        title: '字段',
        dataIndex: 'fields',
        render: (fields: string[]) => (fields || []).join(', '),
      },
      {
        title: '唯一',
        dataIndex: 'unique',
        width: 72,
        render: (v) => (v ? '是' : '否'),
      },
      { title: '类型', dataIndex: 'type', width: 80, render: (v) => v || 'btree' },
      {
        title: '操作',
        width: 100,
        render: (_, record) => (
          <Space>
            <Button
              type="link"
              size="small"
              disabled={disabled}
              icon={<EditOutlined />}
              onClick={() => {
                setEditing(record);
                form.setFieldsValue(record);
                setModalOpen(true);
              }}
            />
            <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id!)}>
              <Button type="link" size="small" danger disabled={disabled} icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
      },
    ];

    return (
      <div>
        {indexes.length ? (
          <Table size="small" rowKey="id" columns={columns} dataSource={indexes} pagination={false} />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无索引，可手动添加或使用「自动创建」"
            style={{ margin: '32px 0' }}
          />
        )}

        <Modal
          title={editing ? '编辑索引' : '添加索引'}
          open={modalOpen}
          confirmLoading={saving}
          onOk={handleOk}
          onCancel={() => setModalOpen(false)}
          destroyOnClose
        >
          <Form form={form} layout="vertical">
            <Form.Item name="name" label="索引名" rules={[{ required: true }]}>
              <Input placeholder="idx_customer_email" />
            </Form.Item>
            <Form.Item name="fields" label="字段" rules={[{ required: true, message: '请选择字段' }]}>
              <Select mode="multiple" options={fieldKeys.map((k) => ({ label: k, value: k }))} />
            </Form.Item>
            <Form.Item name="unique" label="唯一索引" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="type" label="类型">
              <Select options={INDEX_TYPES} />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    );
  },
);

IndexManager.displayName = 'IndexManager';

export default IndexManager;
