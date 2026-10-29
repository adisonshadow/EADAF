import { history } from '@/utils/navigation';
import { PageContainer } from '@ant-design/pro-components';
import { Button, Tag, Typography, theme } from 'antd';
import dayjs from 'dayjs';
import React from 'react';
import { useSystemHealth } from '@/hooks/useSystemHealth';
import type { SystemHealthItem, SystemHealthStatus } from '@/services/EADAF/api/adminSystemHealth';

const { Text, Paragraph } = Typography;

const STATUS_LABEL: Record<SystemHealthStatus, string> = {
  ok: '正常',
  warning: '警告',
  error: '错误',
  skip: '跳过',
};

const TAG_COLOR: Record<SystemHealthStatus, string> = {
  ok: 'success',
  warning: 'warning',
  error: 'error',
  skip: 'default',
};

function formatCheckedAt(value?: string) {
  if (!value) return '';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm:ss') : value;
}

const SystemHealthPage: React.FC = () => {
  const { token } = theme.useToken();
  const { report, loading, error, refreshing, refresh } = useSystemHealth();
  const items = report?.items || [];

  let headline = '正在检查…';
  if (report?.status === 'error') {
    headline = `${report.errorCount} 项严重错误需要处理`;
    if (report.warningCount) headline += `，另有 ${report.warningCount} 项警告`;
  } else if (report?.status === 'warning') {
    headline = `${report.warningCount} 项警告`;
  } else if (report?.status === 'ok') {
    headline = '当前检查项均正常';
  } else if (error) {
    headline = error;
  }

  return (
    <PageContainer pageHeaderRender={() => <></>}>
      <div
        style={{
          background: token.colorBgContainer,
          borderRadius: token.borderRadiusLG,
          padding: token.paddingLG,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: token.margin,
            marginBottom: token.margin,
          }}
        >
          <div>
            <div style={{ fontSize: token.fontSizeHeading4, fontWeight: 600 }}>系统健康</div>
            <Text type="secondary">{headline}</Text>
            {report?.checkedAt ? (
              <div>
                <Text type="secondary">检查时间 {formatCheckedAt(report.checkedAt)}</Text>
              </div>
            ) : null}
          </div>
          <Button onClick={() => void refresh()} loading={refreshing || (loading && !report)}>
            重新检查
          </Button>
        </div>

        {items.map((row) => (
          <HealthRow key={row.key} row={row} />
        ))}
      </div>
    </PageContainer>
  );
};

function HealthRow({ row }: { row: SystemHealthItem }) {
  const { token } = theme.useToken();
  return (
    <div
      style={{
        display: 'flex',
        gap: token.margin,
        alignItems: 'flex-start',
        paddingBlock: token.paddingSM,
        borderTop: `${token.lineWidth}px solid ${token.colorSplit}`,
      }}
    >
      <Tag color={TAG_COLOR[row.status]} style={{ marginInlineEnd: 0 }}>
        {STATUS_LABEL[row.status]}
      </Tag>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{row.label}</div>
        <Paragraph style={{ marginBottom: row.hint || row.href ? token.marginXXS : 0 }}>
          {row.summary}
        </Paragraph>
        {row.hint ? <Text type="secondary">{row.hint}</Text> : null}
      </div>
      {row.href && row.status !== 'skip' ? (
        <Button type="link" style={{ padding: 0 }} onClick={() => history.push(row.href!)}>
          {row.status === 'ok' ? '查看' : '去处理'}
        </Button>
      ) : null}
    </div>
  );
}

export default SystemHealthPage;
