import {
  getAppDeploymentStatus,
  postAppDirInspect,
  postAppPack,
  postPackJobCancel,
  type AppDeploymentStatus,
  type AppDirInspection,
  type PackJob,
} from '@/services/UAC/api/appDeployment';
import { getApplications } from '@/services/UAC/api/applications';
import { message } from '@/utils/antdAppApis';
import {
  getApiData,
  isApiSuccess,
  parseApiListResponse,
} from '@/utils/apiResponse';
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Spin,
  Steps,
  Tag,
  Typography,
} from 'antd';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PackConsole from '../components/PackConsole';
import PackHistory from '../components/PackHistory';
import {
  ARCH_OPTIONS,
  DEV_MODE_HINT,
  KIND_OPTIONS,
  PATCH_DISABLED_HINT,
  PATCH_OPTIONS,
  aliasProjectPath,
  joinProjectPath,
} from '../components/packOptions';
import { readAppDirMap, rememberAppDir } from '../storage';
import { usePackHistory } from '../usePackHistory';
import { usePackJobStream } from '../usePackJobStream';

const { Text, Paragraph } = Typography;

const SYSTEM_APPLICATION_CODE = 'EADAF';
const OUT_RELATIVE = 'deploy-artifacts/APP';

interface AppOption {
  label: string;
  value: string;
  code?: string;
  name?: string;
}

/**
 * 「应用部署 → 发布应用」：等价 `pnpm pack:app`。
 *
 * 分两步走：① 选应用 + 填项目目录（含 eadaf.app.yaml）并校验，校验通过后按「应用 → 目录」
 * 记进浏览器缓存；② 出现其余打包配置。默认版本取应用仓库 package.json。
 */
