import { BuildOutlined, DatabaseOutlined, PartitionOutlined } from '@ant-design/icons';
import { useChatReference } from '@eadaf/ai-base';
import { Button, Empty, Spin, Typography } from 'antd';
import React, { useEffect, useMemo, useState } from 'react';
import { buildEntityReference, buildScopeReference } from '@/pages/BusinessData/ai/chatReferenceUtils';
import { buildScopeTree, type ScopeTreeItem } from '@/pages/BusinessData/utils/buildScopeTree';
import { getBusinessDataSchema } from '@/services/EADAF/api/businessData';
import { getApiData, isApiSuccess } from '@/utils/apiResponse';

const { Text } = Typography;

type FlatTreeRow = Omit<ScopeTreeItem, 'children'> & { depth: number };

function flattenAll(nodes: ScopeTreeItem[], depth = 0): FlatTreeRow[] {
  return nodes.flatMap((node) => {
    const { children, ...rest } = node;
    const row: FlatTreeRow = { ...rest, depth };
    if (children?.length) {
      return [row, ...flattenAll(children, depth + 1)];
    }
    return [row];
  });
}

const DataModelReferenceTree: React.FC = () => {
  const { addReference } = useChatReference();
  const [entities, setEntities] = useState<API.BusinessDataEntity[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await getBusinessDataSchema();
        if (isApiSuccess(res)) {
          const schema = getApiData<API.BusinessDataSchema>(res);
          setEntities(schema?.entities || []);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const rows = useMemo(() => flattenAll(buildScopeTree(entities)), [entities]);

  const handleAddEntityReference = (entity: API.BusinessDataEntity) => {
    addReference({ ...buildEntityReference(entity), unique: false });
  };

  const handleAddScopeReference = (row: FlatTreeRow) => {
    addReference(buildScopeReference({ code: row.code, name: row.name }));
  };

  return (
    <Spin spinning={loading}>
      <div
        style={{
          height: 150,
          overflow: 'auto',
          border: '1px solid #f0f0f0',
          borderRadius: 6,
          background: '#fafafa',
        }}
      >
        {rows.length === 0 && !loading ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无数据模型"
            style={{ margin: '8px 0' }}
          />
        ) : (
          rows.map((row) => (
            <div
              key={row.code}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 8px',
                borderBottom: '1px solid #f0f0f0',
              }}
            >
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  paddingLeft: row.depth * 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {row.isScopeNode ? (
                  <PartitionOutlined style={{ color: '#8c8c8c' }} />
                ) : row.entityKind === 'json_schema' ? (
                  <BuildOutlined style={{ color: '#722ed1' }} />
                ) : (
                  <DatabaseOutlined style={{ color: '#1677ff' }} />
                )}
                <Text ellipsis strong={!row.isScopeNode}>
                  {row.name}
                </Text>
                {row.code && (
                  <Text type="secondary" ellipsis style={{ fontSize: 12 }}>
                    {row.code}
                  </Text>
                )}
              </div>
              {row.isScopeNode ? (
                <Button
                  type="link"
                  size="small"
                  style={{ flexShrink: 0, paddingInline: 4 }}
                  onClick={() => handleAddScopeReference(row)}
                >
                  添加引用
                </Button>
              ) : (
                row.entity && (
                  <Button
                    type="link"
                    size="small"
                    style={{ flexShrink: 0, paddingInline: 4 }}
                    onClick={() => handleAddEntityReference(row.entity!)}
                  >
                    添加引用
                  </Button>
                )
              )}
            </div>
          ))
        )}
      </div>
    </Spin>
  );
};

export default DataModelReferenceTree;
