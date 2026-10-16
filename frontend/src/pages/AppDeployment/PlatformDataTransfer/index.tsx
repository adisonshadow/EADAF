import {
  postPlatformTransferExport,
  postPlatformTransferImport,
  postPlatformTransferPreview,
} from '@/services/EADAF/api/system';
import { message, modal } from '@/utils/antdAppApis';
import { getApiData, isApiSuccess } from '@/utils/apiResponse';
import { DownloadOutlined, InboxOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import type { UploadFile } from 'antd';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Radio,
  Row,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Typography,
  Upload,
} from 'antd';
import React, { useState } from 'react';

const EXPORT_CONTENT_ITEMS = [
  'EADAF 全局 Skill 与绑在 EADAF 上的专用 Skill / Tool / Scope',
  '实例级 AI 目录(Provider / 模型 / 能力 / IO 标签;API Key 以明文段携带)',
  '数据标准目录(bizdata.data_standards)',
  '系统功能开关(system_features)',
  'EADAF 权限目录(权限码,不含用户 / 部门 / 角色授权)',
];

const SECTION_LABELS: Record<string, string> = {
  skills: 'Skill',
  ai: 'AI 目录',
  dataStandards: '数据标准',
  systemFeatures: '系统开关',
  uacPermissions: 'EADAF 权限目录',
  storageBuckets: '存储桶',
  storageObjects: '存储文件',
  aborted: '导入中止',
};

const SUB_LABELS: Record<string, string> = {
  items: '条目',
  tools: '工具',
  scopes: 'Scope',
  skillTools: 'Skill-Tool',
  applications: '应用绑定',
  providers: 'Provider',
  models: '模型',
  capabilities: '能力',
  ioTags: 'IO 标签',
  created: '新建',
  updated: '更新',
  skipped: '跳过',
  copied: '拷贝文件',
  failed: '失败',
};

const STRATEGY_OPTIONS = [
  {
    value: 'overwrite',
    label: '覆盖更新(默认)',
    desc: '同业务键的记录按文件内容覆盖',
  },
  {
    value: 'skip',
    label: '跳过已存在',
    desc: '目标已有的记录保持不变',
  },
  {
    value: 'abort',
    label: '有冲突即中止',
    desc: '预检发现任何冲突则不写入任何数据',
  },
];

const SECTION_STATUS_META: Record<string, { color: string; text: string }> = {
  ok: { color: 'success', text: '成功' },
  failed: { color: 'error', text: '失败' },
  skipped: { color: 'default', text: '跳过' },
};

function buildExportFileName() {
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = new Date();
  const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(
    d.getDate(),
  )}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `eadaf-platform-export-${ts}.zip`;
}

async function extractErrorMessage(
  error: unknown,
  fallback = '请求失败',
): Promise<string> {
  const err = error as
    | { response?: { data?: unknown; status?: number }; message?: string }
    | undefined;
  const data = err?.response?.data;
  const status = err?.response?.status;
  const prefix = status ? `请求失败(${status})` : fallback;
  if (data instanceof Blob) {
    try {
      const text = await data.text();
      const json = JSON.parse(text) as { message?: string };
      return json.message || prefix;
    } catch {
      return prefix;
    }
  }
  if (data && typeof data === 'object' && 'message' in data) {
    const m = (data as { message?: string }).message;
    if (m) return m;
  }
  return err?.message || prefix;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

type SectionRow = { key: string; label: string; detail: string };

function flattenSectionCounts(
  sections: Record<string, unknown> | undefined | null,
): SectionRow[] {
  if (!sections) return [];
  return Object.entries(sections).map(([key, value]) => {
    const label = SECTION_LABELS[key] || key;
    let detail = '-';
    if (typeof value === 'number') {
      detail = `${value} 项`;
    } else if (value && typeof value === 'object') {
      const parts = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => typeof v === 'number' && v > 0)
        .map(([k, v]) => `${SUB_LABELS[k] || k} ${v}`);
      detail = parts.length ? parts.join('、') : '空';
    } else if (value === null) {
      detail = '未勾选';
    }
    return { key, label, detail };
  });
}

