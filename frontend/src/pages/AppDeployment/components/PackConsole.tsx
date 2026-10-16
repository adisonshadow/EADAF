import type { PackJob, PackLogLine } from '@/services/EADAF/api/appDeployment';
import { message } from '@/utils/antdAppApis';
import {
  CopyOutlined,
  DownloadOutlined,
  StopOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LOG_COLOR, logLineColor } from './logColors';

const { Text, Paragraph } = Typography;

export function formatSize(size: number | null | undefined): string {
  if (size === null || size === undefined || Number.isNaN(size)) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatDuration(
  startedAt?: string | null,
  finishedAt?: string | null,
): string {
  if (!startedAt) return '-';
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return `${minutes} 分 ${rest} 秒`;
  return `${Math.floor(minutes / 60)} 时 ${minutes % 60} 分`;
}

/** 复制到剪贴板；非安全上下文（如局域网 http）下回退到 execCommand */
export async function copyText(
  text: string,
  okMessage = '已复制',
): Promise<void> {
  const value = String(text ?? '');
  if (!value) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      message.success(okMessage);
      return;
    }
  } catch {
    /* 回退到 execCommand */
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    message.success(okMessage);
  } catch {
    message.error('复制失败，请手动选择文本复制');
  }
}

const STATUS_META: Record<PackJob['status'], { color: string; text: string }> =
  {
    running: { color: 'processing', text: '打包中' },
    succeeded: { color: 'success', text: '打包成功' },
    failed: { color: 'error', text: '打包失败' },
    cancelled: { color: 'warning', text: '已取消' },
  };

interface PackConsoleProps {
  job: PackJob | null;
  lines: PackLogLine[];
  streaming: boolean;
  streamError: string | null;
  cancelling?: boolean;
  onCancel?: () => void;
  emptyHint?: React.ReactNode;
  title?: string;
  /** 产物区标题，默认「打包完成」 */
  doneTitle?: string;
}

/**
 * 打包控制台：实时日志在上，状态/产物等通知紧跟在日志下方（不挡住最新输出）。
 * 日志区始终只保留尾部，开启自动滚动时跟随最新输出。
 */
