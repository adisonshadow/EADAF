import { MoreOutlined, ReloadOutlined } from '@ant-design/icons';
import { PageContainer, StatisticCard } from '@ant-design/pro-components';
import { Column, Line, Pie, Tiny } from '@ant-design/plots';
import { Button, Card, Col, Dropdown, Empty, Modal, Row, Spin } from 'antd';
import type { MenuProps } from 'antd';
import { message } from '@/utils/antdAppApis';
import { copyTextToClipboard } from '@/utils/clipboard';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAIChatPrompts, useAISurface } from '@eadaf/ai-base';
import { buildMetricDashboardPrompts } from '@/ai/pageChatPrompts';
import PageContainerTitleWithBack from '@/components/PageContainerTitleWithBack';
import {
  deleteBizdataMetricCard,
  getBizdataMetricsDashboard,
  postBizdataMetricExecute,
} from '@/services/EADAF/api/businessData';
import { getApiData, getApiErrorMessage, isApiSuccess } from '@/utils/apiResponse';
import MetricCardFormDrawer from './MetricCardFormDrawer';
import './Dashboard.css';

function formatSeriesTime(x?: string) {
  if (!x) return '';
  const d = new Date(x);
  if (Number.isNaN(d.getTime())) return x;
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function renderChart(card: API.BizdataMetricCard) {
  const series = card.series || [];
  if (card.emptyReason && !series.length && card.vizType !== 'statistic_trend') {
    return <div className="metric-dash-card__empty">{card.emptyReason}</div>;
  }

  if (card.vizType === 'line') {
    if (!series.length) return <div className="metric-dash-card__empty">{card.emptyReason || '暂无数据'}</div>;
    return (
      <Line
        height={140}
        data={series.map((p) => ({ x: formatSeriesTime(p.x), value: p.value ?? 0 }))}
        xField="x"
        yField="value"
        axis={{ x: { labelAutoHide: true }, y: { labelFormatter: (v: number) => String(v) } }}
        style={{ lineWidth: 2 }}
        tooltip={{ title: (d: { x?: string }) => d.x }}
      />
    );
  }

  if (card.vizType === 'bar') {
    if (!series.length) return <div className="metric-dash-card__empty">{card.emptyReason || '暂无数据'}</div>;
    return (
      <Column
        height={140}
        data={series.map((p) => ({ category: p.category || '-', value: p.value ?? 0 }))}
        xField="category"
        yField="value"
        axis={{ x: { labelAutoHide: true } }}
      />
    );
  }

  if (card.vizType === 'ring') {
    if (!series.length) return <div className="metric-dash-card__empty">{card.emptyReason || '暂无数据'}</div>;
    return (
      <Pie
        height={140}
        data={series.map((p) => ({ type: p.category || '-', value: p.value ?? 0 }))}
        angleField="value"
        colorField="type"
        innerRadius={0.6}
        legend={{ color: { position: 'bottom', rowPadding: 4 } }}
        label={false}
      />
    );
  }

  // statistic_trend：仅在有可辨趋势时画迷你面积图
  // - 历史点 < 2：不渲染（避免空 chart 占位）
  // - 全部相同/全 0：Tiny.Area 会画出空白 canvas，同样跳过
  if (card.vizType === 'statistic_trend') {
    if (series.length < 2) return null;
    const values = series.map((p) => Number(p.value ?? 0));
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (!(max > min)) return null;
    return (
      <Tiny.Area
        height={48}
        autoFit
        data={values.map((value, index) => ({ index, value }))}
        xField="index"
        yField="value"
        style={{ fill: 'linear-gradient(-90deg, #c6e5ff 0%, #eef6ff 100%)', fillOpacity: 0.6 }}
      />
    );
  }
  return null;
}

const MetricsDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<API.BizdataMetricDashboard | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<API.BizdataMetricCard | null>(null);
  const [formDraft, setFormDraft] = useState<Partial<API.BizdataMetricCard> | null>(null);

  const loadDashboard = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await getBizdataMetricsDashboard({ refresh });
      if (!isApiSuccess(response)) {
        message.error(response.message || '加载看板失败');
        return;
      }
      setDashboard(getApiData<API.BizdataMetricDashboard>(response) || { domains: [] });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard(false);
  }, [loadDashboard]);

  useAIChatPrompts(buildMetricDashboardPrompts());

  useAISurface({
    id: 'bizdata.metrics.dashboard',
    domain: 'bizdata',
    label: '指标看板',
    read: () => ({
      path: '/business_data/metrics/dashboard',
      domainCount: dashboard?.domains?.length ?? 0,
      cardCount: (dashboard?.domains || []).reduce((n, d) => n + (d.cards?.length || 0), 0),
      formDraft,
      drawerOpen,
    }),
    refresh: () => loadDashboard(false),
    matchMutation: (mutation) =>
      mutation.domain === 'bizdata'
      && (
        mutation.type === 'metric.dashboard_refreshed'
        || mutation.type === 'metric.executed'
        || mutation.type === 'metric.card_upserted'
        || mutation.type === 'metric.card_deleted'
        || mutation.type === 'metric.card_suggested'
      ),
    applyMutation: async (mutation) => {
      if (mutation.type === 'metric.card_suggested' && mutation.payload) {
        const draft = mutation.payload as Partial<API.BizdataMetricCard>;
        setFormDraft(draft);
        setEditingCard(null);
        setDrawerOpen(true);
        return;
      }
      await loadDashboard(false);
    },
  });

  const handleExecute = useCallback(
    async (card: API.BizdataMetricCard) => {
      const metricId = card.metricId || card.metric?.id;
      if (!metricId) return;
      setExecutingId(metricId);
      try {
        const res = await postBizdataMetricExecute(metricId);
        if (!isApiSuccess(res)) {
          message.error(getApiErrorMessage(res, '执行失败'));
          return;
        }
        message.success(`已执行「${card.metric?.label || card.metric?.code || card.title}」`);
        await loadDashboard(false);
      } catch (err) {
        message.error(getApiErrorMessage(err, '执行失败'));
      } finally {
        setExecutingId(null);
      }
    },
    [loadDashboard],
  );

  const handleCopyCode = useCallback(async (code?: string) => {
    const text = String(code || '').trim();
    if (!text) {
      message.warning('该指标没有 code');
      return;
    }
    try {
      const ok = await copyTextToClipboard(text);
      if (ok) message.success('已复制指标 code');
      else message.error('复制失败');
    } catch {
      message.error('复制失败');
    }
  }, []);

  const handleDeleteCard = useCallback(
    (card: API.BizdataMetricCard) => {
      if (!card.id) return;
      Modal.confirm({
        title: '删除指标卡片？',
        content: `将删除「${card.title}」，不会删除底层指标定义。`,
        okType: 'danger',
        onOk: async () => {
          const res = await deleteBizdataMetricCard(card.id!);
          if (!isApiSuccess(res)) {
            message.error(getApiErrorMessage(res, '删除失败'));
            return;
          }
          message.success('已删除');
          await loadDashboard(false);
        },
      });
    },
    [loadDashboard],
  );

  const buildMenuItems = useCallback(
    (card: API.BizdataMetricCard): MenuProps['items'] => [
      {
        key: 'execute',
        label: '执行指标计算',
        disabled: !(card.metricId || card.metric?.id) || executingId === (card.metricId || card.metric?.id),
        onClick: ({ domEvent }) => {
          domEvent.stopPropagation();
          void handleExecute(card);
        },
      },
      {
        key: 'copy',
        label: '复制指标 code',
        disabled: !card.metric?.code,
        onClick: ({ domEvent }) => {
          domEvent.stopPropagation();
          void handleCopyCode(card.metric?.code);
        },
      },
      {
        key: 'edit',
        label: '编辑卡片',
        onClick: ({ domEvent }) => {
          domEvent.stopPropagation();
          setEditingCard(card);
          setFormDraft(null);
          setDrawerOpen(true);
        },
      },
      {
        key: 'delete',
        label: '删除卡片',
        danger: true,
        onClick: ({ domEvent }) => {
          domEvent.stopPropagation();
          handleDeleteCard(card);
        },
      },
    ],
    [executingId, handleCopyCode, handleDeleteCard, handleExecute],
  );

  const domains = dashboard?.domains || [];
  const drawerEditing = editingCard || (formDraft as API.BizdataMetricCard | null);

  return (
    <PageContainer
      title={<PageContainerTitleWithBack title="指标看板" />}
      extra={[
        <Button key="refresh" loading={refreshing} onClick={() => loadDashboard(true)}
          icon={<ReloadOutlined />}
        />,
        <Button
          key="create"
          type="primary"
          onClick={() => {
            setEditingCard(null);
            setFormDraft(null);
            setDrawerOpen(true);
          }}
        >
          新建指标卡片
        </Button>,
        <Button key="manage" onClick={() => navigate('/business_data/metrics')}>
          指标管理
        </Button>,
      ]}
    >
      <Spin spinning={loading}>
        {domains.length === 0 ? (
          <Empty description="暂无指标卡片，请新建或让 AI 帮你创建" />
        ) : (
          domains.map((domain) => (
            <Card
              key={domain.name || 'default'}
              title={domain.name || '未分类'}
              className="metric-dash-domain"
              size="small"
              style={{ marginBottom: 16 }}
            >
              <Row gutter={[16, 16]}>
                {(domain.cards || []).map((card) => {
                  const trend = card.trend;
                  const chart = renderChart(card);
                  const placement = card.config?.chartPlacement || 'bottom';
                  return (
                    <Col
                      key={card.id}
                      xs={24}
                      sm={12}
                      md={card.vizType === 'line' || card.vizType === 'bar' ? 12 : 8}
                      lg={card.vizType === 'line' || card.vizType === 'bar' ? 8 : 6}
                    >
                      <StatisticCard
                        className="metric-dash-card"
                        loading={executingId === (card.metricId || card.metric?.id)}
                        title={card.title}
                        chartPlacement={placement}
                        statistic={{
                          value: card.value ?? '-',
                          suffix: card.unit,
                          precision:
                            card.value != null && typeof card.value === 'number' && card.value % 1 !== 0
                              ? 2
                              : 0,
                          description:
                            card.vizType === 'statistic_trend' && trend ? (
                              <StatisticCard.Statistic
                                title="较上次"
                                value={`${trend.percent ?? 0}%`}
                                trend={
                                  trend.direction === 'up'
                                    ? 'up'
                                    : trend.direction === 'down'
                                      ? 'down'
                                      : undefined
                                }
                              />
                            ) : card.emptyReason && card.value == null ? (
                              <span className="metric-dash-card__hint">{card.emptyReason}</span>
                            ) : card.lastComputedAt ? (
                              <span className="metric-dash-card__meta">
                                {new Date(card.lastComputedAt).toLocaleString()}
                              </span>
                            ) : undefined,
                        }}
                        chart={chart || undefined}
                        extra={
                          <Dropdown
                            menu={{ items: buildMenuItems(card) }}
                            trigger={['click']}
                            placement="bottomRight"
                          >
                            <Button
                              type="text"
                              size="small"
                              className="metric-dash-card__more"
                              icon={<MoreOutlined />}
                              aria-label="更多操作"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </Dropdown>
                        }
                      />
                    </Col>
                  );
                })}
              </Row>
            </Card>
          ))
        )}
      </Spin>

      <MetricCardFormDrawer
        open={drawerOpen}
        editing={drawerEditing}
        onClose={() => {
          setDrawerOpen(false);
          setEditingCard(null);
          setFormDraft(null);
        }}
        onSaved={() => void loadDashboard(false)}
      />
    </PageContainer>
  );
};

export default MetricsDashboardPage;
