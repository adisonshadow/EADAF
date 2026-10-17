import {
  BuildOutlined,
  CaretDownOutlined,
  CaretRightFilled,
  CheckCircleOutlined,
  CopyOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
  LockOutlined,
  MessageOutlined,
  MoreOutlined,
  PartitionOutlined,
  UnlockOutlined,
  RetweetOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { Button, Dropdown, Empty, Table, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useChatReference } from '@eadaf/ai-base';
import React, { useCallback, useMemo, useState } from 'react';
import ChatReferenceTarget from '@/components/ChatReferenceTarget';
import { message } from '@/utils/antdAppApis';
import { copyTextToClipboard } from '@/utils/clipboard';
import { buildEntityReference, buildScopeReference } from '../../ai/chatReferenceUtils';
import { buildScopeTree, type ScopeTreeItem } from '../../utils/buildScopeTree';
import { isEntityModelValidated } from '../../utils/entityValidation';
import './ScopeEntityTree.css';

const { Text } = Typography;

const COLLAPSED_SCOPES_STORAGE_KEY = 'eadaf.bizdata.modelDesigner.collapsedScopes';

type FlatTreeRow = Omit<ScopeTreeItem, 'children'> & { depth: number };

interface ScopeEntityTreeProps {
  entities: API.BusinessDataEntity[];
  selectedEntityId?: string;
  showHeader?: boolean;
  /** 已成功物化过的实体 ID 集合 */
  materializedEntityIds?: ReadonlySet<string>;
  /** 有业务说明内容的 Scope code */
  scopeCodesWithDocs?: ReadonlySet<string>;
  onSelectEntity: (entity: API.BusinessDataEntity) => void;
  onOpenScopeDoc?: (scopeCode: string) => void;
  onToggleLock?: (entity: API.BusinessDataEntity) => void;
  onEditEntity?: (entity: API.BusinessDataEntity) => void;
  onDeleteEntity?: (entity: API.BusinessDataEntity) => void;
  onAiValidate?: (entity: API.BusinessDataEntity) => void;
  /** Scope 节点：批量 AI 校验该 Scope 下所有下级实体 */
  onAiBatchValidate?: (scopeCode: string) => void;
}

function readCollapsedScopes(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_SCOPES_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map(String).filter(Boolean));
  } catch {
    return new Set();
  }
}

function writeCollapsedScopes(scopes: Set<string>) {
  try {
    localStorage.setItem(COLLAPSED_SCOPES_STORAGE_KEY, JSON.stringify([...scopes]));
  } catch {
    // ignore quota / private mode
  }
}

/** 默认展开；折叠的 scope 不展开其子节点 */
function flattenVisible(
  nodes: ScopeTreeItem[],
  collapsedScopes: ReadonlySet<string>,
  depth = 0,
): FlatTreeRow[] {
  return nodes.flatMap((node) => {
    const { children, ...rest } = node;
    const row: FlatTreeRow = { ...rest, depth };
    const isCollapsed = Boolean(node.isScopeNode && collapsedScopes.has(node.code));
    if (isCollapsed || !children?.length) {
      return [row];
    }
    return [row, ...flattenVisible(children, collapsedScopes, depth + 1)];
  });
}

/** Scope 下所有下级实体（code 以 scopeCode: 开头） */
function collectEntitiesUnderScope(
  entities: API.BusinessDataEntity[],
  scopeCode: string,
): API.BusinessDataEntity[] {
  const prefix = `${scopeCode}:`;
  return entities
    .filter((e) => Boolean(e.code?.startsWith(prefix)))
    .sort((a, b) => String(a.code).localeCompare(String(b.code)));
}

function formatEntityListText(entities: API.BusinessDataEntity[]): string {
  return entities
    .map((e) => {
      const code = e.code || '';
      const label = e.label || code.split(':').pop() || '';
      return `${code} ${label}`.trim();
    })
    .join('\n');
}

