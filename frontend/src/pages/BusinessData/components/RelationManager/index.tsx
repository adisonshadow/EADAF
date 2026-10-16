import { Button, Empty, Form, Input, Modal, Select, Table } from 'antd';
import { message } from '@/utils/antdAppApis';
import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { deleteBusinessDataRelation, postBusinessDataRelation } from '@/services/EADAF/api/businessData';
import { getApiErrorMessage, isApiSuccess } from '@/utils/apiResponse';

export interface RelationManagerRef {
  openCreate: () => void;
}

interface RelationManagerProps {
  entity: API.BusinessDataEntity;
  entities: API.BusinessDataEntity[];
  relations: API.BusinessDataRelation[];
  onRefresh: () => void;
}

const RELATION_TYPES = [
  { label: '一对多', value: 'oneToMany' },
  { label: '多对一', value: 'manyToOne' },
  { label: '一对一', value: 'oneToOne' },
  { label: '多对多', value: 'manyToMany' },
];

const RelationManager = forwardRef<RelationManagerRef, RelationManagerProps>(
  ({ entity, entities, relations, onRefresh }, ref) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);

    const related = relations.filter(
      (r) => r.fromEntityId === entity.id || r.toEntityId === entity.id,
    );

    const entityOptions = entities
      .filter((e) => e.id !== entity.id && e.entityKind === 'er_table')
      .map((e) => ({ label: `${e.label} (${e.code})`, value: e.id }));

    const openModal = () => {
      form.resetFields();
      setModalOpen(true);
    };

    useImperativeHandle(ref, () => ({
      openCreate: () => {
        if (!entity.isLocked) openModal();
      },
    }));

    const closeModal = () => {
      setModalOpen(false);
      form.resetFields();
    };

    const handleAdd = async () => {
      try {
        const values = await form.validateFields();
        setLoading(true);
        const res = await postBusinessDataRelation({
          type: values.type,
          name: values.name,
          fromEntityId: entity.id,
          toEntityId: values.toEntityId,
        });
        if (!isApiSuccess(res)) {
          message.error(getApiErrorMessage(res, '添加关系失败'));
          return;
        }
        message.success('关系已添加');
        closeModal();
        onRefresh();
      } finally {
        setLoading(false);
      }
    };

    return (
      <div>
        {related.length ? (
          <Table
          size="small"
          rowKey="id"
          dataSource={related}
          pagination={false}
          columns={[
            { title: '名称', dataIndex: 'name' },
            { title: '类型', dataIndex: 'type', width: 100 },
            {
              title: '关联实体',
              render: (_, r) =>
                r.fromEntityId === entity.id
                  ? r.toEntity?.code || r.toEntityId
                  : r.fromEntity?.code || r.fromEntityId,
            },
            {
              title: '操作',
              render: (_, r) => (
                <Button
                  type="link"
                  danger
                  size="small"
                  disabled={entity.isLocked}
                  onClick={() => deleteBusinessDataRelation(r.id!).then(onRefresh)}
                >
                  删除
                </Button>
              ),
            },
          ]}
        />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无关系，可手动添加或使用「自动生成」"
            style={{ margin: '32px 0' }}
          />
        )}

        <Modal
          title="添加关系"
          open={modalOpen}
          confirmLoading={loading}
          onOk={handleAdd}
          onCancel={closeModal}
          destroyOnClose
          okText="确定"
          cancelText="取消"
        >
          <Form form={form} layout="vertical">
            <Form.Item name="name" label="关系名" rules={[{ required: true, message: '请输入关系名' }]}>
              <Input placeholder="例如 orders" />
            </Form.Item>
            <Form.Item name="type" label="类型" rules={[{ required: true, message: '请选择类型' }]}>
              <Select placeholder="选择关系类型" options={RELATION_TYPES} />
            </Form.Item>
            <Form.Item
              name="toEntityId"
              label="目标实体"
              rules={[{ required: true, message: '请选择目标实体' }]}
            >
              <Select placeholder="选择目标实体" options={entityOptions} />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    );
  },
);

RelationManager.displayName = 'RelationManager';

export default RelationManager;
