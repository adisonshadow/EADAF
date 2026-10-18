import {
  getAppDeploymentStatus,
  postPackJobCancel,
  postPlatformPack,
  type AppDeploymentStatus,
  type PackJob,
} from '@/services/EADAF/api/appDeployment';
import { message } from '@/utils/antdAppApis';
import { getApiData, isApiSuccess } from '@/utils/apiResponse';
import { PlayCircleOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Spin,
  Typography,
} from 'antd';
import React, { useCallback, useEffect, useState } from 'react';
import HeaderNotice from '../components/HeaderNotice';
import PackConsole from '../components/PackConsole';
import PackHistory from '../components/PackHistory';
import {
  ARCH_OPTIONS,
  DEV_MODE_HINT,
  KIND_OPTIONS,
  NETWORK_OPTIONS,
  OS_OPTIONS,
  PATCH_DISABLED_HINT,
  PATCH_OPTIONS,
  RUNTIME_OPTIONS,
  aliasProjectPath,
  joinProjectPath,
} from '../components/packOptions';
import { usePackHistory } from '../usePackHistory';
import { usePackJobStream } from '../usePackJobStream';

const { Text, Paragraph } = Typography;

const OUT_RELATIVE = 'deploy-artifacts/EADAF';

/**
 * 「应用部署 → 发布平台」：等价 `pnpm pack:eadaf`，在 DEV 模式的开发机上真实执行，
 * 输出实时日志，结束后给出打包产物的目标目录与文件；历史记录存在本机浏览器。
 */
