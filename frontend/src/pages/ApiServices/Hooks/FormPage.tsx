import { useAISurface, useChatReference, sendMockUserMessage } from '@eadaf/ai-base';
import { CheckCircleOutlined, RobotOutlined, SaveOutlined, SafetyOutlined } from '@ant-design/icons';
import Editor from '@monaco-editor/react';
import FixHeaderPage from '@/components/FixHeaderPage';
import PageContainerTitleWithBack from '@/components/PageContainerTitleWithBack';
import {
  getAutomationHook,
  getAutomationHookEventTypes,
  getAutomationHookRuns,
  postAutomationHook,
  postAutomationHookTest,
  postAutomationHookValidateScript,
  putAutomationHook,
} from '@/services/EADAF/api/automationHooks';
import { getApiServices } from '@/services/EADAF/api/apiServices';
import { getBusinessDataEntities } from '@/services/EADAF/api/businessData';
import { getApiData, getApiErrorMessage, isApiSuccess } from '@/utils/apiResponse';
import { message } from '@/utils/antdAppApis';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Radio,
  Row,
  Select,
  Space,
  Spin,
  Tag,
} from 'antd';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import HookSectionNav from './HookSectionNav';
import { renderHookRunStatus } from './schema';
import { buildHookGeneratePrompt, buildHookTestAutoFixPrompt } from './ai/buildHookPrompts';
import './hooksForm.css';

const MONACO_OPTIONS = { minimap: { enabled: false }, fontSize: 13, wordWrap: 'on' as const };

type FormValues = {
  name: string;
  description?: string;
  eventType: string;
  entityCodes?: string[];
  apiServiceIds?: string[];
  changedFields?: string[];
  invokeStatus?: string[];
  cron?: string;
  conditionExpr?: string;
  actionType: 'http_request' | 'internal_api' | 'script';
  method?: 'POST' | 'PUT' | 'PATCH';
  url?: string;
  headersJson?: string;
  bodyTemplateJson?: string;
  transformScript?: string;
  authType?: 'none' | 'bearer' | 'api_key';
  authKeyName?: string;
  authSendMode?: 'header' | 'query';
  authSecret?: string;
  responseConfigJson?: string;
  apiServiceId?: string;
  operation?: string;
  parametersTemplateJson?: string;
  source?: string;
  retry?: number;
  disableThreshold?: number;
  concurrency?: number;
  timeoutMs?: number;
};

function parseJsonObject(text: string | undefined, label: string): Record<string, unknown> | null {
  if (!text || !text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    throw new Error('须为 JSON 对象');
  } catch (e) {
    throw new Error(`${label} 不是合法的 JSON 对象：${(e as Error).message}`);
  }
}

