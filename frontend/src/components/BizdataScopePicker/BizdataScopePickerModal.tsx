import { PartitionOutlined } from '@ant-design/icons';
import { Input, Modal, Spin, Tree, Typography } from 'antd';
import type { DataNode } from 'antd/es/tree';
import React, { useEffect, useMemo, useState } from 'react';
import { getBusinessDataScopes } from '@/services/EADAF/api/businessData';
import { getApiData, isApiSuccess } from '@/utils/apiResponse';
import type { BizdataScopeOption, BizdataScopePickerModalProps } from './types';

const { Text } = Typography;

function toTreeData(nodes: BizdataScopeOption[]): DataNode[] {
  return nodes.map((node) => ({
    key: node.code,
    title: (
      <span>
        <PartitionOutlined style={{ marginRight: 6 }} />
        <Text strong>{node.name}</Text>
        <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
          {node.code}
        </Text>
      </span>
    ),
    children: node.children?.length ? toTreeData(node.children) : undefined,
  }));
}

const BizdataScopePickerModal: React.FC<BizdataScopePickerModalProps> = ({
  open,
  title = '选择 Scope',
  value = [],
  maxSelection,
  onOk,
  onCancel,
}) => {
  const [loading, setLoading] = useState(false);
  const [tree, setTree] = useState<BizdataScopeOption[]>([]);
  const [checkedKeys, setCheckedKeys] = useState<string[]>(value);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (open) {
      setCheckedKeys(value);
      setSearch('');
    }
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await getBusinessDataScopes();
        if (!cancelled && isApiSuccess(res)) {
          const data = getApiData<{ tree?: BizdataScopeOption[] }>(res);
          setTree(data?.tree || []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const treeData = useMemo(() => toTreeData(tree), [tree]);

  const filteredTreeData = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return treeData;

    const filterNodes = (nodes: DataNode[]): DataNode[] =>
      nodes
        .map((node) => {
          const key = String(node.key);
          const titleText = key.toLowerCase();
          const children = node.children ? filterNodes(node.children) : undefined;
          const selfMatch = titleText.includes(keyword) || key.includes(keyword);
          if (selfMatch || (children && children.length > 0)) {
            return { ...node, children };
          }
          return null;
        })
        .filter(Boolean) as DataNode[];

    return filterNodes(treeData);
  }, [search, treeData]);

  return (
    <Modal
      title={title}
      open={open}
      width={560}
      destroyOnHidden
      onOk={() => onOk(checkedKeys)}
      onCancel={onCancel}
    >
      <Input.Search
        placeholder="搜索 Scope 名称或编码"
        allowClear
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 12 }}
      />
      <Spin spinning={loading}>
        {filteredTreeData.length ? (
          <Tree
            checkable
            selectable={false}
            defaultExpandAll
            checkedKeys={checkedKeys}
            onCheck={(keys) => {
              const next = Array.isArray(keys) ? keys : keys.checked;
              const normalized = next.map(String);
              if (maxSelection === 1 && normalized.length > 1) {
                setCheckedKeys([normalized[normalized.length - 1]]);
                return;
              }
              if (maxSelection && normalized.length > maxSelection) {
                setCheckedKeys(normalized.slice(-maxSelection));
                return;
              }
              setCheckedKeys(normalized);
            }}
            treeData={filteredTreeData}
            height={360}
            style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 8 }}
          />
        ) : (
          <Text type="secondary">暂无 Scope，请先在数据模型中创建实体</Text>
        )}
      </Spin>
    </Modal>
  );
};

export default BizdataScopePickerModal;
