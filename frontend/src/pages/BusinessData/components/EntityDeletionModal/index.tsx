import {
  Alert,
  Button,
  Checkbox,
  List,
  Modal,
  Radio,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd';
import React, { useEffect, useMemo, useState } from 'react';
import { sendMockUserMessage } from '@eadaf/ai-base';
import {
  postEntityDeletionAnalysis,
  postEntityDeletionExecute,
} from '@/services/EADAF/api/businessData';
import { getApiData, getApiErrorMessage, isApiSuccess } from '@/utils/apiResponse';

type Decision = 'delete_entity' | 'delete_relation';

type Props = {
  open: boolean;
  rootEntity: API.BusinessDataEntity | null;
  onCancel: () => void;
  onDeleted: (result: API.EntityDeletionExecuteResult) => void;
};

function buildVisibility(
  rootId: string,
  _entities: API.EntityDeletionEntityItem[],
  relations: API.BusinessDataRelation[],
  decisions: Record<string, Decision>,
) {
  const adj = new Map<string, string[]>();
  relations.forEach((r) => {
    const a = r.fromEntityId;
    const b = r.toEntityId;
    if (!a || !b) return;
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a)!.push(b);
    adj.get(b)!.push(a);
  });

  const visible = new Set<string>();
  const queue: string[] = [];
  if (rootId) {
    visible.add(rootId);
    queue.push(rootId);
  }

  while (queue.length) {
    const cur = queue.shift()!;
    const decision = decisions[cur] || 'delete_entity';
    // Boundary: include node but do not expand outward
    if (decision === 'delete_relation' && cur !== rootId) continue;

    for (const n of adj.get(cur) || []) {
      if (!visible.has(n)) {
        visible.add(n);
        queue.push(n);
      }
    }
  }

  const deleteEntityIds = [...visible].filter((id) => {
    if (id === rootId) return true;
    return (decisions[id] || 'delete_entity') === 'delete_entity';
  });

  const cutRelations = relations.filter((r) => {
    const a = r.fromEntityId;
    const b = r.toEntityId;
    if (!a || !b) return false;
    const aDel = deleteEntityIds.includes(a);
    const bDel = deleteEntityIds.includes(b);
    // Edge between deleted and kept (relation-only boundary)
    return aDel !== bDel;
  });

  return { visible, deleteEntityIds, cutRelations };
}

function buildAiDeletePrompt(params: {
  root: API.BusinessDataEntity;
  deleteEntities: API.EntityDeletionEntityItem[];
  dropPhysicalTables: boolean;
  materialization: API.EntityDeletionMaterializationRef[];
  metrics: API.EntityDeletionMetricRef[];
  apiServices: API.EntityDeletionApiServiceRef[];
  pipelines: API.EntityDeletionPipelineRef[];
  metadata: API.EntityDeletionMetadataRef[];
}) {
  const {
    root,
    deleteEntities,
    dropPhysicalTables,
    materialization,
    metrics,
    apiServices,
    pipelines,
    metadata,
  } = params;

  const entityLines = deleteEntities
    .map((e) => `- ${e.label || e.code}（${e.code}，id=${e.id}）`)
    .join('\n');

  const sections = [
    `请按已确认方案级联删除业务数据实体。根实体：${root.label}（${root.code}）。`,
    '',
    '待删除实体清单：',
    entityLines || '- （无）',
    '',
    '请调用 bizdata_delete_entity，传入：',
    `- deleteEntityIds: [${deleteEntities.map((e) => e.id).map((id) => `"${id}"`).join(', ')}]`,
    `- dropPhysicalTables: ${dropPhysicalTables}`,
    '',
    '下游影响摘要（后端会一并处理）：',
    `- 物化：${materialization.length} 处`,
    `- 指标：${metrics.map((m) => m.code).filter(Boolean).join(', ') || '无'}`,
    `- API 服务：${apiServices.map((s) => s.code).filter(Boolean).join(', ') || '无'}`,
    `- 采集接口：${pipelines.map((p) => p.code).filter(Boolean).join(', ') || '无'}`,
    `- 元数据目录：${metadata.map((m) => m.code).filter(Boolean).join(', ') || '无'}`,
    '',
    '禁止用简单 DELETE 替代；必须以 Tool 返回 `_verification.verified=true` 为准。',
  ];
  return sections.join('\n');
}