const ScopeEntityTree: React.FC<ScopeEntityTreeProps> = ({
  entities,
  selectedEntityId,
  showHeader = true,
  materializedEntityIds,
  scopeCodesWithDocs,
  onSelectEntity,
  onOpenScopeDoc,
  onToggleLock,
  onEditEntity,
  onDeleteEntity,
  onAiValidate,
  onAiBatchValidate,
}) => {
  const { addReference } = useChatReference();
  const [collapsedScopes, setCollapsedScopes] = useState<Set<string>>(() => readCollapsedScopes());

  const tableData = useMemo(
    () => flattenVisible(buildScopeTree(entities), collapsedScopes),
    [entities, collapsedScopes],
  );

  const toggleScopeCollapse = useCallback((scopeCode: string) => {
    setCollapsedScopes((prev) => {
      const next = new Set(prev);
      if (next.has(scopeCode)) next.delete(scopeCode);
      else next.add(scopeCode);
      writeCollapsedScopes(next);
      return next;
    });
  }, []);

  const copyChildEntities = useCallback(
    async (scopeCode: string) => {
      const list = collectEntitiesUnderScope(entities, scopeCode);
      if (!list.length) {
        message.warning(`Scope「${scopeCode}」下暂无实体`);
        return;
      }
      const text = formatEntityListText(list);
      const ok = await copyTextToClipboard(text);
      if (ok) message.success(`已复制 ${list.length} 个下级实体`);
      else message.error('复制失败，请检查浏览器剪贴板权限');
    },
    [entities],
  );

  const columns: ColumnsType<FlatTreeRow> = [
    {
      title: 'Scope / Entity',
      dataIndex: 'name',
      render: (_, record) => {
        const indent = record.depth * 16;
        const collapsed = record.isScopeNode && collapsedScopes.has(record.code);
        return (
          <div style={{ paddingLeft: indent, display: 'flex', alignItems: 'center', gap: 8 }}>
            {record.isScopeNode ? (
              <Button
                type="text"
                size="small"
                icon={collapsed ? <CaretRightFilled /> : <CaretDownOutlined />}
                style={{ color: '#DDD', width: 20, minWidth: 20, height: 20, padding: 0 }}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleScopeCollapse(record.code);
                }}
              />
            ) : null}
            {record.isScopeNode ? (
              <PartitionOutlined />
            ) : record.entityKind === 'json_schema' ? (
              <BuildOutlined />
            ) : (
              <DatabaseOutlined />
            )}
            <Text strong={!record.isScopeNode}>{record.name}</Text>
            {record.isScopeNode && (
              <ChatReferenceTarget
                onClick={() =>
                  addReference(
                    buildScopeReference({
                      code: record.code,
                      name: record.name,
                      hasDescription: scopeCodesWithDocs?.has(record.code),
                    }),
                  )
                }
              />
            )}
            {record.isScopeNode && scopeCodesWithDocs?.has(record.code) && (
              <Tooltip title="查看业务说明">
                <InfoCircleOutlined
                  style={{ color: '#1677ff', cursor: 'pointer', fontSize: 14 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenScopeDoc?.(record.code);
                  }}
                />
              </Tooltip>
            )}
            {!record.isScopeNode && record.entity && (
              <ChatReferenceTarget
                onClick={() => addReference(buildEntityReference(record.entity!))}
              />
            )}
            {!record.isScopeNode && record.isLocked && (
              <Tooltip title="已锁定">
                <LockOutlined style={{ color: '#faad14' }} />
              </Tooltip>
            )}
            {!record.isScopeNode && record.entity && isEntityModelValidated(record.entity) && (
              <Tooltip title="模型校验已通过">
                <CheckCircleOutlined style={{ color: 'rgb(3 176 0)' }} />
              </Tooltip>
            )}
            {!record.isScopeNode && record.id && materializedEntityIds?.has(record.id) && (
              <Tooltip title="已物化">
                <RetweetOutlined style={{ color: 'rgb(3 176 0)' }} />
              </Tooltip>
            )}
            {!record.isScopeNode && record.version != null && (
              <span className="entity-version-badge">v{record.version}</span>
            )}
          </div>
        );
      },
    },
    {
      title: '',
      width: 40,
      fixed: 'right',
      render: (_, record) => {
        if (record.isScopeNode) {
          return (
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'batch-validate',
                    icon: <SafetyCertificateOutlined />,
                    label: '批量AI检验',
                    onClick: () => onAiBatchValidate?.(record.code),
                  },
                  {
                    key: 'copy-children',
                    icon: <CopyOutlined />,
                    label: '复制所有下级实体',
                    onClick: () => void copyChildEntities(record.code),
                  },
                  {
                    key: 'scope-doc',
                    icon: <FileTextOutlined />,
                    label: '业务说明',
                    onClick: () => onOpenScopeDoc?.(record.code),
                  },
                ],
              }}
              trigger={['click']}
            >
              <Button
                type="text"
                size="small"
                icon={<MoreOutlined />}
                onClick={(e) => e.stopPropagation()}
              />
            </Dropdown>
          );
        }
        if (!record.entity) return null;
        const entity = record.entity;
        return (
          <Dropdown
            menu={{
              items: [
                {
                  key: 'validate',
                  icon: <SafetyCertificateOutlined />,
                  label: 'AI校验',
                  disabled: entity.isLocked,
                  onClick: () => onAiValidate?.(entity),
                },
                {
                  key: 'lock',
                  icon: entity.isLocked ? <UnlockOutlined /> : <LockOutlined />,
                  label: entity.isLocked ? '解锁' : '锁定',
                  onClick: () => onToggleLock?.(entity),
                },
                {
                  key: 'chat',
                  icon: <MessageOutlined />,
                  label: '添加引用',
                  onClick: () => addReference(buildEntityReference(entity)),
                },
                {
                  key: 'edit',
                  icon: <EditOutlined />,
                  label: '编辑',
                  disabled: entity.isLocked,
                  onClick: () => onEditEntity?.(entity),
                },
                {
                  key: 'delete',
                  icon: <DeleteOutlined />,
                  label: '删除',
                  danger: true,
                  disabled: entity.isLocked,
                  onClick: () => onDeleteEntity?.(entity),
                },
              ],
            }}
            trigger={['click']}
          >
            <Button
              type="text"
              size="small"
              icon={<MoreOutlined />}
              onClick={(e) => e.stopPropagation()}
            />
          </Dropdown>
        );
      },
    },
  ];

  return (
    <Table
      size="small"
      rowKey="code"
      showHeader={showHeader}
      columns={columns}
      dataSource={tableData}
      pagination={false}
      locale={{
        emptyText: (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无实体，请点击「新建实体」开始设计"
          />
        ),
      }}
      onRow={(record) => ({
        onClick: () => {
          if (!record.isScopeNode && record.entity) {
            onSelectEntity(record.entity);
          }
        },
        style: {
          cursor: record.isScopeNode ? 'default' : 'pointer',
          background:
            !record.isScopeNode && record.id === selectedEntityId
              ? 'rgba(24,144,255,0.08)'
              : undefined,
        },
      })}
    />
  );
};

export default ScopeEntityTree;
