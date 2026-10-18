import { getApplications } from '@/services/EADAF/api/applications';
import {
  postAppTransferExport,
  postAppTransferImport,
  postAppTransferPreview,
} from '@/services/EADAF/api/system';
import { message, modal } from '@/utils/antdAppApis';
import {
  getApiData,
  isApiSuccess,
  parseApiListResponse,
} from '@/utils/apiResponse';
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
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Typography,
  Upload,
} from 'antd';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import HeaderNotice from '../components/HeaderNotice';
import {
  describeSafeMode,
  resolveExportContent,
  type ExportDataMode,
} from './exportContent';

const SYSTEM_APPLICATION_CODE = 'EADAF';

const SECTION_LABELS: Record<string, string> = {
  application: '应用配置',
  entities: '数据实体',
  databaseConnections: '数据库连接',
  apiServices: 'API 服务',
  collectionPipelines: '采集管道',
  outboundWebhooks: 'Outbound Webhook',
  metrics: '指标',
  hooks: '钩子',
  skills: 'Skill',
  metadata: '逻辑元数据',
  eadaf: 'EADAF 数据',
  eadafUsers: 'EADAF 用户数据',
  storageBuckets: '存储桶',
  storageObjects: '存储文件',
  entityData: '行数据',
  materialization: '物化',
  aborted: '导入中止',
};

const SUB_LABELS: Record<string, string> = {
  items: '条目',
  fields: '字段',
  enums: '枚举',
  relations: '关系',
  scopeDocs: 'Scope 文档',
  connectionsHint: '连接提示',
  databaseConnections: '数据库连接',
  physicalTables: '物化表',
  operations: '操作',
  permissions: '授权',
  applications: '应用绑定',
  cards: '卡片',
  tools: '工具',
  scopes: 'Scope',
  skillTools: 'Skill-Tool',
  created: '新建',
  updated: '更新',
  skipped: '跳过',
  copied: '拷贝文件',
  failed: '失败',
  matched: '匹配',
  users: '用户',
  departments: '部门',
  roles: '角色',
  userRoles: '用户角色',
  rolePermissions: '角色权限',
  dataPermissionRules: '数据权限规则',
  providers: 'Provider',
  models: '模型',
  capabilities: '能力',
  ioTags: 'IO 标签',
  tables: '表',
  totalRows: '总行数',
};

const CONNECTION_STATUS_META: Record<string, { color: string; text: string }> =
  {
    matched: { color: 'success', text: '已匹配' },
    willCreate: { color: 'processing', text: '将创建' },
    unmatched: { color: 'error', text: '无法创建' },
  };

/** request 封装只返回 body,附件文件名在前端按同一规则构造 */
function buildExportFileName(appCode: string) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = new Date();
  const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(
    d.getDate(),
  )}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `eadaf-app-export-${appCode}-${ts}.zip`;
}

/** blob 响应可能是 JSON 错误信封(导出失败时),解析出 message */
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
      const obj = value as Record<string, unknown>;
      // 导入结果节为 { status, counts, errors };预览节为扁平计数对象
      const countSource =
        obj.counts && typeof obj.counts === 'object'
          ? (obj.counts as Record<string, unknown>)
          : obj;
      const parts = Object.entries(countSource)
        .filter(([, v]) => typeof v === 'number' && v > 0)
        .map(([k, v]) => `${SUB_LABELS[k] || k} ${v}`);
      detail = parts.length ? parts.join('、') : '空';
    } else if (value === null) {
      detail = '未勾选';
    }
    return { key, label, detail };
  });
}