const PackConsole: React.FC<PackConsoleProps> = ({
  job,
  lines,
  streaming,
  streamError,
  cancelling,
  onCancel,
  emptyHint,
  title = '打包控制台',
  doneTitle = '打包完成',
}) => {
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    if (!autoScroll) return;
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [lines, autoScroll]);

  const statusMeta = job ? STATUS_META[job.status] : null;
  const running = job?.status === 'running';
  const droppedNotice = useMemo(
    () =>
      job && job.droppedBefore > 0
        ? `早于 #${job.droppedBefore} 的日志已滚动丢弃`
        : null,
    [job],
  );

  return (
    <Card
      title={
        <Space size={8}>
          <span>{title}</span>
          {statusMeta && <Tag color={statusMeta.color}>{statusMeta.text}</Tag>}
          {streaming && job?.status === 'running' && (
            <Tag color="blue">实时连接中</Tag>
          )}
        </Space>
      }
      extra={
        <Space>
          <Space size={4}>
            <Text type="secondary">自动滚动</Text>
            <Switch
              size="small"
              checked={autoScroll}
              onChange={setAutoScroll}
            />
          </Space>
          {running && onCancel && (
            <Button
              danger
              size="small"
              icon={<StopOutlined />}
              loading={cancelling}
              onClick={onCancel}
            >
              取消打包
            </Button>
          )}
        </Space>
      }
    >
      {!job ? (
        // 刚打开页面时不显示上一次的任务信息，避免被当成本次结果
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={emptyHint || '尚未开始打包'}
          style={{ padding: '24px 0' }}
        />
      ) : (
        <>
          <Descriptions size="small" column={2} style={{ marginBottom: 12 }}>
            <Descriptions.Item label="任务">{job.label}</Descriptions.Item>
            <Descriptions.Item label="耗时">
              {formatDuration(job.startedAt, job.finishedAt)}
            </Descriptions.Item>
            <Descriptions.Item label="版本">
              {job.version || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="退出码">
              {job.exitCode === null || job.exitCode === undefined
                ? '-'
                : job.exitCode}
            </Descriptions.Item>
            <Descriptions.Item label="目标目录" span={2}>
              <Space size={4}>
                <Text code>{job.outDir}</Text>
                <Tooltip title="复制目标目录">
                  <Button
                    type="link"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => copyText(job.outDir, '目标目录已复制')}
                  />
                </Tooltip>
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="等价命令" span={2}>
              <Space size={4}>
                <Text code>{job.command}</Text>
                <Tooltip title="复制命令">
                  <Button
                    type="link"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => copyText(job.command, '命令已复制')}
                  />
                </Tooltip>
              </Space>
            </Descriptions.Item>
          </Descriptions>

          <pre
            ref={scrollRef}
            style={{
              margin: 0,
              padding: 12,
              height: 380,
              overflow: 'auto',
              background: '#1e1e1e',
              color: LOG_COLOR.normal,
              borderRadius: 6,
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
              fontSize: 12,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {lines.length === 0 ? (
              <span style={{ color: LOG_COLOR.muted }}>（暂无输出）</span>
            ) : (
              lines.map((line) => (
                <div key={line.seq} style={{ color: logLineColor(line) }}>
                  {line.text || ' '}
                </div>
              ))
            )}
          </pre>

          <Paragraph
            type="secondary"
            style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}
          >
            日志配色：<Text type="success">浅绿＝进度信息</Text>（docker 构建 /
            pnpm 提示等，多为 stderr）、<Text type="warning">浅黄＝警告</Text>、
            <Text type="danger">浅红＝错误</Text>。
          </Paragraph>
        </>
      )}

      {/* 通知统一放在日志下方：打包结束时正好接着最新输出，不遮挡日志 */}
      {streamError && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 12 }}
          message="日志流中断"
          description={streamError}
        />
      )}

      {job?.status === 'succeeded' && job.artifact && (
        <Alert
          type="success"
          showIcon
          style={{ marginTop: 12 }}
          message={
            <Space size={8}>
              <DownloadOutlined />
              <span>
                {doneTitle}：{job.artifact.file}
              </span>
              <Text type="secondary">（{formatSize(job.artifact.size)}）</Text>
            </Space>
          }
          description={
            <Space direction="vertical" size={2}>
              <Space size={4}>
                <Text strong>目标目录：</Text>
                <Text code>{job.artifact.dir}</Text>
                <Tooltip title="复制目标目录">
                  <Button
                    type="link"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() =>
                      copyText(job.artifact?.dir || '', '目标目录已复制')
                    }
                  />
                </Tooltip>
              </Space>
              <Space size={4}>
                <Text strong>完整路径：</Text>
                <Text code>{job.artifact.path}</Text>
                <Tooltip title="复制完整路径">
                  <Button
                    type="link"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() =>
                      copyText(job.artifact?.path || '', '完整路径已复制')
                    }
                  />
                </Tooltip>
              </Space>
            </Space>
          }
        />
      )}

      {job?.status === 'succeeded' && !job.artifact && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 12 }}
          message="打包进程已成功退出，但未在目标目录找到新的 .tar.gz"
          description={`请检查目标目录：${job.outDir}（脚本可能写到了 --out 之外的路径）`}
        />
      )}

      {job?.status === 'failed' && (
        <Alert
          type="error"
          showIcon
          style={{ marginTop: 12 }}
          message="打包失败"
          description={job.error || '请查看上方日志定位原因'}
        />
      )}

      {job?.status === 'cancelled' && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 12 }}
          message="打包已取消"
        />
      )}

      {droppedNotice && (
        <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
          {droppedNotice}
        </Paragraph>
      )}

      {job?.logFile && (
        <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
          完整日志落盘：<Text code>{job.logFile}</Text>
        </Paragraph>
      )}
    </Card>
  );
};

export default PackConsole;