const HookFormPage: React.FC<{ mode: 'create' | 'edit' }> = ({ mode }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [form] = Form.useForm<FormValues>();
  const isEdit = mode === 'edit' && Boolean(id);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [catalog, setCatalog] = useState<API.HookEventType[]>([]);
  const [entities, setEntities] = useState<{ label: string; value: string }[]>([]);
  const [apiServices, setApiServices] = useState<{ label: string; value: string }[]>([]);
  const [secretSet, setSecretSet] = useState(false);
  const [secretMasked, setSecretMasked] = useState<string | null>(null);
  const [scriptCheck, setScriptCheck] = useState<{ ok: boolean; diagnostics: API.HookScriptDiagnostic[] } | null>(null);
  const [testResult, setTestResult] = useState<API.HookTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [mockPayload, setMockPayload] = useState('{}');
  const [recentRuns, setRecentRuns] = useState<API.HookRun[]>([]);
  const [sourceRunId, setSourceRunId] = useState<string | undefined>(undefined);

  const eventType = Form.useWatch('eventType', form) || '';
  const actionType = Form.useWatch('actionType', form) || 'script';
  const authType = Form.useWatch('authType', form) || 'none';
  const formValuesRef = useRef<FormValues | null>(null);

  const selectedEvent = useMemo(() => catalog.find((e) => e.type === eventType), [catalog, eventType]);

  useEffect(() => {
    getAutomationHookEventTypes().then((res) => {
      if (isApiSuccess(res)) setCatalog(res.data || []);
    });
    getBusinessDataEntities({ size: 500, summary: true }).then((res) => {
      if (isApiSuccess(res)) {
        setEntities(
          (getApiData<API.BusinessDataEntityList>(res)?.items || []).flatMap((e) =>
            e.code ? [{ label: `${e.label}（${e.code}）`, value: e.code }] : [],
          ),
        );
      }
    });
    getApiServices({ size: 500, status: 'published' }).then((res) => {
      if (isApiSuccess(res)) {
        setApiServices(
          (getApiData<API.ApiServiceListResult>(res)?.items || []).flatMap((s) =>
            s.id ? [{ label: `${s.name || s.code}（${s.code}）`, value: s.id }] : [],
          ),
        );
      }
    });
  }, []);

  useEffect(() => {
    if (!isEdit || !id) return;
    getAutomationHook(id).then((res) => {
      if (!isApiSuccess(res)) {
        message.error(getApiErrorMessage(res, '钩子加载失败'));
        return;
      }
      const hook = getApiData<API.Hook>(res);
      if (!hook) {
        message.error('钩子加载失败');
        return;
      }
      const cfg = hook.actionConfig || {};
      setSecretSet(Boolean(cfg.auth?.secretSet));
      setSecretMasked(cfg.auth?.secretMasked || null);
      form.setFieldsValue({
        name: hook.name,
        description: hook.description || undefined,
        eventType: hook.eventType,
        entityCodes: hook.eventFilter?.entityCodes,
        apiServiceIds: hook.eventFilter?.apiServiceIds,
        changedFields: hook.eventFilter?.changedFields,
        invokeStatus: hook.eventFilter?.invokeStatus,
        cron: hook.eventFilter?.cron,
        conditionExpr: hook.conditionExpr || undefined,
        actionType: hook.actionType,
        method: cfg.method,
        url: cfg.url,
        headersJson: cfg.headers ? JSON.stringify(cfg.headers, null, 2) : undefined,
        bodyTemplateJson: cfg.bodyTemplate != null ? JSON.stringify(cfg.bodyTemplate, null, 2) : undefined,
        transformScript: cfg.transformScript,
        authType: cfg.auth?.type || 'none',
        authKeyName: cfg.auth?.keyName,
        authSendMode: cfg.auth?.sendMode,
        responseConfigJson: cfg.responseConfig ? JSON.stringify(cfg.responseConfig, null, 2) : undefined,
        apiServiceId: cfg.apiServiceId,
        operation: cfg.operation,
        parametersTemplateJson:
          cfg.parametersTemplate != null ? JSON.stringify(cfg.parametersTemplate, null, 2) : undefined,
        source: cfg.source,
        retry: hook.failurePolicy?.retry,
        disableThreshold: hook.failurePolicy?.disableThreshold,
        concurrency: hook.failurePolicy?.concurrency,
        timeoutMs: hook.failurePolicy?.timeoutMs,
      });
      setLoading(false);
    });
    getAutomationHookRuns(id, { size: 20 }).then((res) => {
      if (isApiSuccess(res)) setRecentRuns(getApiData<API.HookRunListResult>(res)?.items || []);
    });
  }, [isEdit, id, form]);

  useAISurface({
    id: isEdit ? `apiservice.hook.edit:${id}` : 'apiservice.hook.create',
    domain: 'apiservice',
    label: isEdit ? '编辑钩子' : '创建钩子',
    read: () => ({ form: form.getFieldsValue(), catalog, apiServices: apiServices.slice(0, 50) }),
    applyMutation: (m) => {
      if (String(m.type) === 'hook.draft') {
        const payload = m.payload as Partial<FormValues> | undefined;
        if (payload) form.setFieldsValue(payload as FormValues);
      }
    },
    matchMutation: (m) => String(m.type || '').startsWith('hook.'),
  });

  const buildSaveInput = (values: FormValues): API.HookSaveInput => {
    const eventFilter: API.HookEventFilter = {};
    if (values.entityCodes?.length) eventFilter.entityCodes = values.entityCodes;
    if (values.apiServiceIds?.length) eventFilter.apiServiceIds = values.apiServiceIds;
    if (values.changedFields?.length) eventFilter.changedFields = values.changedFields;
    if (values.invokeStatus?.length) eventFilter.invokeStatus = values.invokeStatus;
    if (values.cron) eventFilter.cron = values.cron;

    const actionConfig: API.HookActionConfig = {};
    if (values.actionType === 'http_request') {
      actionConfig.method = values.method || 'POST';
      actionConfig.url = values.url;
      const headers = parseJsonObject(values.headersJson, 'Header');
      const bodyTemplate = parseJsonObject(values.bodyTemplateJson, 'Body 模板');
      const responseConfig = parseJsonObject(values.responseConfigJson, '响应判定配置');
      if (headers && Object.keys(headers).length) actionConfig.headers = headers as Record<string, string>;
      if (bodyTemplate) actionConfig.bodyTemplate = bodyTemplate;
      if (values.transformScript?.trim()) actionConfig.transformScript = values.transformScript;
      if (responseConfig && Object.keys(responseConfig).length) actionConfig.responseConfig = responseConfig;
      if (values.timeoutMs) actionConfig.timeoutMs = values.timeoutMs;
      actionConfig.auth = {
        type: values.authType || 'none',
        keyName: values.authKeyName,
        sendMode: values.authSendMode,
        ...(values.authSecret ? { secret: values.authSecret } : {}),
      };
    } else if (values.actionType === 'internal_api') {
      actionConfig.apiServiceId = values.apiServiceId;
      if (values.operation?.trim()) actionConfig.operation = values.operation;
      const parametersTemplate = parseJsonObject(values.parametersTemplateJson, '参数模板');
      if (parametersTemplate && Object.keys(parametersTemplate).length) {
        actionConfig.parametersTemplate = parametersTemplate;
      }
    } else {
      actionConfig.source = values.source || '';
    }

    return {
      name: values.name,
      description: values.description || null,
      eventType: values.eventType,
      eventFilter,
      conditionExpr: values.conditionExpr?.trim() || null,
      actionType: values.actionType,
      actionConfig,
      failurePolicy: {
        ...(values.retry != null ? { retry: values.retry } : {}),
        ...(values.disableThreshold != null ? { disableThreshold: values.disableThreshold } : {}),
        ...(values.concurrency != null ? { concurrency: values.concurrency } : {}),
        ...(values.timeoutMs != null ? { timeoutMs: values.timeoutMs } : {}),
      },
      status: 'draft',
    };
  };

  const { addReference } = useChatReference();

  const handleAiGenerate = () => {
    const values = form.getFieldsValue();
    const requirement = [
      values.name && `钩子名称：${values.name}`,
      values.eventType && `事件：${values.eventType}`,
      values.entityCodes?.length && `限定实体：${values.entityCodes.join(', ')}`,
      values.url && `外呼地址：${values.url}`,
      values.apiServiceId && `内部 API 服务 id：${values.apiServiceId}`,
      values.description,
    ]
      .filter(Boolean)
      .join('；');
    addReference({
      type: 'hook',
      label: '钩子配置',
      content: values.name || '新钩子',
      unique: true,
    });
    sendMockUserMessage(buildHookGeneratePrompt({ requirement, hookId: id }));
  };

  const handleAiFixTest = () => {
    if (!testResult?.run) return;
    sendMockUserMessage(
      buildHookTestAutoFixPrompt({
        hookId: id || '',
        hookName: form.getFieldValue('name'),
        runStatus: testResult.run.status,
        error: testResult.run.error,
        logs: testResult.run.logs,
        output: testResult.run.output,
      }),
    );
  };

  const handleSave = async () => {
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    formValuesRef.current = values;
    let input: API.HookSaveInput;
    try {
      input = buildSaveInput(values);
    } catch (e) {
      message.error((e as Error).message);
      return;
    }
    setSaving(true);
    try {
      const res = isEdit && id ? await putAutomationHook(id, input) : await postAutomationHook(input);
      if (!isApiSuccess(res)) {
        message.error(getApiErrorMessage(res, '保存失败'));
        return;
      }
      message.success('已保存（草稿）。在列表页启用后生效。');
      form.setFieldValue('authSecret', undefined);
      if (!isEdit) {
        const created = getApiData<API.Hook>(res);
        navigate(`/api_services/hooks/${created?.id}/edit`, { replace: true });
      }
    } catch (error) {
      message.error(getApiErrorMessage(error, '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleCheckScript = async () => {
    const source = form.getFieldValue('source') as string | undefined;
    if (!source?.trim()) {
      message.warning('请先填写脚本');
      return;
    }
    const res = await postAutomationHookValidateScript({ source });
    if (isApiSuccess(res)) {
      setScriptCheck(res.data);
      if (res.data.ok) message.success('类型检查通过');
      else message.warning(`检查未通过：${res.data.diagnostics?.[0]?.message || '见诊断'}`);
    }
  };

  const handleTest = async () => {
    if (!id) {
      message.warning('请先保存钩子再测试');
      return;
    }
    let mock: object | undefined;
    if (!sourceRunId) {
      try {
        mock = mockPayload.trim() ? JSON.parse(mockPayload) : {};
        if (!mock || typeof mock !== 'object' || Array.isArray(mock)) throw new Error('须为 JSON 对象');
      } catch (e) {
        message.error(`Mock 负载不合法：${(e as Error).message}`);
        return;
      }
    }
    setTesting(true);
    try {
      const res = await postAutomationHookTest(id, sourceRunId ? { sourceRunId } : { mockPayload: mock });
      if (isApiSuccess(res)) {
        setTestResult(res.data);
        const run = res.data.run;
        if (run) {
          setRecentRuns((prev) => [run, ...prev.filter((r) => r.id !== run.id)].slice(0, 20));
        }
        message.info(
          res.data.conditionMatched === false
            ? `条件不匹配，未执行：${res.data.reason || ''}`
            : `测试完成：${run?.status || '-'}`,
        );
      } else {
        message.error(getApiErrorMessage(res, '测试失败'));
      }
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin />
      </div>
    );
  }

  return (
    <FixHeaderPage
      title={
        <PageContainerTitleWithBack
          title={isEdit ? '编辑钩子' : '新建钩子'}
          backTo="/api_services/hooks"
        />
      }
      subTitle="当事件发生且条件满足时，自动执行动作"
      centerSlot={<HookSectionNav />}
      extra={
        <Space>
          <Button className="ai-btn" icon={<RobotOutlined />} onClick={handleAiGenerate}>
            AI 编写
          </Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void handleSave()}>
            保存
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical" className="hook-form" onValuesChange={(_, v) => { formValuesRef.current = v; }}>
        <section id="hook-section-info" className="hook-form__section">
          <h3 className="hook-form__section-title">基础信息</h3>
          <Card>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
                  <Input placeholder="如：订单金额超限通知" maxLength={200} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="description" label="描述">
                  <Input placeholder="可选" maxLength={500} />
                </Form.Item>
              </Col>
            </Row>
          </Card>
        </section>

        <section id="hook-section-trigger" className="hook-form__section">
          <h3 className="hook-form__section-title">触发</h3>
          <Card>
            <Form.Item
              name="eventType"
              label="事件类型"
              rules={[{ required: true, message: '请选择事件' }]}
              extra={selectedEvent?.description}
            >
              <Select
                placeholder="选择当什么发生时触发"
                options={catalog.map((e) => ({ label: `${e.label}（${e.type}）`, value: e.type }))}
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>

            {eventType.startsWith('bizdata.record.') ? (
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="entityCodes"
                    label="限定实体（不选 = 全部实体）"
                    extra="仅所选实体的记录变更会触发"
                  >
                    <Select mode="multiple" allowClear placeholder="全部实体" options={entities} showSearch optionFilterProp="label" />
                  </Form.Item>
                </Col>
                {eventType === 'bizdata.record.updated' ? (
                  <Col span={12}>
                    <Form.Item
                      name="changedFields"
                      label="限定变更字段（不选 = 任意字段）"
                      extra="仅当所选字段发生变化时触发；格式为实体字段 key"
                    >
                      <Select mode="tags" allowClear placeholder="如 amount、status" />
                    </Form.Item>
                  </Col>
                ) : null}
              </Row>
            ) : null}

            {eventType === 'apiservice.invoked' ? (
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="apiServiceIds" label="限定 API 服务（不选 = 全部）">
                    <Select mode="multiple" allowClear placeholder="全部服务" options={apiServices} showSearch optionFilterProp="label" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="invokeStatus" label="限定调用结果（不选 = 全部）">
                    <Select
                      mode="multiple"
                      allowClear
                      placeholder="全部"
                      options={[
                        { label: '成功', value: 'success' },
                        { label: '失败', value: 'failed' },
                        { label: '不可执行', value: 'skipped' },
                      ]}
                    />
                  </Form.Item>
                </Col>
              </Row>
            ) : null}

            {eventType === 'schedule.cron' ? (
              <Form.Item
                name="cron"
                label="Cron 表达式（服务器时区）"
                rules={[{ required: true, message: '请输入 cron 表达式' }]}
                extra="五段式，如：0 8 * * * 表示每天 8 点；*/5 * * * * 表示每 5 分钟"
              >
                <Input placeholder="0 8 * * *" />
              </Form.Item>
            ) : null}

            <Form.Item
              name="conditionExpr"
              label="条件表达式（可选，进阶）"
              extra="JS 布尔表达式，绑定 payload 变量。例：payload.after.amount > 10000。写错会导致永不触发，建议配合下方测试验证"
            >
              <Input.TextArea rows={2} placeholder="payload.after.amount > 10000" />
            </Form.Item>

            {selectedEvent ? (
              <Form.Item label="事件负载数据结构（动作模板/脚本中可用 payload.* 引用）">
                <div className="hook-form__payload-example">
                  <pre>{JSON.stringify(selectedEvent.example, null, 2)}</pre>
                </div>
              </Form.Item>
            ) : null}
          </Card>
        </section>

        <section id="hook-section-action" className="hook-form__section">
          <h3 className="hook-form__section-title">动作</h3>
          <Card>
            <Form.Item name="actionType" label="动作类型" rules={[{ required: true }]} initialValue="script">
              <Radio.Group
                options={[
                  { label: '调用外部 API', value: 'http_request' },
                  { label: '调用内部 API 服务', value: 'internal_api' },
                  { label: '执行 TypeScript 脚本', value: 'script' },
                ]}
                optionType="button"
              />
            </Form.Item>

            {actionType === 'http_request' ? (
              <>
                <Row gutter={16}>
                  <Col span={4}>
                    <Form.Item name="method" label="Method" initialValue="POST">
                      <Select options={['POST', 'PUT', 'PATCH'].map((m) => ({ label: m, value: m }))} />
                    </Form.Item>
                  </Col>
                  <Col span={20}>
                    <Form.Item
                      name="url"
                      label="目标 URL"
                      rules={[{ required: true, message: '请输入 URL' }]}
                      extra="支持 {{payload.xxx}} 插值；内网/回环地址会被 SSRF 防护拦截"
                    >
                      <Input placeholder="https://example.com/api/notify" />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item name="bodyTemplateJson" label="Body 模板（JSON，支持 {{payload.*}} 插值）">
                  <Editor height="160px" language="json" theme="vs" options={MONACO_OPTIONS} />
                </Form.Item>
                <Row gutter={16}>
                  <Col span={6}>
                    <Form.Item name="authType" label="鉴权方式" initialValue="none">
                      <Select
                        options={[
                          { label: '无', value: 'none' },
                          { label: 'Bearer Token', value: 'bearer' },
                          { label: 'API Key', value: 'api_key' },
                        ]}
                      />
                    </Form.Item>
                  </Col>
                  {authType !== 'none' ? (
                    <>
                      <Col span={6}>
                        <Form.Item name="authKeyName" label="密钥名称" initialValue={authType === 'bearer' ? 'Authorization' : undefined}>
                          <Input placeholder={authType === 'bearer' ? 'Authorization' : 'X-API-Key'} />
                        </Form.Item>
                      </Col>
                      {authType === 'api_key' ? (
                        <Col span={5}>
                          <Form.Item name="authSendMode" label="发送方式" initialValue="header">
                            <Select
                              options={[
                                { label: 'Header', value: 'header' },
                                { label: 'Query', value: 'query' },
                              ]}
                            />
                          </Form.Item>
                        </Col>
                      ) : null}
                      <Col span={7}>
                        <Form.Item
                          name="authSecret"
                          label="密钥"
                          extra={secretSet ? `已缓存：${secretMasked || '****'}（留空保留，填写覆盖）` : '尚未缓存密钥'}
                        >
                          <Input.Password placeholder={secretSet ? '留空保留原密钥' : '输入密钥'} autoComplete="new-password" />
                        </Form.Item>
                      </Col>
                    </>
                  ) : null}
                </Row>
                <Form.Item
                  name="transformScript"
                  label="Body 变换脚本（可选，进阶）"
                  extra="签名 transform(data, ctx)，返回最终请求体；一般用 Body 模板即可"
                >
                  <Editor height="140px" language="typescript" theme="vs" options={MONACO_OPTIONS} />
                </Form.Item>
              </>
            ) : null}

            {actionType === 'internal_api' ? (
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="apiServiceId"
                    label="已发布 API 服务"
                    rules={[{ required: true, message: '请选择服务' }]}
                  >
                    <Select placeholder="选择服务" options={apiServices} showSearch optionFilterProp="label" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="operation" label="Operation（留空取服务默认）" extra="如 find / create / updateOne">
                    <Input placeholder="find" />
                  </Form.Item>
                </Col>
              </Row>
            ) : null}
            {actionType === 'internal_api' ? (
              <Form.Item name="parametersTemplateJson" label="参数模板（JSON，支持 {{payload.*}} 插值）">
                <Editor height="160px" language="json" theme="vs" options={MONACO_OPTIONS} />
              </Form.Item>
            ) : null}

            {actionType === 'script' ? (
              <>
                <Form.Item
                  label={
                    <Space>
                      TypeScript 脚本
                      <Button size="small" icon={<SafetyOutlined />} onClick={() => void handleCheckScript()}>
                        类型检查
                      </Button>
                      {scriptCheck ? (
                        scriptCheck.ok ? (
                          <Tag icon={<CheckCircleOutlined />} color="success">
                            检查通过
                          </Tag>
                        ) : (
                          <Tag color="error">{`L${scriptCheck.diagnostics[0]?.line}: ${scriptCheck.diagnostics[0]?.message?.slice(0, 40)}`}</Tag>
                        )
                      ) : null}
                    </Space>
                  }
                >
                  <Form.Item name="source" noStyle rules={[{ required: true, message: '请编写脚本' }]}>
                    <Editor height="260px" language="typescript" theme="vs" options={MONACO_OPTIONS} />
                  </Form.Item>
                </Form.Item>
                <Alert
                  type="info"
                  showIcon
                  message="脚本签名 handler(event, ctx)"
                  description={
                    <div>
                      <div>可用：event.payload（事件负载）、ctx.log(...)（写入运行记录）、db('实体code')（受控数据库查询）</div>
                      <div>限制：沙箱执行，默认 5 秒超时；无网络与文件访问，源码 ≤ 20000 字符</div>
                    </div>
                  }
                />
              </>
            ) : null}
          </Card>
        </section>

        <section id="hook-section-policy" className="hook-form__section">
          <h3 className="hook-form__section-title">失败策略</h3>
          <Card>
            <Row gutter={16}>
              <Col span={6}>
                <Form.Item name="retry" label="失败重试次数" initialValue={2} extra="指数退避 1s/4s/16s">
                  <InputNumber min={0} max={5} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="disableThreshold" label="连续失败自动停用阈值" initialValue={10}>
                  <InputNumber min={1} max={1000} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="concurrency" label="单钩子并发上限" initialValue={3}>
                  <InputNumber min={1} max={10} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item
                  name="timeoutMs"
                  label="动作超时（毫秒）"
                  extra="脚本默认 5000 / 外呼默认 30000 / 内部 API 默认 60000"
                >
                  <InputNumber min={1000} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
          </Card>
        </section>

        <section id="hook-section-test" className="hook-form__section">
          <h3 className="hook-form__section-title">测试</h3>
          <Card>
            {!id ? (
              <Alert type="warning" showIcon message="请先保存钩子（草稿即可），再回到此处试跑" />
            ) : (
              <>
                <Form.Item label="Mock 事件负载（JSON，与所选事件的 payload 结构对应）">
                  <Editor
                    height="140px"
                    language="json"
                    theme="vs"
                    value={mockPayload}
                    onChange={(v) => setMockPayload(v || '{}')}
                    options={MONACO_OPTIONS}
                  />
                </Form.Item>
                {recentRuns.length ? (
                  <Form.Item label="或引用一次历史运行的原始负载">
                    <Select
                      allowClear
                      placeholder="不引用，使用上方 Mock"
                      value={sourceRunId}
                      onChange={setSourceRunId}
                      options={recentRuns.slice(0, 10).map((r) => ({
                        label: `${r.startedAt?.slice(0, 19).replace('T', ' ')} ${r.status}（${r.triggerSource}）`,
                        value: r.id,
                      }))}
                    />
                  </Form.Item>
                ) : null}
                <Button type="primary" loading={testing} onClick={() => void handleTest()}>
                  试跑
                </Button>
                {testResult ? (
                  <div className="hook-form__test-result">
                    {testResult.conditionMatched === false ? (
                      <Alert type="warning" showIcon message={`条件不匹配，未执行：${testResult.reason || ''}`} />
                    ) : testResult.run?.status === 'success' ? (
                      <Descriptions
                        size="small"
                        bordered
                        column={1}
                        items={[
                          {
                            key: 'status',
                            label: '结果',
                            children: renderHookRunStatus(testResult.run?.status),
                          },
                          {
                            key: 'duration',
                            label: '耗时',
                            children: `${testResult.run?.durationMs ?? '-'} ms`,
                          },
                          {
                            key: 'output',
                            label: '输出',
                            children: (
                              <pre className="hook-form__payload-example">
                                {JSON.stringify(testResult.run?.output ?? null, null, 2)}
                              </pre>
                            ),
                          },
                          {
                            key: 'logs',
                            label: '日志',
                            children: (
                              <pre className="hook-form__payload-example">
                                {(testResult.run?.logs || []).join('\n') || '-'}
                              </pre>
                            ),
                          },
                        ]}
                      />
                    ) : (
                      <>
                        <Alert
                          type="error"
                          showIcon
                          message={`试跑未通过（${testResult.run?.status || 'failed'}）：${testResult.run?.error || '见详情'}`}
                          action={
                            <Button size="small" className="ai-btn" icon={<RobotOutlined />} onClick={handleAiFixTest}>
                              AI 自动修复
                            </Button>
                          }
                        />
                        <Descriptions
                          size="small"
                          bordered
                          column={1}
                          style={{ marginTop: 12 }}
                          items={[
                            {
                              key: 'status',
                              label: '结果',
                              children: renderHookRunStatus(testResult.run?.status),
                            },
                            {
                              key: 'duration',
                              label: '耗时',
                              children: `${testResult.run?.durationMs ?? '-'} ms`,
                            },
                            {
                              key: 'output',
                              label: '输出',
                              children: (
                                <pre className="hook-form__payload-example">
                                  {JSON.stringify(testResult.run?.output ?? null, null, 2)}
                                </pre>
                              ),
                            },
                            {
                              key: 'logs',
                              label: '日志',
                              children: (
                                <pre className="hook-form__payload-example">
                                  {(testResult.run?.logs || []).join('\n') || '-'}
                                </pre>
                              ),
                            },
                          ]}
                        />
                      </>
                    )}
                  </div>
                ) : null}
              </>
            )}
          </Card>
        </section>
      </Form>
    </FixHeaderPage>
  );
};

export default HookFormPage;
