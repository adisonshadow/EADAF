import { ClearOutlined, DatabaseOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Input, Modal, Space, Spin, Tag, Tooltip, Tree, Typography } from 'antd';
import type { DataNode } from 'antd/es/tree';
import React, { useEffect, useMemo, useState } from 'react';
import { buildScopeTree, type ScopeTreeItem } from '@/pages/BusinessData/utils/buildScopeTree';
import { getBusinessDataSchema } from '@/services/EADAF/api/businessData';
import { getApiData, isApiSuccess } from '@/utils/apiResponse';

const { Text } = Typography;

export type ApiServiceEntityLookupValue = {
  entityId: string;
  entityCode: string;
  entityLabel?: string;
};

export type ApiServiceEntityLookupProps = {
  value?: ApiServiceEntityLookupValue | null;
  onChange?: (next?: ApiServiceEntityLookupValue) => void;
  disabled?: boolean;
};

function toEntityTreeData(nodes: ScopeTreeItem[]): DataNode[] {
  return nodes.map((node) => {
    const isEntity = Boolean(node.entity?.id) && !node.isScopeNode;
    return {
      key: isEntity ? `entity:${node.entity!.id}` : `scope:${node.code}`,
      selectable: isEntity,
      disableCheckbox: !isEntity,
      title: (
        <span>
          <DatabaseOutlined style={{ marginRight: 6, color: isEntity ? '#1677ff' : '#8c8c8c' }} />
          <Text strong={isEntity}>{node.name}</Text>
          <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
            {node.code}
          </Text>
        </span>
      ),
      children: node.children?.length ? toEntityTreeData(node.children) : undefined,
    };
  });
}

function findEntityNode(nodes: ScopeTreeItem[], entityId: string): ScopeTreeItem | undefined {
  for (const node of nodes) {
    if (node.entity?.id === entityId) return node;
    if (node.children?.length) {
      const found = findEntityNode(node.children, entityId);
      if (found) return found;
    }
  }
  return undefined;
}

/** 实体 code 的父路径作为 Scope，如 IPS:analytics:Foo → IPS:analytics */
export { scopeCodeFromEntityCode } from '../../ai/apiServiceCodeUtils';

const ApiServiceEntityLookup: React.FC<ApiServiceEntityLookupProps> = ({
  value,
  onChange,
  disabled,
}) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tree, setTree] = useState<ScopeTreeItem[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    setSelectedKeys(value?.entityId ? [`entity:${value.entityId}`] : []);
    setSearch('');
  }, [open, value?.entityId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await getBusinessDataSchema();
        if (!cancelled && isApiSuccess(res)) {
          const schema = getApiData<API.BusinessDataSchema>(res);
          setTree(buildScopeTree(schema?.entities || []));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const treeData = useMemo(() => toEntityTreeData(tree), [tree]);

  const filteredTreeData = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return treeData;

    const filterScopeNodes = (nodes: ScopeTreeItem[]): ScopeTreeItem[] =>
      nodes
        .map((node) => {
          const children = node.children?.length ? filterScopeNodes(node.children) : undefined;
          const haystack = `${node.code} ${node.name} ${node.entity?.label || ''}`.toLowerCase();
          const selfMatch = haystack.includes(keyword);
          if (selfMatch || (children && children.length > 0)) {
            return { ...node, children };
          }
          return null;
        })
        .filter(Boolean) as ScopeTreeItem[];

    return toEntityTreeData(filterScopeNodes(tree));
  }, [search, tree, treeData]);

  const displayLabel = value
    ? value.entityLabel || value.entityCode
    : undefined;

  return (
    <>
      <Space wrap>
        {value?.entityId ? (
          <Tag icon={<DatabaseOutlined />} color="processing">
            {displayLabel}
            {value.entityCode && value.entityLabel ? (
              <Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
                {value.entityCode}
              </Text>
            ) : null}
          </Tag>
        ) : (
          <Text type="secondary">未选择</Text>
        )}
        <Tooltip title="选择实体">
          <Button icon={<SearchOutlined />} type="text" disabled={disabled} onClick={() => setOpen(true)} />
        </Tooltip>
        {value?.entityId && !disabled && (
          <Tooltip title="清除">
            <Button icon={<ClearOutlined />} type="text" onClick={() => onChange?.(undefined)}/>
          </Tooltip>
        )}
      </Space>
      <Modal
        open={open}
        title="选择主实体（单选）"
        okText="确定"
        cancelText="取消"
        onCancel={() => setOpen(false)}
        onOk={() => {
          const key = selectedKeys[0];
          if (!key?.startsWith('entity:')) {
            onChange?.(undefined);
            setOpen(false);
            return;
          }
          const entityId = key.slice('entity:'.length);
          const node = findEntityNode(tree, entityId);
          if (!node?.entity?.id) {
            onChange?.(undefined);
            setOpen(false);
            return;
          }
          onChange?.({
            entityId: node.entity.id,
            entityCode: node.entity.code || node.code,
            entityLabel: node.entity.label || node.name,
          });
          setOpen(false);
        }}
        width={560}
        destroyOnHidden
      >
        <Input.Search
          allowClear
          placeholder="搜索实体 code / 名称"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginBottom: 12 }}
        />
        <Spin spinning={loading}>
          <div style={{ maxHeight: 420, overflow: 'auto' }}>
            <Tree
              treeData={filteredTreeData}
              selectedKeys={selectedKeys}
              onSelect={(keys) => {
                const next = keys.map(String).filter((k) => k.startsWith('entity:'));
                setSelectedKeys(next.slice(0, 1));
              }}
              defaultExpandAll
              blockNode
            />
          </div>
        </Spin>
      </Modal>
    </>
  );
};

export default ApiServiceEntityLookup;