const PublishAppPage: React.FC = () => {
  const [form] = Form.useForm();
  const [status, setStatus] = useState<AppDeploymentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [appOptions, setAppOptions] = useState<AppOption[]>([]);
  const [inspecting, setInspecting] = useState(false);
  const [inspection, setInspection] = useState<AppDirInspection | null>(null);
  const [cachedHint, setCachedHint] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const stream = usePackJobStream();
  const history = usePackHistory('app');

  const kind = Form.useWatch('kind', form);
  const applicationId = Form.useWatch('applicationId', form);
  const appDirValue = Form.useWatch('appDir', form);
  const devMode = Boolean(status?.devMode);
  const bashReady = Boolean(status?.bash?.available);
  const running = stream.job?.status === 'running';
  const canSubmit = devMode && bashReady && !running && !submitting;

  const repoRoot = status?.repoRoot || '';
  const defaultOutDir =
    status?.app?.defaultOutDir ||
    (repoRoot ? joinProjectPath(repoRoot, OUT_RELATIVE) : OUT_RELATIVE);
  const outDirExample = aliasProjectPath(defaultOutDir, repoRoot);

  const selectedApp = useMemo(
    () => appOptions.find((item) => item.value === applicationId) || null,
    [appOptions, applicationId],
  );
  // 目录已校验且与表单里的一致，才允许进入第二步
  const dirVerified = Boolean(
    inspection && String(appDirValue || '').trim() === inspection.appDir,
  );

  useEffect(() => {
    if (stream.job && stream.job.status !== 'running')
      history.remember(stream.job);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.job?.id, stream.job?.status]);

  /** 校验项目目录（silent=true 时不弹成功提示） */
  const inspectDir = useCallback(
    async (silent = false): Promise<AppDirInspection | null> => {
      const appDir = String(form.getFieldValue('appDir') || '').trim();
      if (!appDir) {
        if (!silent) message.warning('请先填写项目目录');
        return null;
      }
      setInspecting(true);
      try {
        const response = await postAppDirInspect(appDir);
        if (!isApiSuccess(response)) {
          setInspection(null);
          if (!silent) message.error(response?.message || '项目目录校验失败');
          return null;
        }
        const data = getApiData<AppDirInspection>(response);
        if (!data) {
          setInspection(null);
          if (!silent) message.error('项目目录校验未返回结果');
          return null;
        }
        setInspection(data);
        form.setFieldsValue({
          appDir: data.appDir,
          version: data.appVersion,
          webPort: form.getFieldValue('webPort') || data.webPort || 9527,
          apiPort: form.getFieldValue('apiPort') || data.apiPort || 9526,
        });
        if (!silent) message.success(`校验通过：${data.appName}`);
        return data;
      } catch {
        setInspection(null);
        return null;
      } finally {
        setInspecting(false);
      }
    },
    [form],
  );

  const loadOptions = useCallback(async () => {
    setLoading(true);
    try {
      const statusResponse = await getAppDeploymentStatus();
      if (!isApiSuccess(statusResponse)) {
        message.error(statusResponse?.message || '获取应用部署状态失败');
        return;
      }
      const data = getApiData<AppDeploymentStatus>(statusResponse);
      if (!data) {
        message.error('后端未返回应用部署状态');
        return;
      }
      setStatus(data);
      const outDir =
        data.app?.defaultOutDir || joinProjectPath(data.repoRoot, OUT_RELATIVE);
      form.setFieldsValue({
        arch: 'amd64',
        kind: 'install',
        patch: ['web', 'api'],
        version: '',
        outDir,
      });

      const applicationsResponse = await getApplications({ page: 1, size: -1 });
      const { items } =
        parseApiListResponse<API.Application>(applicationsResponse);
      const options = items
        .filter((item) => item.code !== SYSTEM_APPLICATION_CODE)
        .map((item) => ({
          label: `${item.name}（${item.code}）`,
          value: item.application_id || '',
          code: item.code || undefined,
          name: item.name || undefined,
        }))
        .filter((item) => item.value);
      setAppOptions(options);

      if (data.runningJob) {
        // 只在有任务「正在跑」时接管控制台（当前任务，不是上次的记录）
        stream.setJob(data.runningJob);
        void stream.connect(data.runningJob.id, data.runningJob);
        setStep(1);
      }
      // 已完成的历史任务不回填控制台：刚打开页面时控制台留空，上次产物去「打包历史」看
    } catch {
      message.error('获取应用部署状态失败');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  /** 选应用后，若本机记过该应用的项目目录就自动填上并静默校验 */
  const handleAppChange = useCallback(
    async (value: string) => {
      const app = appOptions.find((item) => item.value === value);
      const map = readAppDirMap();
      const cached =
        map[value] ||
        (app?.code ? map[app.code] : '') ||
        (app?.name ? map[app.name] : '') ||
        '';
      setInspection(null);
      setCachedHint(null);
      if (!cached) return;
      form.setFieldsValue({ appDir: cached });
      setCachedHint(`已按本机记录填入该项目目录：${cached}`);
      // 缓存里的目录可能已改名/被删，这里明确报错，让用户直接看到原因
      await inspectDir(false);
    },
    [appOptions, form, inspectDir],
  );

  const handleNext = async () => {
    try {
      await form.validateFields(['applicationId', 'appDir']);
    } catch {
      return;
    }
    const data = dirVerified ? inspection : await inspectDir(true);
    if (!data) {
      message.error('项目目录校验未通过，请检查目录与 eadaf.app.yaml');
      return;
    }
    // 记住「应用 → 项目目录」，下次选同一个应用自动回填
    rememberAppDir(
      [applicationId, selectedApp?.code, selectedApp?.name],
      data.appDir,
    );
    setStep(1);
  };

  const handleStart = async () => {
    let values: Record<string, unknown>;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    // 提交前再校验一次目录（目录内容可能已变），保证后端拿到的是 eadaf.app.yaml 同级
    const verified = dirVerified ? inspection : await inspectDir(true);
    if (!verified) {
      message.error('项目目录校验未通过，请返回上一步修正');
      setStep(0);
      return;
    }
    setSubmitting(true);
    try {
      const response = await postAppPack({
        appDir: verified.appDir,
        arch: String(values.arch),
        kind: String(values.kind),
        patch: (values.patch as string[]) || [],
        webPort: values.webPort as number,
        apiPort: values.apiPort as number,
        version: String(values.version || verified.appVersion),
        outDir: String(values.outDir || ''),
      });
      if (!isApiSuccess(response)) {
        message.error(response?.message || '启动打包失败');
        return;
      }
      const job = getApiData<PackJob>(response);
      if (!job?.id) {
        message.error('打包任务未返回任务 id');
        return;
      }
      rememberAppDir(
        [applicationId, selectedApp?.code, selectedApp?.name],
        verified.appDir,
      );
      message.success('打包任务已启动，正在输出日志');
      void stream.connect(job.id, job);
    } catch {
      /* 错误提示由 request 拦截器统一弹出 */
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!stream.job) return;
    setCancelling(true);
    try {
      const response = await postPackJobCancel(stream.job.id);
      if (isApiSuccess(response)) message.success('已请求取消');
      else message.error(response?.message || '取消失败');
    } catch {
      /* 已提示 */
    } finally {
      setCancelling(false);
    }
  };

  const appCodeMismatch = Boolean(
    inspection?.applicationCode &&
      selectedApp?.code &&
      inspection.applicationCode !== selectedApp.code,
  );

  return (
    <PageContainer title="发布应用">
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={11}>
          <Card
            title="发布流程"
            extra={<Text type="secondary">pnpm pack:app</Text>}
          >
            {loading ? (
              <Spin />
            ) : (
              <>
                {!devMode && (
                  <Alert
                    type="error"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message="当前不是 DEV 模式，发布应用已停用"
                    description={status?.devModeHint || DEV_MODE_HINT}
                  />
                )}
                {devMode && !bashReady && (
                  <Alert
                    type="error"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message="未检测到可用的 bash，无法执行打包脚本"
                    description={
                      status?.bash?.hint ||
                      '请安装 Git for Windows（含 Git Bash）后重启后端。'
                    }
                  />
                )}

                <Steps
                  size="small"
                  current={step}
                  style={{ marginBottom: 16 }}
                  items={[
                    { title: '选择应用与项目目录' },
                    { title: '打包配置' },
                  ]}
                />

                <Form
                  form={form}
                  layout="vertical"
                  disabled={!devMode}
                  onValuesChange={(changed) => {
                    if (
                      Object.prototype.hasOwnProperty.call(changed, 'appDir')
                    ) {
                      setInspection(null);
                      setCachedHint(null);
                    }
                    // Form.Item 会接管 Select 的 onChange，应用切换在这里处理
                    if (
                      Object.prototype.hasOwnProperty.call(
                        changed,
                        'applicationId',
                      )
                    ) {
                      void handleAppChange(String(changed.applicationId || ''));
                    }
                  }}
                >
                  {/* 两步都保持挂载、只切显隐：Form.Item 卸载会让 useWatch/getFieldValue 取值不稳 */}
                  <div style={{ display: step === 0 ? undefined : 'none' }}>
                    <>
                      <Form.Item
                        name="applicationId"
                        label="选择应用"
                        rules={[
                          { required: true, message: '请选择要发布的应用' },
                        ]}
                        extra="用于记录「应用 → 项目目录」，下次选同一个应用会自动回填"
                      >
                        <Select
                          showSearch
                          optionFilterProp="label"
                          options={appOptions}
                          loading={appOptions.length === 0}
                          placeholder="选择要发布到 EADAF 的业务应用"
                        />
                      </Form.Item>
                      <Form.Item
                        name="appDir"
                        label="项目目录"
                        rules={[{ required: true, message: '请填写项目目录' }]}
                        extra={`应用仓库根目录，目录下必须有 ${
                          status?.app?.manifestFileName || 'eadaf.app.yaml'
                        }`}
                      >
                        <Input.Search
                          placeholder="/srv/repos/fpcu2"
                          enterButton="校验"
                          loading={inspecting}
                          onSearch={() => void inspectDir()}
                        />
                      </Form.Item>

                      {cachedHint && (
                        <Alert
                          type="info"
                          showIcon
                          closable
                          style={{ marginBottom: 16 }}
                          message="已回填上次的目录"
                          description={cachedHint}
                          onClose={() => setCachedHint(null)}
                        />
                      )}

                      {inspection && (
                        <Descriptions
                          size="small"
                          column={1}
                          style={{ marginBottom: 16 }}
                          title={
                            <Space size={6}>
                              <CheckCircleOutlined
                                style={{ color: '#52c41a' }}
                              />
                              <span>目录校验通过</span>
                            </Space>
                          }
                        >
                          <Descriptions.Item label="应用包">
                            {inspection.appName}
                            {inspection.applicationCode
                              ? `（${inspection.applicationCode}）`
                              : ''}
                          </Descriptions.Item>
                          <Descriptions.Item label="preset">
                            {inspection.preset || '无'}
                          </Descriptions.Item>
                          <Descriptions.Item label="版本">
                            {inspection.appVersion}
                            <Text type="secondary">
                              （{inspection.versionSource}）
                            </Text>
                          </Descriptions.Item>
                          <Descriptions.Item label="项目目录">
                            <Text code>{inspection.appDir}</Text>
                          </Descriptions.Item>
                        </Descriptions>
                      )}

                      {appCodeMismatch && (
                        <Alert
                          type="warning"
                          showIcon
                          style={{ marginBottom: 16 }}
                          message="应用编码与目录里的 eadaf.app.yaml 不一致"
                          description={`所选应用是 ${selectedApp?.code}，目录里写的是 ${inspection?.applicationCode}；确认无误再继续。`}
                        />
                      )}

                      <Button
                        type="primary"
                        icon={<ArrowRightOutlined />}
                        loading={inspecting}
                        disabled={!devMode || !dirVerified}
                        onClick={handleNext}
                      >
                        下一步
                      </Button>
                      {!dirVerified && (
                        <Text type="secondary" style={{ marginLeft: 12 }}>
                          先选应用、填项目目录并校验通过
                        </Text>
                      )}
                    </>
                  </div>
                  <div style={{ display: step === 1 ? undefined : 'none' }}>
                    <>
                      <Descriptions
                        size="small"
                        column={1}
                        style={{ marginBottom: 12 }}
                      >
                        <Descriptions.Item label="应用">
                          {selectedApp ? (
                            <Space size={6}>
                              <span>{selectedApp.name}</span>
                              <Tag>{selectedApp.code}</Tag>
                            </Space>
                          ) : (
                            '-'
                          )}
                        </Descriptions.Item>
                        <Descriptions.Item label="项目目录">
                          <Text code>{inspection?.appDir || appDirValue}</Text>
                        </Descriptions.Item>
                        <Descriptions.Item label="包版本">
                          {inspection?.appVersion || '-'}
                          <Text type="secondary">
                            （{inspection?.versionSource || '应用 package.json'}
                            ）
                          </Text>
                        </Descriptions.Item>
                      </Descriptions>

                      <Row gutter={12}>
                        <Col span={12}>
                          <Form.Item
                            name="kind"
                            label="种类"
                            rules={[{ required: true }]}
                          >
                            <Select options={KIND_OPTIONS} />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item
                            name="arch"
                            label="CPU 架构"
                            rules={[{ required: true }]}
                          >
                            <Select options={ARCH_OPTIONS} />
                          </Form.Item>
                        </Col>
                        {kind === 'patch' && (
                          <Col span={24}>
                            <Form.Item
                              name="patch"
                              label="补丁种类"
                              rules={[
                                { required: true, message: '请选择补丁种类' },
                              ]}
                              extra={PATCH_DISABLED_HINT}
                            >
                              <Select mode="multiple" options={PATCH_OPTIONS} />
                            </Form.Item>
                          </Col>
                        )}
                        {kind === 'install' && (
                          <>
                            <Col span={12}>
                              <Form.Item
                                name="webPort"
                                label="应用前端端口"
                                rules={[{ required: true }]}
                              >
                                <InputNumber
                                  min={1}
                                  max={65535}
                                  style={{ width: '100%' }}
                                />
                              </Form.Item>
                            </Col>
                            <Col span={12}>
                              <Form.Item
                                name="apiPort"
                                label="应用后端端口"
                                rules={[{ required: true }]}
                              >
                                <InputNumber
                                  min={1}
                                  max={65535}
                                  style={{ width: '100%' }}
                                />
                              </Form.Item>
                            </Col>
                          </>
                        )}
                        <Col span={24}>
                          <Form.Item
                            name="version"
                            label="版本"
                            rules={[
                              { required: true, message: '请填写版本' },
                              {
                                pattern: /^[A-Za-z0-9][A-Za-z0-9._+-]*$/,
                                message: '只能包含字母、数字与 . _ + -',
                              },
                            ]}
                            extra="默认取应用仓库 package.json 的 version（eadaf.app.yaml 的 version 仅作回退）"
                          >
                            <Input placeholder="1.0.0" />
                          </Form.Item>
                        </Col>
                        <Col span={24}>
                          <Form.Item
                            name="outDir"
                            label="目标目录"
                            rules={[
                              { required: true, message: '请填写目标目录' },
                            ]}
                            extra={`默认按项目地址拼出：${outDirExample}`}
                          >
                            <Input placeholder={outDirExample} />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Space>
                        <Button
                          icon={<ArrowLeftOutlined />}
                          disabled={running || submitting}
                          onClick={() => setStep(0)}
                        >
                          上一步
                        </Button>
                        <Button
                          type="primary"
                          className="btn-gradient-primary"
                          icon={<PlayCircleOutlined />}
                          loading={submitting}
                          disabled={!canSubmit}
                          onClick={handleStart}
                        >
                          开始打包
                        </Button>
                        <Text type="secondary">
                          {running
                            ? '已有打包任务在运行'
                            : '会真实执行 docker 构建，请确认本机 Docker 已启动'}
                        </Text>
                      </Space>
                    </>
                  </div>
                </Form>

                <Paragraph
                  type="secondary"
                  style={{ marginTop: 12, marginBottom: 0 }}
                >
                  提示：应用包只含程序镜像与注册
                  SQL；应用的配置、模型与业务数据请用 「应用数据导出/导入」。
                </Paragraph>
              </>
            )}
          </Card>
        </Col>
        <Col xs={24} xl={13}>
          <PackConsole
            title="发布应用控制台"
            doneTitle="应用包打包完成"
            job={stream.job}
            lines={stream.lines}
            streaming={stream.streaming}
            streamError={stream.streamError}
            cancelling={cancelling}
            onCancel={handleCancel}
            emptyHint={
              <Text type="secondary">
                选应用、填项目目录并校验通过后，第二步点「开始打包」；这里会实时显示
                pnpm pack:app 的输出，结束后给出 tar.gz 的目标目录。
              </Text>
            }
          />
          <PackHistory
            title="发布应用 · 打包历史"
            records={history.records}
            onClear={history.clear}
            onRemove={history.remove}
          />
        </Col>
      </Row>
    </PageContainer>
  );
};

export default PublishAppPage;