const EntityDeletionModal: React.FC<Props> = ({ open, rootEntity, onCancel, onDeleted }) => {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [analysis, setAnalysis] = useState<API.EntityDeletionAnalysis | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [dropPhysicalTables, setDropPhysicalTables] = useState(false);

  useEffect(() => {
    if (!open || !rootEntity?.id) {
      setAnalysis(null);
      setDecisions({});
      setDropPhysicalTables(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await postEntityDeletionAnalysis(rootEntity.id!);
        const data = getApiData<API.EntityDeletionAnalysis>(res);
        if (!isApiSuccess(res) || !data) {
          message.error(getApiErrorMessage(res, '加载删除影响分析失败'));
          return;
        }
        if (cancelled) return;
        setAnalysis(data);
        const init: Record<string, Decision> = {};
        (data.entities || []).forEach((e) => {
          if (!e.id) return;
          if (e.id === data.rootEntityId) {
            init[e.id] = 'delete_entity';
          } else if (e.isLocked) {
            init[e.id] = 'delete_relation';
          } else {
            init[e.id] = 'delete_entity';
          }
        });
        setDecisions(init);
      } catch (error) {
        message.error(getApiErrorMessage(error, '加载删除影响分析失败'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, rootEntity?.id]);

  const entities = analysis?.entities || [];
  const relations = analysis?.relations || [];
  const rootId = analysis?.rootEntityId || rootEntity?.id || '';

  const { visible, deleteEntityIds, cutRelations } = useMemo(
    () => buildVisibility(rootId, entities, relations, decisions),
    [rootId, entities, relations, decisions],
  );

  const visibleEntities = useMemo(
    () => entities.filter((e) => e.id && visible.has(e.id)),
    [entities, visible],
  );

  const impact = useMemo(() => {
    const selected = entities.filter((e) => e.id && deleteEntityIds.includes(e.id));
    const materialization = selected.flatMap((e) => e.materialization || []);
    const metricsMap = new Map<string, API.EntityDeletionMetricRef>();
    selected.forEach((e) => {
      (e.metrics || []).forEach((m) => {
        if (m.id && m.matchStrength !== 'weak') metricsMap.set(m.id, m);
      });
    });
    const weakMetricsMap = new Map<string, API.EntityDeletionMetricRef>();
    selected.forEach((e) => {
      (e.metrics || []).forEach((m) => {
        if (m.id && m.matchStrength === 'weak') weakMetricsMap.set(m.id, m);
      });
    });
    const apiServices = selected.flatMap((e) => e.apiServices || []);
    const pipelines = selected.flatMap((e) => e.collectionPipelines || []);
    const entityMeta = selected.flatMap((e) => e.metadataTables || []);
    const metricIds = new Set([...metricsMap.keys()]);
    const metricMeta = (analysis?.metricMetadataTables || []).filter(
      (m) => m.targetId && metricIds.has(m.targetId),
    );
    const metadata = [...entityMeta, ...metricMeta];
    return {
      selected,
      materialization,
      metrics: [...metricsMap.values()],
      weakMetrics: [...weakMetricsMap.values()],
      apiServices,
      pipelines,
      metadata,
    };
  }, [entities, deleteEntityIds, analysis?.metricMetadataTables]);

  const setDecision = (entityId: string, value: Decision) => {
    setDecisions((prev) => ({ ...prev, [entityId]: value }));
  };

  const runDirectDelete = async () => {
    if (!deleteEntityIds.length) return;
    setSubmitting(true);
    try {
      const res = await postEntityDeletionExecute({
        deleteEntityIds,
        dropPhysicalTables,
      });
      const data = getApiData<API.EntityDeletionExecuteResult>(res);
      if (!isApiSuccess(res) || !data) {
        message.error(getApiErrorMessage(res, '删除失败'));
        return;
      }
      const dropFails = (data.summary?.physicalTableDrops || []).filter((d) => d.ok === false);
      if (dropFails.length) {
        message.warning(
          `实体已删除，但 ${dropFails.length} 处物理表 DROP 失败，请检查连接与权限`,
        );
      } else {
        message.success(
          `已删除 ${data.summary?.deletedEntities ?? deleteEntityIds.length} 个实体`,
        );
      }
      onDeleted(data);
    } catch (error) {
      message.error(getApiErrorMessage(error, '删除失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const runAiDelete = () => {
    if (!rootEntity || !deleteEntityIds.length) return;
    const prompt = buildAiDeletePrompt({
      root: rootEntity,
      deleteEntities: impact.selected,
      dropPhysicalTables,
      materialization: impact.materialization,
      metrics: impact.metrics,
      apiServices: impact.apiServices,
      pipelines: impact.pipelines,
      metadata: impact.metadata,
    });
    sendMockUserMessage(prompt);
    onCancel();
  };

  return (
    <Modal
      title={`删除实体：${rootEntity?.label || rootEntity?.code || ''}`}
      open={open}
      onCancel={onCancel}
      width={820}
      destroyOnHidden
      confirmLoading={submitting}
      footer={
        <Space>
          <Button onClick={onCancel}>取消</Button>
          <Button disabled={submitting || loading || !deleteEntityIds.length} onClick={runAiDelete}>
            使用 AI 删除
          </Button>
          <Button
            type="primary"
            danger
            loading={submitting}
            disabled={loading || !deleteEntityIds.length}
            onClick={runDirectDelete}
          >
            直接删除
          </Button>
        </Space>
      }
    >
      <Spin spinning={loading || submitting}>
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
          <Alert
            type="warning"
            showIcon
            message="删除不可撤销。选择「删除关系」将保留该实体，并以它为边界隐藏更外侧实体；切回「删除实体」可重新显示。"
          />

          <div>
            <Typography.Text strong>关联实体清单</Typography.Text>
            <List
              size="small"
              style={{ marginTop: 8, maxHeight: 320, overflow: 'auto' }}
              dataSource={visibleEntities}
              locale={{ emptyText: '无关联实体' }}
              renderItem={(item) => {
                const id = item.id!;
                const isRoot = id === rootId;
                const locked = !!item.isLocked;
                const decision = decisions[id] || 'delete_entity';
                const refs = (item.referencingRelations || [])
                  .map((r) => {
                    const arrow = r.direction === 'incoming' ? '←' : '→';
                    return `${arrow} ${r.otherEntityLabel || r.otherEntityCode || r.otherEntityId}（${r.relationName || r.relationType}）`;
                  })
                  .join('；');
                return (
                  <List.Item
                    actions={[
                      <Radio.Group
                        key="dec"
                        optionType="button"
                        buttonStyle="solid"
                        size="small"
                        value={decision}
                        disabled={isRoot}
                        onChange={(e) => setDecision(id, e.target.value as Decision)}
                        options={[
                          {
                            label: '删除实体',
                            value: 'delete_entity',
                            disabled: locked,
                          },
                          { label: '删除关系', value: 'delete_relation' },
                        ]}
                      />,
                    ]}
                  >
                    <List.Item.Meta
                      title={
                        <Space wrap size={4}>
                          <Typography.Text>{item.label || item.code}</Typography.Text>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {item.code}
                          </Typography.Text>
                          {isRoot && <Tag color="red">根</Tag>}
                          {locked && <Tag color="gold">已锁定</Tag>}
                          {decision === 'delete_relation' && !isRoot && (
                            <Tag>仅断关系</Tag>
                          )}
                        </Space>
                      }
                      description={
                        refs
                          ? `关系：${refs}`
                          : isRoot
                            ? '将删除此实体及其所选下游'
                            : '子图内无其他关系边'
                      }
                    />
                  </List.Item>
                );
              }}
            />
          </div>

          {cutRelations.length > 0 && (
            <Alert
              type="info"
              showIcon
              message={`将切断 ${cutRelations.length} 条边界关系（保留侧实体不删除）`}
            />
          )}

          <div>
            <Typography.Text strong>提交前确认</Typography.Text>
            <Space orientation="vertical" size={8} style={{ width: '100%', marginTop: 8 }}>
              <div>
                <Typography.Text>1. 同时删除关联的物化记录、物化信息</Typography.Text>
                <div style={{ marginLeft: 16, color: 'rgba(0,0,0,0.65)' }}>
                  {impact.materialization.length === 0
                    ? '无'
                    : impact.materialization.map((m, i) => (
                        <div key={`${m.connectionId}-${m.tableName}-${i}`}>
                          {m.connectionName || m.connectionId} · {m.targetSchema}.{m.tableName}
                        </div>
                      ))}
                </div>
              </div>
              <div>
                <Typography.Text>2. 删除关联指标信息</Typography.Text>
                <div style={{ marginLeft: 16, color: 'rgba(0,0,0,0.65)' }}>
                  {impact.metrics.length === 0
                    ? '无（强关联）'
                    : impact.metrics.map((m) => (
                        <div key={m.id}>
                          {m.name || m.code}（{m.code}）
                        </div>
                      ))}
                  {impact.weakMetrics.length > 0 && (
                    <div style={{ marginTop: 4, opacity: 0.75 }}>
                      同 Scope 弱关联（不会自动删除）：
                      {impact.weakMetrics.map((m) => m.code).join('、')}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <Typography.Text>3. 删除 AI 服务、采集接口、上报接口</Typography.Text>
                <div style={{ marginLeft: 16, color: 'rgba(0,0,0,0.65)' }}>
                  {impact.apiServices.length === 0 && impact.pipelines.length === 0 ? (
                    '无'
                  ) : (
                    <>
                      {impact.apiServices.map((s) => (
                        <div key={s.id}>API：{s.name || s.code}（{s.code}）</div>
                      ))}
                      {impact.pipelines.map((p) => (
                        <div key={p.id}>采集：{p.name || p.code}（{p.code}）</div>
                      ))}
                    </>
                  )}
                </div>
              </div>
              <div>
                <Typography.Text>4. 删除关联元数据目录</Typography.Text>
                <div style={{ marginLeft: 16, color: 'rgba(0,0,0,0.65)' }}>
                  {impact.metadata.length === 0
                    ? '无'
                    : impact.metadata.map((m) => (
                        <div key={m.id}>
                          {m.code}（{m.targetType}，字段 {m.fieldCount ?? 0}）
                        </div>
                      ))}
                </div>
              </div>
              <div>
                <Checkbox
                  checked={dropPhysicalTables}
                  onChange={(e) => setDropPhysicalTables(e.target.checked)}
                >
                  5. 真实删除数据表（级联 DROP 物理表/集合，作用于所有物化连接）
                </Checkbox>
                <div style={{ marginLeft: 24, color: 'rgba(0,0,0,0.65)' }}>
                  {!dropPhysicalTables
                    ? '未勾选：仅清理元数据侧物化记录，外部库物理表保留'
                    : impact.materialization.length === 0
                      ? '无已物化物理表'
                      : impact.materialization.map((m, i) => (
                          <div key={`drop-${m.connectionId}-${m.tableName}-${i}`}>
                            DROP {m.dbType} · {m.connectionName || m.connectionId} ·{' '}
                            {m.targetSchema}.{m.tableName}
                          </div>
                        ))}
                </div>
              </div>
            </Space>
          </div>
        </Space>
      </Spin>
    </Modal>
  );
};

export default EntityDeletionModal;