/** 导入预览/结果的错误、警告明细可能上百条：限高 200px 内滚动,避免把整页撑长 */
const MESSAGE_SCROLL_STYLE: React.CSSProperties = {
  maxHeight: 200,
  overflowY: 'auto',
};

/** EADAF数据导出/导入 Tab(与业务应用包分开) */
const PlatformTransferPanel: React.FC = () => {
  const [includeFiles, setIncludeFiles] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] =
    useState<API.PlatformTransferPreviewResult | null>(null);
  const [strategy, setStrategy] = useState('overwrite');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] =
    useState<API.PlatformTransferImportResult | null>(null);

  const handleExport = async () => {
    try {
      setExporting(true);
      const blob = await postPlatformTransferExport({ includeFiles });
      if (blob.type?.includes('application/json')) {
        const text = await blob.text();
        try {
          const parsed = JSON.parse(text) as {
            message?: string;
            format?: string;
          };
          if (parsed.format === 'eadaf-platform-export') {
            triggerBlobDownload(
              new Blob([text], { type: 'application/json' }),
              buildExportFileName(),
            );
            message.success('平台导出文件已开始下载,请妥善保管(内含明文密钥)');
            return;
          }
          message.error(parsed.message || '导出失败:服务返回异常响应');
        } catch {
          message.error('导出失败:响应不是合法的导出文件');
        }
        return;
      }
      triggerBlobDownload(blob, buildExportFileName());
      message.success('平台导出文件已开始下载,请妥善保管(内含明文密钥)');
    } catch (error) {
      message.error(await extractErrorMessage(error, '导出失败'));
    } finally {
      setExporting(false);
    }
  };

  const resetImport = () => {
    setImportFile(null);
    setPreview(null);
    setStrategy('overwrite');
    setImportResult(null);
  };

  const runPreview = async (file: File) => {
    setPreviewLoading(true);
    setPreview(null);
    setImportResult(null);
    try {
      const res = await postPlatformTransferPreview(file);
      if (isApiSuccess(res)) {
        setPreview(getApiData<API.PlatformTransferPreviewResult>(res) || null);
      } else {
        message.error(res.message || '预览失败');
        setImportFile(null);
      }
    } catch (error) {
      message.error(await extractErrorMessage(error, '预览失败'));
      setImportFile(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleImportFileChange = ({ fileList }: { fileList: UploadFile[] }) => {
    const file = (fileList[0]?.originFileObj as File | undefined) || null;
    setImportFile(file);
    setPreview(null);
    setImportResult(null);
    if (file) runPreview(file);
  };

  const conflictCount = preview?.conflicts?.length || 0;

  const handleImport = () => {
    if (!importFile || !preview) {
      message.warning('请先选择平台导出文件并等待预览完成');
      return;
    }
    const strategyDesc =
      STRATEGY_OPTIONS.find((o) => o.value === strategy)?.label || strategy;
    modal.confirm({
      title: '确认导入 EADAF 平台数据?',
      content: `将按「${strategyDesc}」策略覆盖或跳过目标实例的平台 Skill、AI 目录、数据标准、系统开关与权限目录。不会写入业务实体或行数据。导入不可自动撤销。`,
      okText: '开始导入',
      okButtonProps: { danger: strategy === 'overwrite' },
      cancelText: '取消',
      onOk: async () => {
        setImporting(true);
        try {
          const res = await postPlatformTransferImport(importFile, strategy);
          if (isApiSuccess(res)) {
            const data =
              getApiData<API.PlatformTransferImportResult>(res) || null;
            setImportResult(data);
            if (data?.aborted) {
              message.warning('存在冲突,已按 abort 策略中止,未写入任何数据');
            } else {
              message.success('导入执行完成,请查看分节结果');
            }
          } else {
            message.error(res.message || '导入失败');
          }
        } catch (error) {
          message.error(await extractErrorMessage(error, '导入失败'));
        } finally {
          setImporting(false);
        }
      },
    });
  };

  const sectionRows = flattenSectionCounts(
    importResult?.sections as Record<string, unknown>,
  );

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={12}>
        <Card title="导出 EADAF 平台" extra={<DownloadOutlined />}>
          <Alert
            type="warning"
            showIcon
            message="导出文件包含明文密钥"
            description="Provider API Key 将以明文写入导出文件。本包不含业务应用、实体、API 或行数据。"
            style={{ marginBottom: 16 }}
          />
          <Space style={{ marginBottom: 16 }} align="start">
            <Switch
              size="small"
              checked={includeFiles}
              onChange={setIncludeFiles}
            />
            <span>导出桶和文件(EADAF / 系统桶及其对象;不含业务应用桶)</span>
          </Space>
          <Typography.Paragraph type="secondary">
            用于把本实例的平台能力同步到另一套
            EADAF,与「应用数据导出/导入」互斥。
          </Typography.Paragraph>
          <ul style={{ margin: '0 0 16px', paddingLeft: 18, lineHeight: 1.9 }}>
            {EXPORT_CONTENT_ITEMS.map((item) => (
              <li key={item}>
                <Typography.Text type="secondary">{item}</Typography.Text>
              </li>
            ))}
            <li>
              <Typography.Text type="secondary">
                {includeFiles
                  ? 'EADAF / 系统桶元数据及其对象文件'
                  : '默认不含存储桶与对象文件(勾选上方选项后携带)'}
              </Typography.Text>
            </li>
          </ul>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            loading={exporting}
            onClick={() => void handleExport()}
          >
            导出平台 ZIP
          </Button>
        </Card>
      </Col>

      <Col xs={24} lg={12}>
        <Card
          title="导入 EADAF 平台"
          extra={
            <Button size="small" onClick={resetImport}>
              重置
            </Button>
          }
        >
          <Alert
            type="warning"
            showIcon
            message="导入会写入目标实例的平台数据,不可自动撤销"
            description="误传业务应用导出文件会被拒绝。各节失败互不影响。"
            style={{ marginBottom: 16 }}
          />
          <Upload.Dragger
            accept=".zip,.json"
            maxCount={1}
            fileList={
              importFile
                ? [
                    {
                      uid: '-1',
                      name: importFile.name,
                      status: 'done',
                    } as UploadFile,
                  ]
                : []
            }
            beforeUpload={() => false}
            onRemove={resetImport}
            onChange={handleImportFileChange}
            disabled={previewLoading || importing}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">
              点击或拖拽 eadaf-platform-export 的 .zip 文件到此处
            </p>
            <p className="ant-upload-hint">
              支持平台 zip 包(仍接受旧版单
              .json);应用包请到「应用数据导出/导入」页
            </p>
          </Upload.Dragger>

          {previewLoading && (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <Spin tip="正在解析并预检…" />
            </div>
          )}

          {preview && (
            <div style={{ marginTop: 16 }}>
              <Descriptions
                size="small"
                column={2}
                bordered
                items={[
                  {
                    key: 'code',
                    label: '平台编码',
                    children: preview.platform?.applicationCode || 'EADAF',
                  },
                  {
                    key: 'name',
                    label: '名称',
                    children: preview.platform?.name || '-',
                  },
                ]}
              />
              <Table
                size="small"
                style={{ marginTop: 12 }}
                pagination={false}
                rowKey="key"
                dataSource={flattenSectionCounts(preview.sections)}
                columns={[
                  { title: '节', dataIndex: 'label', width: 140 },
                  { title: '条数', dataIndex: 'detail' },
                ]}
              />
              {conflictCount > 0 && (
                <Alert
                  type="error"
                  showIcon
                  style={{ marginTop: 12 }}
                  message={`发现 ${conflictCount} 处将覆盖或冲突的记录`}
                  description={
                    <ul
                      style={{
                        margin: 0,
                        paddingLeft: 18,
                        ...MESSAGE_SCROLL_STYLE,
                      }}
                    >
                      {(preview.conflicts || []).map((c, i) => (
                        <li key={`c-${i}`}>
                          {SECTION_LABELS[c.section || ''] || c.section}:
                          {c.code} 的 {c.key}「{c.value}」
                          {c.type === 'second_key'
                            ? ` 已被「${c.existingCode}」占用`
                            : ' 已存在于目标实例'}
                        </li>
                      ))}
                    </ul>
                  }
                />
              )}
              {(preview.warnings?.length || 0) > 0 && (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginTop: 12 }}
                  message="其他提示"
                  description={
                    <ul
                      style={{
                        margin: 0,
                        paddingLeft: 18,
                        ...MESSAGE_SCROLL_STYLE,
                      }}
                    >
                      {preview.warnings?.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  }
                />
              )}

              <Form layout="vertical" style={{ marginTop: 16 }}>
                <Form.Item label="冲突策略" style={{ marginBottom: 8 }}>
                  <Radio.Group
                    value={strategy}
                    onChange={(e) => setStrategy(e.target.value)}
                  >
                    <Space orientation="vertical" size={4}>
                      {STRATEGY_OPTIONS.map((o) => (
                        <Radio key={o.value} value={o.value}>
                          {o.label}
                          <Typography.Text
                            type="secondary"
                            style={{ marginLeft: 8 }}
                          >
                            {o.desc}
                          </Typography.Text>
                        </Radio>
                      ))}
                    </Space>
                  </Radio.Group>
                </Form.Item>
              </Form>
              <Button
                type="primary"
                danger={strategy === 'overwrite'}
                loading={importing}
                onClick={handleImport}
              >
                按当前策略导入
              </Button>
            </div>
          )}

          {importResult && (
            <div style={{ marginTop: 16 }}>
              {importResult.aborted && (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message="存在冲突,已中止导入,未写入任何数据"
                />
              )}
              <Table<SectionRow>
                size="small"
                pagination={false}
                rowKey="key"
                dataSource={sectionRows}
                columns={[
                  { title: '节', dataIndex: 'label', width: 120 },
                  {
                    title: '状态',
                    width: 80,
                    render: (_, record) => {
                      const status =
                        importResult.sections?.[record.key]?.status;
                      const meta =
                        SECTION_STATUS_META[status || 'ok'] ||
                        SECTION_STATUS_META.ok;
                      return <Tag color={meta.color}>{meta.text}</Tag>;
                    },
                  },
                  { title: '计数', dataIndex: 'detail' },
                  {
                    title: '错误',
                    render: (_, record) => {
                      const errors =
                        importResult.sections?.[record.key]?.errors || [];
                      if (!errors.length) return '-';
                      return (
                        <Typography.Text type="danger">
                          {errors.length} 条
                        </Typography.Text>
                      );
                    },
                  },
                  {
                    title: '说明',
                    render: (_, record) => {
                      const notes =
                        importResult.sections?.[record.key]?.notes || [];
                      if (!notes.length) return '-';
                      return (
                        <Typography.Text type="secondary">
                          {notes.length} 条
                        </Typography.Text>
                      );
                    },
                  },
                ]}
              />
              {(importResult.warnings?.length || 0) > 0 && (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginTop: 12 }}
                  message="导入提示"
                  description={
                    <ul
                      style={{
                        margin: 0,
                        paddingLeft: 18,
                        ...MESSAGE_SCROLL_STYLE,
                      }}
                    >
                      {importResult.warnings?.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  }
                />
              )}
              <Typography.Text
                type="secondary"
                style={{ display: 'block', marginTop: 8 }}
              >
                总耗时 {((importResult.durationMs || 0) / 1000).toFixed(1)} 秒
              </Typography.Text>
            </div>
          )}
        </Card>
      </Col>
    </Row>
  );
};

/**
 * 「应用部署 → EADAF数据导出/导入」页。
 * 该功能已从「系统设置」迁到这里（设置里不再展示），路由 /app_deployment/platform-data。
 */
const PlatformDataTransferPage: React.FC = () => (
  <PageContainer title="EADAF数据导出/导入">
    <PlatformTransferPanel />
  </PageContainer>
);

export default PlatformDataTransferPage;