const STRATEGY_OPTIONS = [
  {
    value: 'overwrite',
    label: '覆盖更新(默认)',
    desc: '同业务键的记录按文件内容覆盖;行数据清空后重写',
  },
  {
    value: 'skip',
    label: '跳过已存在',
    desc: '目标已有的记录保持不变;非空表不写行数据',
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

/** 导入预览/结果的错误、警告明细可能上百条：限高 200px 内滚动,避免把整页撑长 */
const MESSAGE_SCROLL_STYLE: React.CSSProperties = {
  maxHeight: 200,
  overflowY: 'auto',
};

/** 应用数据导出/导入面板（与整库备份互为补充，按应用维度迁移 zip） */
/**
 * 应用数据导出/导入面板（原系统设置 Tab 内容）。
 * 支持按应用导出 zip 包与导入预览/落库；页面外壳见下方 AppDataTransferPage。
 */
const AppTransferPanel: React.FC = () => {
  // ---------- 导出 ----------
  const [exportForm] = Form.useForm();
  const [appOptions, setAppOptions] = useState<
    { label: string; value: string }[]
  >([]);
  const [dataMode, setDataMode] =
    useState<ExportDataMode>('structure_and_data');
  const [includeEadaf, setIncludeEadaf] = useState(false);
  const [includeFiles, setIncludeFiles] = useState(false);
  const [safeMode, setSafeMode] = useState(false);
  const [exporting, setExporting] = useState(false);

  /** 清单随选项联动:不包含的项保留展示,用删除线标注,不做显示/隐藏 */
  const exportContent = useMemo(
    () => resolveExportContent({ dataMode, includeEadaf, includeFiles }),
    [dataMode, includeEadaf, includeFiles],
  );

  const loadApplications = useCallback(async () => {
    try {
      const res = await getApplications({ page: 1, size: -1 });
      const { items } = parseApiListResponse<API.Application>(res);
      setAppOptions(
        items
          .filter((a) => a.code !== SYSTEM_APPLICATION_CODE)
          .map((a) => ({
            label: `${a.name} (${a.code})`,
            value: a.application_id || '',
          }))
          .filter((o) => o.value),
      );
    } catch (e) {
      console.warn('加载应用列表失败', e);
    }
  }, []);

  useEffect(() => {
    loadApplications();
  }, [loadApplications]);

  const handleExport = async () => {
    let appCode = 'app';
    try {
      const values = await exportForm.validateFields();
      const appLabel =
        appOptions.find((o) => o.value === values.applicationId)?.label || '';
      appCode = /\(([^)]+)\)$/.exec(appLabel)?.[1] || 'app';
      setExporting(true);
      const blob = await postAppTransferExport({
        applicationId: values.applicationId,
        dataMode,
        includeEadaf,
        includeFiles,
        safeMode,
      });
      // 导出文件本身是 JSON;正常情况下后端以 octet-stream 附件返回。
      // 若响应是 application/json:优先按错误信封处理,但内容带
      // format=eadaf-app-export 时说明它就是导出文件,直接落盘。
      if (blob.type?.includes('application/json')) {
        const text = await blob.text();
        try {
          const parsed = JSON.parse(text) as {
            message?: string;
            format?: string;
          };
          if (parsed.format === 'eadaf-app-export') {
            triggerBlobDownload(
              new Blob([text], { type: 'application/json' }),
              buildExportFileName(appCode),
            );
            message.success('导出文件已开始下载,请妥善保管(内含明文密钥)');
            return;
          }
          message.error(parsed.message || '导出失败:服务返回异常响应');
        } catch {
          message.error('导出失败:响应不是合法的导出文件');
        }
        return;
      }
      triggerBlobDownload(blob, buildExportFileName(appCode));
      message.success('导出文件已开始下载,请妥善保管(内含明文密钥)');
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) return; // 表单校验错误
      message.error(await extractErrorMessage(error, '导出失败'));
    } finally {
      setExporting(false);
    }
  };

  // ---------- 导入 ----------
  const [importFile, setImportFile] = useState<File | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<API.AppTransferPreviewResult | null>(
    null,
  );
  const [strategy, setStrategy] = useState('overwrite');
  /** 导入安全模式:默认开启(覆盖时退回已发布),显式关闭才保持源发布状态 */
  const [importSafeMode, setImportSafeMode] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] =
    useState<API.AppTransferImportResult | null>(null);

  const resetImport = () => {
    setImportFile(null);
    setPreview(null);
    setStrategy('overwrite');
    setImportSafeMode(true);
    setImportResult(null);
  };

  const runPreview = async (file: File) => {
    setPreviewLoading(true);
    setPreview(null);
    setImportResult(null);
    try {
      const res = await postAppTransferPreview(file);
      if (isApiSuccess(res)) {
        setPreview(getApiData<API.AppTransferPreviewResult>(res) || null);
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

  const conflictCount =
    (preview?.conflicts?.length || 0) + (preview?.hookMultiMatch?.length || 0);
  const unwritableCount = (preview?.entityData || []).filter(
    (e) => e.writable === false,
  ).length;

  const handleImport = () => {
    if (!importFile || !preview) {
      message.warning('请先选择导出文件并等待预览完成');
      return;
    }
    if (preview.application?.code === SYSTEM_APPLICATION_CODE) {
      message.error('内置系统应用 EADAF 不允许导入');
      return;
    }
    const strategyDesc =
      STRATEGY_OPTIONS.find((o) => o.value === strategy)?.label || strategy;
    const safeModeDesc = importSafeMode
      ? '开启安全模式(覆盖时退回已发布 API/管道/Webhook)'
      : '关闭安全模式(保持源端发布状态)';
    modal.confirm({
      title: '确认导入应用数据?',
      content: `将按「${strategyDesc}」策略、${safeModeDesc}把「${
        preview.application?.code || ''
      }」导入当前实例,导入不会自动撤销,请确认。`,
      okText: '开始导入',
      okButtonProps: { danger: strategy === 'overwrite' },
      cancelText: '取消',
      onOk: async () => {
        setImporting(true);
        try {
          const res = await postAppTransferImport(importFile, strategy, {
            safeMode: importSafeMode,
          });
          if (isApiSuccess(res)) {
            const data = getApiData<API.AppTransferImportResult>(res) || null;
            setImportResult(data);
            if (data?.aborted) {
              message.warning('存在冲突,已按 abort 策略中止,未写入任何数据');
            } else if (data?.chainStoppedAt) {
              message.error(
                `导入在「${
                  SECTION_LABELS[data.chainStoppedAt] || data.chainStoppedAt
                }」节失败,后续节已终止`,
              );
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
        <Card
          title="导出应用"
          extra={
            <HeaderNotice
              message="导出文件包含明文密钥"
              description="应用接入密钥、Webhook / Provider 鉴权密钥等将以明文写入导出文件,请妥善保管,避免外泄。"
              ariaLabel="导出警告"
            />
          }
        >
          <Form form={exportForm} layout="vertical">
            <Form.Item
              name="applicationId"
              label="选择应用"
              rules={[{ required: true, message: '请选择要导出的应用' }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                options={appOptions}
                loading={appOptions.length === 0}
                placeholder="内置应用 EADAF 不可导出"
              />
            </Form.Item>
            <Form.Item label="数据模式">
              <Radio.Group
                value={dataMode}
                onChange={(e) => setDataMode(e.target.value)}
                options={[
                  { value: 'structure_and_data', label: '结构和数据(默认)' },
                  { value: 'data_only', label: '仅数据(仍带结构指纹供校验)' },
                ]}
              />
              <Typography.Text
                type="secondary"
                style={{ display: 'block', marginTop: 4 }}
              >
                {dataMode === 'data_only'
                  ? '导入时不落结构:目标无同 code 实体或版本不符的实体将跳过写数。'
                  : '实体结构(含字段 / 枚举 / 关系)与行数据一起迁移。'}
              </Typography.Text>
            </Form.Item>
            <Form.Item label="附带内容" style={{ marginBottom: 8 }}>
              <Space direction="vertical" size={4}>
                <Space>
                  <Switch
                    size="small"
                    checked={includeEadaf}
                    onChange={setIncludeEadaf}
                  />
                  <span>
                    携带 EADAF 数据(用户 / 部门 /
                    授权;不勾选仅携带被引用的角色与权限)
                  </span>
                </Space>
                <Space>
                  <Switch
                    size="small"
                    checked={includeFiles}
                    onChange={setIncludeFiles}
                  />
                  <span>
                    携带存储文件(该应用桶内对象 +
                    归属本应用的对象;不勾选仅桶元数据)
                  </span>
                </Space>
                <Space align="start">
                  <Switch
                    size="small"
                    checked={safeMode}
                    onChange={setSafeMode}
                  />
                  <span>
                    包内安全模式标记(供预览)。导入默认开启安全模式退回已发布;可在导入侧关闭以保持源发布状态
                  </span>
                </Space>
              </Space>
            </Form.Item>
            <Form.Item
              label="导出内容清单"
              // extra="不包含的项目不会隐藏,改用删除线标注,便于和上方选项逐项对照"
              style={{ marginBottom: 8 }}
            >
              <Typography.Text
                type="secondary"
                style={{ display: 'block', marginBottom: 6 }}
              >
                {exportContent.excludedCount > 0
                  ? `共 ${exportContent.total} 项,本次不包含 ${exportContent.excludedCount} 项(已用删除线标注)`
                  : `共 ${exportContent.total} 项,本次全部包含`}
              </Typography.Text>
              {exportContent.groups.map((group) => (
                <div key={group.key} style={{ marginBottom: 8 }}>
                  <Typography.Text strong style={{ fontSize: 12 }}>
                    {group.title}
                  </Typography.Text>
                  <ul
                    style={{
                      margin: '2px 0 0',
                      paddingLeft: 18,
                      lineHeight: 1.6,
                    }}
                  >
                    {group.items.map((item) => (
                      <li
                        key={item.key}
                        style={{ opacity: item.included ? 1 : 0.65 }}
                      >
                        <Typography.Text
                          delete={!item.included}
                          strong={item.included}
                          type={item.included ? undefined : 'secondary'}
                        >
                          {item.label}
                        </Typography.Text>
                        {item.excludedHint && (
                          <Typography.Text
                            type="secondary"
                            style={{ marginLeft: 6, fontSize: 12 }}
                          >
                            {item.excludedHint}
                          </Typography.Text>
                        )}
                        {item.note && (
                          <Typography.Text
                            type="secondary"
                            style={{ display: 'block', fontSize: 12 }}
                          >
                            {item.note}
                          </Typography.Text>
                        )}
                        <Typography.Text
                          type="secondary"
                          delete={!item.included}
                          style={{ display: 'block', fontSize: 12 }}
                        >
                          {item.desc}
                        </Typography.Text>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <Typography.Text
                type="secondary"
                style={{ display: 'block', fontSize: 12 }}
              >
                {describeSafeMode(safeMode)}
              </Typography.Text>
            </Form.Item>
          </Form>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            loading={exporting}
            onClick={handleExport}
          >
            导出 ZIP 文件
          </Button>
        </Card>
      </Col>

      <Col xs={24} lg={12}>
        <Card
          title="导入应用"
          extra={
            <Space size={4}>
              <HeaderNotice
                message="导入会写入目标实例数据,不可自动撤销"
                description="建议先预览确认冲突、连接匹配与库表清单,再选择冲突策略执行。连接未匹配时会用目标同类型凭证创建本地连接(不连源库)。物化行数据写在外部数据库,不会随主库回滚。"
                ariaLabel="导入警告"
              />
              <Button size="small" onClick={resetImport}>
                重置
              </Button>
            </Space>
          }
        >
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
              点击或拖拽应用导出的 .zip 文件到此处
            </p>
            <p className="ant-upload-hint">
              支持 format 为 eadaf-app-export 的 zip 包(仍接受旧版单
              .json);平台包请到「EADAF数据导出/导入」页。选择后自动预览,不会写入数据
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
                    label: '应用编码',
                    children: preview.application?.code || '-',
                  },
                  {
                    key: 'name',
                    label: '应用名称',
                    children: preview.application?.name || '-',
                  },
                  {
                    key: 'exists',
                    label: '目标已存在',
                    children: preview.targetApplicationExists
                      ? '是(将按策略覆盖或跳过)'
                      : '否(将新建)',
                  },
                  {
                    key: 'mode',
                    label: '数据模式',
                    children:
                      preview.options?.dataMode === 'data_only'
                        ? '仅数据'
                        : '结构和数据',
                  },
                  {
                    key: 'safeMode',
                    label: '包内安全模式标记',
                    children: preview.options?.safeMode
                      ? '包内标记为开启'
                      : '包内标记为关闭(导入默认仍开启安全模式,可在下方关闭)',
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
              {(preview.connectionMatches?.length || 0) > 0 && (
                <Table
                  size="small"
                  style={{ marginTop: 12 }}
                  pagination={false}
                  rowKey={(r) => r.sourceId || r.name || String(Math.random())}
                  title={() => '数据库连接匹配'}
                  dataSource={preview.connectionMatches}
                  columns={[
                    {
                      title: '源连接',
                      dataIndex: 'name',
                      ellipsis: true,
                      render: (name: string, row) => (
                        <span>
                          {name || '-'}
                          <Typography.Text
                            type="secondary"
                            style={{ display: 'block', fontSize: 12 }}
                          >
                            {[row.dbType, row.targetSchema, row.databaseName]
                              .filter(Boolean)
                              .join(' / ')}
                          </Typography.Text>
                        </span>
                      ),
                    },
                    {
                      title: '状态',
                      width: 100,
                      render: (_, row) => {
                        const key = row.matched
                          ? 'matched'
                          : row.willCreate
                          ? 'willCreate'
                          : 'unmatched';
                        const meta = CONNECTION_STATUS_META[key];
                        return <Tag color={meta.color}>{meta.text}</Tag>;
                      },
                    },
                    {
                      title: '目标',
                      ellipsis: true,
                      render: (_, row) => {
                        if (row.matched) {
                          return row.targetName || row.targetId || '-';
                        }
                        if (row.willCreate) {
                          return `将用「${
                            row.createFromName || '目标同类型连接'
                          }」凭证创建`;
                        }
                        return '无可用凭证模板';
                      },
                    },
                  ]}
                />
              )}
              {(preview.physicalTables?.length || 0) > 0 && (
                <Table
                  size="small"
                  style={{ marginTop: 12 }}
                  pagination={{ pageSize: 8, size: 'small' }}
                  rowKey={(r) =>
                    r.entityCode || r.tableName || String(Math.random())
                  }
                  title={() => '物化库表摘要'}
                  dataSource={preview.physicalTables}
                  columns={[
                    {
                      title: '实体',
                      dataIndex: 'entityCode',
                      ellipsis: true,
                    },
                    {
                      title: '表名',
                      dataIndex: 'tableName',
                      ellipsis: true,
                      render: (v: string) => v || '-',
                    },
                    {
                      title: 'Schema',
                      dataIndex: 'targetSchema',
                      width: 110,
                      render: (v: string) => v || '-',
                    },
                    {
                      title: '列/行',
                      width: 90,
                      render: (_, row) =>
                        row.rowsOmitted
                          ? '已跳过'
                          : `${row.columnCount ?? 0} / ${row.rowCount ?? 0}`,
                    },
                  ]}
                />
              )}
              {conflictCount > 0 && (
                <Alert
                  type="error"
                  showIcon
                  style={{ marginTop: 12 }}
                  message={`发现 ${conflictCount} 处冲突`}
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
                      {(preview.hookMultiMatch || []).map((h, i) => (
                        <li key={`h-${i}`}>
                          钩子「{h.name}」({h.eventType}
                          )在目标有多条同名记录,需人工改名
                        </li>
                      ))}
                    </ul>
                  }
                />
              )}
              {unwritableCount > 0 && (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginTop: 12 }}
                  message={`${unwritableCount} 个实体的行数据不可写`}
                  description={
                    <ul
                      style={{
                        margin: 0,
                        paddingLeft: 18,
                        ...MESSAGE_SCROLL_STYLE,
                      }}
                    >
                      {(preview.entityData || [])
                        .filter((e) => e.writable === false)
                        .map((e, i) => (
                          <li key={i}>
                            {e.entityCode}:{e.reason}
                          </li>
                        ))}
                    </ul>
                  }
                />
              )}
              {(preview.missingReferences?.length || 0) > 0 && (
                <Alert
                  type="info"
                  showIcon
                  style={{ marginTop: 12 }}
                  message={`${preview.missingReferences?.length} 条缺失引用(相应关联导入时会跳过)`}
                  description={
                    <ul
                      style={{
                        margin: 0,
                        paddingLeft: 18,
                        ...MESSAGE_SCROLL_STYLE,
                      }}
                    >
                      {preview.missingReferences?.map((r, i) => (
                        <li key={i}>{r}</li>
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
                    <Space direction="vertical" size={4}>
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
                <Form.Item label="安全模式" style={{ marginBottom: 8 }}>
                  <Space align="start">
                    <Switch
                      size="small"
                      checked={importSafeMode}
                      onChange={setImportSafeMode}
                    />
                    <span>
                      默认开启:覆盖导入把已发布的 API、采集管道、出站 Webhook
                      退回未发布。关闭后保持源端发布状态
                    </span>
                  </Space>
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
              {importResult.chainStoppedAt && (
                <Alert
                  type="error"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message={`依赖链在「${
                    SECTION_LABELS[importResult.chainStoppedAt] ||
                    importResult.chainStoppedAt
                  }」节失败,后续节已终止`}
                  description={
                    <div
                      style={{
                        whiteSpace: 'pre-wrap',
                        ...MESSAGE_SCROLL_STYLE,
                      }}
                    >
                      {importResult.chainError}
                    </div>
                  }
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
                        <Typography.Text
                          type="danger"
                          style={{ cursor: 'pointer' }}
                          onClick={() =>
                            modal.warning({
                              title: `${record.label} 错误明细`,
                              width: 640,
                              content: (
                                <ul
                                  style={{
                                    maxHeight: 360,
                                    overflow: 'auto',
                                    paddingLeft: 18,
                                  }}
                                >
                                  {errors.map((e, i) => (
                                    <li key={i}>{e}</li>
                                  ))}
                                </ul>
                              ),
                            })
                          }
                        >
                          {errors.length} 条(点击查看)
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
                        <Typography.Text
                          type="secondary"
                          style={{ cursor: 'pointer' }}
                          onClick={() =>
                            modal.info({
                              title: `${record.label} 说明`,
                              width: 640,
                              content: (
                                <ul
                                  style={{
                                    maxHeight: 360,
                                    overflow: 'auto',
                                    paddingLeft: 18,
                                  }}
                                >
                                  {notes.map((e, i) => (
                                    <li key={i}>{e}</li>
                                  ))}
                                </ul>
                              ),
                            })
                          }
                        >
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
                总耗时 {((importResult.durationMs || 0) / 1000).toFixed(1)}{' '}
                秒;外部库行数据已提交的部分不会自动回滚。
              </Typography.Text>
            </div>
          )}
        </Card>
      </Col>
    </Row>
  );
};

/**
 * 「应用部署 → 应用数据导出/导入」页。
 * 该功能已从「系统设置」迁到这里（设置里不再展示），路由 /app_deployment/app-data。
 */
const AppDataTransferPage: React.FC = () => (
  <PageContainer title="应用数据导出/导入">
    <AppTransferPanel />
  </PageContainer>
);

export default AppDataTransferPage;
