import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import {
  Button,
  Input,
  Modal,
  Popconfirm,
  Popover,
  Segmented,
  Space,
  Table,
  Tag,
  Tooltip,
  message,
} from 'antd';
import React, { useMemo, useState } from 'react';
import { deleteBusinessDataEnum } from '@/services/EADAF/api/businessData';
import { useInitialState } from '@/providers/InitialStateProvider';
import MetadataEditor from '../MetadataEditor';
import EnumFormModal from './EnumFormModal';
import EnumOptionsPreview from './EnumOptionsPreview';
import {
  buildEnumTree,
  collectEnumTreeKeys,
  countEnumOptions,
  filterEnums,
  type EnumTreeNode,
} from '../../utils/enumUtils';

interface EnumManagerProps {
  enums: API.BusinessDataEnum[];
  open: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

function OptionsPreview({ record }: { record: API.BusinessDataEnum }) {
  return <EnumOptionsPreview record={record} />;
}

const EnumManager: React.FC<EnumManagerProps> = ({ enums, open, onClose, onRefresh }) => {
  const { initialState } = useInitialState();
  const metadataEnabled = Boolean(initialState?.systemFeatures?.metadataEnabled);
  const [searchText, setSearchText] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'tree'>('list');
  const [formOpen, setFormOpen] = useState(false);
  const [editingEnum, setEditingEnum] = useState<API.BusinessDataEnum | null>(null);
  const [metadataEnum, setMetadataEnum] = useState<API.BusinessDataEnum | null>(null);

  const filtered = useMemo(() => filterEnums(enums, searchText), [enums, searchText]);
  const treeData = useMemo(() => buildEnumTree(filtered), [filtered]);
  const expandedKeys = useMemo(() => collectEnumTreeKeys(treeData), [treeData]);

  const handleDelete = async (id: string) => {
    await deleteBusinessDataEnum(id);
    message.success('已删除');
    onRefresh();
  };

  const openCreate = () => {
    setEditingEnum(null);
    setFormOpen(true);
  };

  const openEdit = (record: API.BusinessDataEnum) => {
    setEditingEnum(record);
    setFormOpen(true);
  };

  const listColumns = [
    {
      title: '代码',
      dataIndex: 'code',
      width: 220,
      render: (code: string) => <Tag color="blue">{code}</Tag>,
    },
    {
      title: '显示名称',
      render: (_: unknown, r: API.BusinessDataEnum) => r.enumInfo?.label || '-',
      ellipsis: true,
    },
    {
      title: '描述',
      render: (_: unknown, r: API.BusinessDataEnum) => r.enumInfo?.description || '-',
      ellipsis: true,
    },
    {
      title: '选项数',
      width: 88,
      render: (_: unknown, r: API.BusinessDataEnum) => {
        const count = countEnumOptions(r);
        return (
          <Popover content={<OptionsPreview record={r} />} title="枚举选项" trigger={['hover', 'click']}>
            <Tag color="green" style={{ cursor: 'pointer' }}>
              {count}
            </Tag>
          </Popover>
        );
      },
    },
    {
      title: '更新时间',
      width: 168,
      render: (_: unknown, r: API.BusinessDataEnum) =>
        r.updatedAt ? new Date(r.updatedAt).toLocaleString() : '-',
    },
    {
      title: '操作',
      width: 140,
      fixed: 'right' as const,
      render: (_: unknown, r: API.BusinessDataEnum) => (
        <Space size={0}>
          <Tooltip title="编辑">
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          </Tooltip>
          {metadataEnabled ? (
            <Button type="link" size="small" onClick={() => setMetadataEnum(r)}>
              元数据
            </Button>
          ) : null}
          <Popconfirm title="确定删除该枚举？" onConfirm={() => handleDelete(r.id!)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const treeColumns = [
    {
      title: '代码 / 域',
      render: (_: unknown, node: EnumTreeNode) => {
        if (!node.enumRecord) return <strong>{node.label}</strong>;
        return <Tag color="blue">{node.enumRecord.code}</Tag>;
      },
    },
    {
      title: '显示名称',
      render: (_: unknown, node: EnumTreeNode) =>
        node.enumRecord ? node.enumRecord.enumInfo?.label || '-' : '',
    },
    {
      title: '选项数',
      width: 88,
      render: (_: unknown, node: EnumTreeNode) => {
        if (!node.enumRecord) return null;
        const count = countEnumOptions(node.enumRecord);
        return (
          <Popover content={<OptionsPreview record={node.enumRecord} />} title="枚举选项" trigger={['hover', 'click']}>
            <Tag color="green" style={{ cursor: 'pointer' }}>
              {count}
            </Tag>
          </Popover>
        );
      },
    },
    {
      title: '操作',
      width: 140,
      render: (_: unknown, node: EnumTreeNode) => {
        if (!node.enumRecord) return null;
        const r = node.enumRecord;
        return (
          <Space size={0}>
            <Tooltip title="编辑">
              <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
            </Tooltip>
            {metadataEnabled ? (
              <Button type="link" size="small" onClick={() => setMetadataEnum(r)}>
                元数据
              </Button>
            ) : null}
            <Popconfirm title="确定删除该枚举？" onConfirm={() => handleDelete(r.id!)}>
              <Button type="link" size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <>
      <Modal
        title="枚举管理"
        open={open}
        onCancel={onClose}
        centered
        footer={null}
        width="min(1200px, calc(100vw - 40px))"
        styles={{ body: { maxHeight: 'calc(100vh - 120px)', overflow: 'auto' } }}
        destroyOnHidden
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <Space>
            <Segmented
              options={[
                { label: '列表', value: 'list' },
                { label: '树形', value: 'tree' },
              ]}
              value={viewMode}
              onChange={(v) => setViewMode(v as 'list' | 'tree')}
            />
            <Input
              prefix={<SearchOutlined />}
              placeholder="搜索 code / 名称 / 描述"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 280 }}
              allowClear
            />
          </Space>
          <Button type="primary" className="btn-gradient-primary" icon={<PlusOutlined />} onClick={openCreate}>
            添加枚举
          </Button>
        </div>

        {viewMode === 'list' ? (
          <Table
            size="small"
            rowKey="id"
            dataSource={filtered}
            columns={listColumns}
            pagination={false}
            scroll={{ x: 900, y: 'calc(100vh - 260px)' }}
          />
        ) : (
          <Table
            size="small"
            rowKey="key"
            dataSource={treeData}
            columns={treeColumns}
            pagination={false}
            scroll={{ x: 800, y: 'calc(100vh - 260px)' }}
            expandable={{
              defaultExpandedRowKeys: expandedKeys,
              childrenColumnName: 'children',
              rowExpandable: (record) => Boolean((record as EnumTreeNode).children?.length),
            }}
          />
        )}
      </Modal>

      <EnumFormModal
        open={formOpen}
        editing={editingEnum}
        onClose={() => {
          setFormOpen(false);
          setEditingEnum(null);
        }}
        onSuccess={onRefresh}
      />

      <Modal
        title={`枚举元数据 - ${metadataEnum?.code || ''}`}
        open={Boolean(metadataEnum)}
        onCancel={() => setMetadataEnum(null)}
        footer={null}
        width={520}
        destroyOnClose
      >
        {metadataEnum?.id && (
          <MetadataEditor
            targetType="enum"
            targetId={metadataEnum.id}
            targetCode={metadataEnum.code}
            collapsed={false}
          />
        )}
      </Modal>
    </>
  );
};

export default EnumManager;
