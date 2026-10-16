import { ReloadOutlined } from '@ant-design/icons';
import { Graph } from '@antv/g6';
import { Button, Empty, Select, Space, Spin } from 'antd';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FixHeaderPage from '@/components/FixHeaderPage';
import PageContainerTitleWithBack from '@/components/PageContainerTitleWithBack';
import { getBusinessDataSchema } from '@/services/EADAF/api/businessData';
import { getApiData, getApiErrorMessage, isApiSuccess } from '@/utils/apiResponse';
import { message } from '@/utils/antdAppApis';
import { useUiTheme } from '@/theme/uiTheme';
import {
  firstLevelScope,
  relationCardinalityLabel,
} from '../ai/relationGraphQuery';
import './RelationsGraph.css';

function entityShortName(entity: API.BusinessDataEntity): string {
  if (entity.label) return entity.label;
  const parts = String(entity.code || '').split(':');
  return parts[parts.length - 1] || entity.code || entity.id || '';
}

const SCOPE_PALETTE = [
  '#1677ff',
  '#13c2c2',
  '#52c41a',
  '#fa8c16',
  '#eb2f96',
  '#722ed1',
  '#2f54eb',
  '#a0d911',
];

function scopeColor(scope: string, scopes: string[]): string {
  const idx = Math.max(0, scopes.indexOf(scope));
  return SCOPE_PALETTE[idx % SCOPE_PALETTE.length];
}

type GraphDatum = {
  nodes: Array<{
    id: string;
    data: { label: string; code: string; scope: string; fill: string };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    data: { label: string; name?: string };
  }>;
};

function buildGraphData(
  entities: API.BusinessDataEntity[],
  relations: API.BusinessDataRelation[],
  scopeFilter: string | undefined,
  allScopes: string[],
): GraphDatum {
  const erEntities = entities.filter((e) => e.entityKind !== 'json_schema' && e.id);
  const filtered = scopeFilter
    ? erEntities.filter((e) => firstLevelScope(e.code) === scopeFilter)
    : erEntities;
  const idSet = new Set(filtered.map((e) => e.id!));

  const nodes = filtered.map((e) => {
    const scope = firstLevelScope(e.code);
    return {
      id: e.id!,
      data: {
        label: entityShortName(e),
        code: e.code || '',
        scope,
        fill: scopeColor(scope, allScopes),
      },
    };
  });

  const edges = relations
    .filter((r) => r.fromEntityId && r.toEntityId
      && idSet.has(r.fromEntityId)
      && idSet.has(r.toEntityId)
      && r.fromEntityId !== r.toEntityId)
    .map((r) => ({
      id: r.id || `${r.fromEntityId}-${r.toEntityId}-${r.type}`,
      source: r.fromEntityId!,
      target: r.toEntityId!,
      data: {
        label: relationCardinalityLabel(r.type),
        name: r.name,
      },
    }));

  return { nodes, edges };
}

const RelationsGraphPage: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph | null>(null);
  const { resolved: uiTheme } = useUiTheme();
  const isDark = uiTheme === 'dark';
  const [loading, setLoading] = useState(true);
  const [entities, setEntities] = useState<API.BusinessDataEntity[]>([]);
  const [relations, setRelations] = useState<API.BusinessDataRelation[]>([]);
  const [scopeFilter, setScopeFilter] = useState<string | undefined>();

  const loadSchema = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getBusinessDataSchema();
      if (!isApiSuccess(res)) {
        message.error(getApiErrorMessage(res, '加载模型失败'));
        return;
      }
      const data = getApiData<API.BusinessDataSchema>(res);
      setEntities(data?.entities || []);
      setRelations(data?.relations || []);
    } catch (error) {
      message.error(getApiErrorMessage(error, '加载模型失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSchema();
  }, [loadSchema]);

  const scopeOptions = useMemo(() => {
    const set = new Set<string>();
    entities.forEach((e) => {
      const s = firstLevelScope(e.code);
      if (s) set.add(s);
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [entities]);

  const graphData = useMemo(
    () => buildGraphData(entities, relations, scopeFilter, scopeOptions),
    [entities, relations, scopeFilter, scopeOptions],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el || loading) return;

    graphRef.current?.destroy();
    graphRef.current = null;

    if (!graphData.nodes.length) return;

    const width = el.clientWidth || 800;
    const height = el.clientHeight || 600;

    const graph = new Graph({
      container: el,
      width,
      height,
      data: graphData,
      autoFit: 'view',
      padding: 48,
      layout: {
        type: 'd3-force',
        link: {
          distance: 140,
          strength: 0.6,
        },
        manyBody: {
          strength: -280,
        },
        collide: {
          radius: 48,
          strength: 0.85,
        },
        center: {
          strength: 0.05,
        },
      },
      node: {
        style: {
          size: 42,
          fill: (d: { data?: { fill?: string } }) => d.data?.fill || '#1677ff',
          stroke: isDark ? 'rgba(255,255,255,0.35)' : '#fff',
          lineWidth: 2,
          labelText: (d: { data?: { label?: string } }) => d.data?.label || '',
          labelPlacement: 'bottom',
          labelFill: isDark ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.88)',
          labelFontSize: 12,
          labelOffsetY: 4,
        },
      },
      edge: {
        style: {
          stroke: isDark ? 'rgba(255,255,255,0.35)' : '#bfbfbf',
          lineWidth: 1.5,
          endArrow: true,
          labelText: (d: { data?: { label?: string } }) => d.data?.label || '',
          labelFill: isDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.65)',
          labelFontSize: 11,
          labelBackground: true,
          labelBackgroundFill: isDark ? 'rgba(30,30,30,0.92)' : '#fff',
          labelBackgroundOpacity: 0.95,
          labelPadding: [2, 4],
        },
      },
      behaviors: [ 'drag-canvas', 'zoom-canvas',
        {
          type: 'drag-element-force',
          fixed: true,
        },
      ],
    });

    graphRef.current = graph;
    void graph.render();

    const onResize = () => {
      if (!containerRef.current || !graphRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      graphRef.current.setSize(w, h);
      void graphRef.current.fitView();
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      graph.destroy();
      graphRef.current = null;
    };
  }, [graphData, loading, isDark]);

  return (
    <FixHeaderPage
      title={(
        <PageContainerTitleWithBack
          title="关系图谱"
          backTo="/business_data/model-design"
        />
      )}
      // subTitle="实体关系力导向图 · 边标签为基数（1:1 / 1:N / N:1 / N:N）"
      extra={(
        <Space>
          <Button
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => void loadSchema()}
            title="刷新"
          />
          <Select
            allowClear
            placeholder="全部 Scope"
            style={{ minWidth: 160 }}
            value={scopeFilter}
            onChange={(v) => setScopeFilter(v)}
            options={scopeOptions.map((s) => ({ label: s, value: s }))}
          />
          {/* {scopeFilter ? <Tag color="blue">{scopeFilter}</Tag> : <Tag>全部</Tag>} */}
        </Space>
      )}
    >
      <div className="relations-graph-page">
        {loading ? (
          <div className="relations-graph-page__loading">
            <Spin description="加载关系数据…" />
          </div>
        ) : !graphData.nodes.length ? (
          <div className="relations-graph-page__empty">
            <Empty description={scopeFilter ? `Scope「${scopeFilter}」下暂无实体` : '暂无实体，请先在数据模型中建模'} />
          </div>
        ) : (
          <div ref={containerRef} className="relations-graph-page__canvas" />
        )}
      </div>
    </FixHeaderPage>
  );
};

export default RelationsGraphPage;