const PublishPlatformPage: React.FC = () => {
  const [form] = Form.useForm();
  const [status, setStatus] = useState<AppDeploymentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const stream = usePackJobStream();
  const history = usePackHistory('platform');

  const kind = Form.useWatch('kind', form);
  const devMode = Boolean(status?.devMode);
  const bashReady = Boolean(status?.bash?.available);
  const running = stream.job?.status === 'running';
  const canSubmit = devMode && bashReady && !running && !submitting;

  const repoRoot = status?.repoRoot || '';
  // 目标目录默认用项目地址拼出来（后端也会给 defaultOutDir，二者一致时以后端为准）
  const defaultOutDir =
    status?.platform?.defaultOutDir ||
    (repoRoot ? joinProjectPath(repoRoot, OUT_RELATIVE) : OUT_RELATIVE);
  const outDirExample = aliasProjectPath(defaultOutDir, repoRoot);

  // 任务结束后落一条历史（同一 jobId 幂等）
  useEffect(() => {
    if (stream.job && stream.job.status !== 'running')
      history.remember(stream.job);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.job?.id, stream.job?.status]);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getAppDeploymentStatus();
      if (!isApiSuccess(response)) {
        message.error(response?.message || '获取应用部署状态失败');
        return;
      }
      const data = getApiData<AppDeploymentStatus>(response);
      if (!data) {
        message.error('后端未返回应用部署状态');
        return;
      }
      setStatus(data);
      const outDir =
        data.platform?.defaultOutDir ||
        joinProjectPath(data.repoRoot, OUT_RELATIVE);
      form.setFieldsValue({
        network: 'offline',
        runtime: 'compose',
        os: 'centos',
        arch: 'amd64',
        kind: 'install',
        patch: ['web', 'api'],
        webPort: data.platform?.defaultWebPort ?? 9527,
        apiPort: data.platform?.defaultApiPort ?? 9526,
        version: data.platform?.version || '',
        outDir,
      });
      if (data.runningJob) {
        // 只在有任务「正在跑」时接管控制台（这是当前任务，不是上次的记录）
        stream.setJob(data.runningJob);
        void stream.connect(data.runningJob.id, data.runningJob);
      }
      // 已完成的历史任务不再回填控制台：刚打开页面时控制台留空，
      // 上次的产物目录去下方「打包历史」看，避免被当成本次结果。
    } catch {
      message.error('获取应用部署状态失败');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleStart = async () => {
    let values: Record<string, unknown>;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSubmitting(true);
    try {
      const response = await postPlatformPack({
        network: String(values.network),
        runtime: String(values.runtime),
        os: String(values.os),
        arch: String(values.arch),
        kind: String(values.kind),
        patch: (values.patch as string[]) || [],
        webPort: values.webPort as number,
        apiPort: values.apiPort as number,
        version: String(values.version || ''),
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

  return (
    <PageContainer title="发布平台">
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={10}>
          <Card
            title="打包参数"
            extra={
              <Space size={8}>
                <Text type="secondary">pnpm pack:eadaf</Text>
                {devMode && bashReady && (
                  <HeaderNotice
                    type="info"
                    message="DEV 模式"
                    ariaLabel="DEV 模式说明"
                    description={
                      <Space direction="vertical" size={2}>
                        <span>
                          项目目录：<Text code>/srv/EADAF</Text>
                        </span>
                        <span>
                          平台版本：{status?.platform?.version || '未取到'}
                          （取自仓库根 package.json）
                        </span>
                        <span>
                          bash：<Text code>/bin/bash</Text>
                          ；pnpm：<Text code>/usr/local/bin/pnpm</Text>
                        </span>
                      </Space>
                    }
                  />
                )}
              </Space>
            }
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
                    message="当前不是 DEV 模式，发布平台已停用"
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
                <Form form={form} layout="vertical" disabled={!devMode}>
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
                    <Col span={12}>
                      <Form.Item
                        name="network"
                        label="网络"
                        rules={[{ required: true }]}
                      >
                        <Select options={NETWORK_OPTIONS} />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        name="runtime"
                        label="运行方式"
                        rules={[{ required: true }]}
                      >
                        <Select options={RUNTIME_OPTIONS} />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        name="os"
                        label="默认发行版"
                        rules={[{ required: true }]}
                      >
                        <Select options={OS_OPTIONS} />
                      </Form.Item>
                    </Col>
                    {kind === 'install' && (
                      <>
                        <Col span={6}>
                          <Form.Item
                            name="webPort"
                            label="前端端口"
                            rules={[{ required: true }]}
                          >
                            <InputNumber
                              min={1}
                              max={65535}
                              style={{ width: '100%' }}
                            />
                          </Form.Item>
                        </Col>
                        <Col span={6}>
                          <Form.Item
                            name="apiPort"
                            label="后端端口"
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
                        extra={`默认取仓库根 package.json 的 version（${
                          status?.platform?.version || '-'
                        }）`}
                      >
                        <Input placeholder="1.2.6" />
                      </Form.Item>
                    </Col>
                    <Col span={24}>
                      <Form.Item
                        name="outDir"
                        label="目标目录"
                        rules={[{ required: true, message: '请填写目标目录' }]}
                        extra={`默认按项目地址拼出：${outDirExample}`}
                      >
                        <Input placeholder={outDirExample} />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Space>
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
                </Form>
                <Paragraph
                  type="secondary"
                  style={{ marginTop: 12, marginBottom: 0 }}
                >
                  提示：打包与「应用数据导出/导入」互补——程序镜像走这里，配置与业务数据走
                  「应用数据导出/导入」。
                </Paragraph>
              </>
            )}
          </Card>
        </Col>
        <Col xs={24} xl={14}>
          <PackConsole
            title="发布平台控制台"
            doneTitle="平台包打包完成"
            job={stream.job}
            lines={stream.lines}
            streaming={stream.streaming}
            streamError={stream.streamError}
            cancelling={cancelling}
            onCancel={handleCancel}
            emptyHint={
              <Text type="secondary">
                尚未开始打包。点击「开始打包」后这里会实时显示 pnpm pack:eadaf
                的输出， 结束后给出 tar.gz 的目标目录。
              </Text>
            }
          />
          <PackHistory
            title="发布平台 · 打包历史"
            records={history.records}
            onClear={history.clear}
            onRemove={history.remove}
          />
        </Col>
      </Row>
    </PageContainer>
  );
};

export default PublishPlatformPage;
