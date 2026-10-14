import { message } from '@/utils/antdAppApis';
import {
  CopyOutlined,
  DeleteOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Empty,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import React from 'react';
import type { PackHistoryRecord } from '../storage';
import { copyText, formatSize } from './PackConsole';

const { Text } = Typography;

const STATUS_META: Record<string, { color: string; text: string }> = {
  running: { color: 'processing', text: '打包中' },
  succeeded: { color: 'success', text: '成功' },
  failed: { color: 'error', text: '失败' },
  cancelled: { color: 'warning', text: '已取消' },
};

interface PackHistoryProps {
  title?: string;
  records: PackHistoryRecord[];
  onClear?: () => void;
  onRemove?: (jobId: string) => void;
}

/**
 * 打包历史（存在浏览器 localStorage）。只记已完成的任务，
 * 目标目录/完整路径可一键复制，方便照着去取包。
 */
const PackHistory: React.FC<PackHistoryProps> = ({
  title = '打包历史',
  records,
  onClear,
  onRemove,
}) => {
  return (
    <Card
      title={
        <Space size={8}>
          <HistoryOutlined />
          <span>{title}</span>
          <Text type="secondary">（{records.length}，存在本机浏览器）</Text>
        </Space>
      }
      extra={
        records.length > 0 && onClear ? (
          <Button size="small" icon={<DeleteOutlined />} onClick={onClear}>
            清空
          </Button>
        ) : null
      }
      style={{ marginTop: 16 }}
    >
      {records.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <Text type="secondary">
              还没有打包记录；打包结束后会自动记在这里
            </Text>
          }
        />
      ) : (
        <Table<PackHistoryRecord>
          size="small"
          rowKey="jobId"
          pagination={false}
          scroll={{ y: 260 }}
          dataSource={records}
          columns={[
            {
              title: '时间',
              dataIndex: 'startedAt',
              width: 132,
              render: (value: string) => (
                <Space direction="vertical" size={0}>
                  <span>{dayjs(value).format('MM-DD HH:mm')}</span>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {dayjs(value).format('YYYY')}
                  </Text>
                </Space>
              ),
            },
            {
              title: '版本',
              dataIndex: 'version',
              width: 80,
              render: (value: string, record) => (
                <Space direction="vertical" size={0}>
                  <span>{value || '-'}</span>
                  <Tag
                    color={STATUS_META[record.status]?.color}
                    style={{
                      marginInlineEnd: 0,
                      fontSize: 11,
                      lineHeight: '16px',
                    }}
                  >
                    {STATUS_META[record.status]?.text || record.status}
                  </Tag>
                </Space>
              ),
            },
            {
              title: '内容',
              dataIndex: 'summary',
              render: (value: string, record) => (
                <Space direction="vertical" size={0}>
                  <span>
                    {record.appName ? `${record.appName} · ${value}` : value}
                  </span>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {record.artifactFile || record.label}
                  </Text>
                </Space>
              ),
            },
            {
              title: '目标目录 / 产物',
              width: 320,
              render: (_, record) => {
                const dir = record.artifactDir || record.outDir;
                return (
                  <Space
                    direction="vertical"
                    size={0}
                    style={{ maxWidth: '100%' }}
                  >
                    <Space size={4}>
                      <Text code style={{ fontSize: 12 }}>
                        {dir}
                      </Text>
                      <Tooltip title="复制目标目录">
                        <Button
                          type="link"
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => copyText(dir, '目标目录已复制')}
                        />
                      </Tooltip>
                    </Space>
                    {record.artifactFile ? (
                      <Space size={4}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {record.artifactFile}
                          {record.artifactSize
                            ? `（${formatSize(record.artifactSize)}）`
                            : ''}
                        </Text>
                        <Tooltip title="复制完整路径">
                          <Button
                            type="link"
                            size="small"
                            icon={<CopyOutlined />}
                            onClick={() =>
                              copyText(
                                record.artifactPath ||
                                  record.artifactFile ||
                                  '',
                                '完整路径已复制',
                              )
                            }
                          />
                        </Tooltip>
                      </Space>
                    ) : (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {record.status === 'succeeded' ? '未见产物' : '未产出'}
                      </Text>
                    )}
                  </Space>
                );
              },
            },
            {
              title: '操作',
              width: 70,
              align: 'center',
              render: (_, record) =>
                onRemove ? (
                  <Tooltip title="从历史中移除">
                    <Button
                      type="link"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => {
                        onRemove(record.jobId);
                        message.success('已从历史移除');
                      }}
                    />
                  </Tooltip>
                ) : null,
            },
          ]}
        />
      )}
    </Card>
  );
};

export default PackHistory;
