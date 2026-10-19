import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  KeyOutlined,
  MessageOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import { DragSortTable } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import { useChatReference } from '@eadaf/ai-base';
import { Button, Dropdown, Empty, Popconfirm, Space, Tag } from 'antd';
import React, { useEffect, useState } from 'react';
import ChatReferenceTarget from '@/components/ChatReferenceTarget';
import { useProTableDensity } from '@/theme/proTableDensity';
import { buildFieldReference } from '../../ai/chatReferenceUtils';
type FieldRow = API.BusinessDataField & { sort: number };

interface FieldListProps {
  entity: API.BusinessDataEntity;
  fields: API.BusinessDataField[];
  disabled?: boolean;
  onEdit: (field: API.BusinessDataField) => void;
  onDelete: (field: API.BusinessDataField) => void;
  onSortChange: (fields: API.BusinessDataField[]) => void;
}

const FieldList: React.FC<FieldListProps> = ({
  entity,
  fields,
  disabled,
  onEdit,
  onDelete,
  onSortChange,
}) => {
  const { addReference } = useChatReference();
  const { density } = useProTableDensity();
  const [dataSource, setDataSource] = useState<FieldRow[]>([]);

  useEffect(() => {
    setDataSource(fields.map((field, index) => ({ ...field, sort: index })));
  }, [fields]);

  const handleDragSortEnd = (
    _beforeIndex: number,
    _afterIndex: number,
    newDataSource: FieldRow[],
  ) => {
    if (disabled) return;
    const reordered = newDataSource.map((field, index) => ({ ...field, sort: index }));
    setDataSource(reordered);

    const fieldsWithoutSort = reordered.map(({ sort: _sort, ...field }) => field);
    onSortChange(fieldsWithoutSort);
  };

  const columns: ProColumns<FieldRow>[] = [
    { title: '', dataIndex: 'sort', width: 40, className: 'drag-visible' },
    {
      title: '字段',
      width: 140,
      render: (_, record) => (
        <Space size={4}>
          <code style={{ color: '#1890ff' }}>{record.fieldKey}</code>
          <ChatReferenceTarget
            onClick={() => addReference(buildFieldReference(entity, record))}
          />
          {record.typeormConfig?.primary && (
            <KeyOutlined style={{ color: '#faad14' }} title="主键" />
          )}
          {record.typeormConfig?.unique && (
            <CheckCircleOutlined style={{ color: '#52c41a' }} title="唯一" />
          )}
        </Space>
      ),
    },
    {
      title: '标签',
      render: (_, record) => record.columnInfo?.label || '-',
      width: 120,
    },
    {
      title: '信息',
      render: (_, record) => {
        const extendType = record.columnInfo?.extendType as string | undefined;
        const type = record.typeormConfig?.type || 'varchar';
        const length = record.typeormConfig?.length;
        const typeDisplay = length ? `${type}(${length})` : type;
        return (
          <Space size={4} wrap>
            {extendType ? (
              <Tag color="purple">{extendType.toUpperCase()}</Tag>
            ) : (
              <Tag color="blue">{String(typeDisplay).toUpperCase()}</Tag>
            )}
            {record.typeormConfig?.nullable === false && <Tag color="red">NOT NULL</Tag>}
            {record.typeormConfig?.unique && <Tag color="green">UNIQUE</Tag>}
            {record.typeormConfig?.default !== undefined && record.typeormConfig?.default !== null && (
              <>
                <Tag color="orange">DEFAULT</Tag>
                <code>{String(record.typeormConfig.default)}</code>
              </>
            )}
          </Space>
        );
      },
    },
    {
      title: '操作',
      width: 48,
      fixed: 'right',
      render: (_, record) => (
        <Dropdown
          disabled={disabled}
          menu={{
            items: [
              { key: 'edit', icon: <EditOutlined />, label: '编辑', disabled, onClick: () => onEdit(record) },
              {
                key: 'chat',
                icon: <MessageOutlined />,
                label: '添加引用',
                onClick: () => addReference(buildFieldReference(entity, record)),
              },
              {
                key: 'delete',
                icon: <DeleteOutlined />,
                label: (
                  <Popconfirm title="确定删除该字段？" onConfirm={() => onDelete(record)}>
                    <span>删除</span>
                  </Popconfirm>
                ),
                danger: true,
              },
            ],
          }}
          trigger={['click']}
        >
          <Button type="text" size="small" icon={<MoreOutlined />} onClick={(e) => e.stopPropagation()} />
        </Dropdown>
      ),
    },
  ];

  if (!dataSource.length) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="暂无字段，点击右上角「添加字段」"
        style={{ margin: '32px 0' }}
      />
    );
  }

  return (
    <DragSortTable<FieldRow>
      rowKey="fieldKey"
      columns={columns}
      dataSource={dataSource}
      search={false}
      options={false}
      optionsRender={() => []}
      pagination={false}
      size={density}
      dragSortKey="sort"
      toolBarRender={false}
      onDragSortEnd={handleDragSortEnd}
    />
  );
};

export default FieldList;
