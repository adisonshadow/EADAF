import { RobotOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Form, Input, Row, Select, Space, Switch, Typography } from 'antd';
import { message } from '@/utils/antdAppApis';
import { ProForm, ProFormText, ProFormTextArea } from '@ant-design/pro-components';
import Editor from '@monaco-editor/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAISurface, useChatReference, useAIChatPrompts, sendMockUserMessage } from '@eadaf/ai-base';
import PageContainerTitleWithBack from '@/components/PageContainerTitleWithBack';
import FixHeaderPage from '@/components/FixHeaderPage';
import ResponseDocumentEditor, { tryParseJson } from '@/components/ResponseDocumentPanel';
import {
  getOutboundWebhook,
  patchOutboundWebhook,
  postOutboundWebhook,
} from '@/services/EADAF/api/outboundWebhooks';
import { getApiServices } from '@/services/EADAF/api/apiServices';
import { isApiSuccess, getApiData } from '@/utils/apiResponse';
import { buildDefaultRequestExample } from '../components/ApiServiceForm';
import { buildOutboundWebhookGeneratePrompt } from '../ai/buildOutboundWebhookGeneratePrompt';
import { buildOutboundWebhookFormPrompts } from '../ai/buildOutboundWebhookFormPrompts';
import OutboundWebhookSectionNav from './OutboundWebhookSectionNav';
import './outboundWebhookForm.css';

const { Text, Paragraph } = Typography;

const MONACO_OPTIONS = { minimap: { enabled: false }, fontSize: 13, wordWrap: 'on' as const };

const DEFAULT_RESPONSE_CONFIG: API.OutboundWebhookResponseConfig = {
  success: {
    schema: {
      type: 'object',
      properties: {
        code: { type: 'integer', example: 200 },
        message: { type: 'string', example: 'success' },
      },
    },
    example: { code: 200, message: 'success' },
  },
  exception: {
    schema: {
      type: 'object',
      properties: {
        code: { type: 'integer', example: 500 },
        message: { type: 'string', example: 'error' },
      },
    },
    example: { code: 500, message: 'error' },
    rules: ["code != 200", "isOK != 'SUCCESS'"],
  },
  httpStatusAsException: true,
};

interface FormPageProps {
  mode: 'create' | 'edit';
}

const OutboundWebhookFormPage: React.FC<FormPageProps> = ({ mode }) => {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(mode === 'edit');
  const [webhookMeta, setWebhookMeta] = useState<API.OutboundWebhook | null>(null);

  const [requestStructure, setRequestStructure] = useState('');
  const [requestExample, setRequestExample] = useState('{}');
  const [transformScript, setTransformScript] = useState('');
  const [mockData, setMockData] = useState('{}');
  const [successSchemaText, setSuccessSchemaText] = useState(
    JSON.stringify(DEFAULT_RESPONSE_CONFIG.success?.schema, null, 2),
  );
  const [successExampleText, setSuccessExampleText] = useState(
    JSON.stringify(DEFAULT_RESPONSE_CONFIG.success?.example, null, 2),
  );
  const [exceptionSchemaText, setExceptionSchemaText] = useState(
    JSON.stringify(DEFAULT_RESPONSE_CONFIG.exception?.schema, null, 2),
  );
  const [exceptionExampleText, setExceptionExampleText] = useState(
    JSON.stringify(DEFAULT_RESPONSE_CONFIG.exception?.example, null, 2),
  );
  const [exceptionRules, setExceptionRules] = useState<string[]>(
    DEFAULT_RESPONSE_CONFIG.exception?.rules || [],
  );
  const [httpStatusAsException, setHttpStatusAsException] = useState(true);
  const [authSecretSet, setAuthSecretSet] = useState(false);
  const [authSecretMasked, setAuthSecretMasked] = useState<string | null>(null);
  const [apiServiceOptions, setApiServiceOptions] = useState<{ label: string; value: string; code?: string }[]>([]);

  const requestStructureRef = useRef(requestStructure);
  requestStructureRef.current = requestStructure;
  const requestExampleRef = useRef(requestExample);
  requestExampleRef.current = requestExample;
  const transformScriptRef = useRef(transformScript);
  transformScriptRef.current = transformScript;
  const mockDataRef = useRef(mockData);
  mockDataRef.current = mockData;
  const formValuesRef = useRef<Record<string, any>>({});
  const exceptionRulesRef = useRef(exceptionRules);
  exceptionRulesRef.current = exceptionRules;

  const authType = Form.useWatch('authType', form) || 'none';
  const triggerApiServiceId = Form.useWatch('triggerApiServiceId', form);
  const selectedApiLabel = apiServiceOptions.find((o) => o.value === triggerApiServiceId)?.label;

  const { references, addReference } = useChatReference();
  const chatPrompts = useMemo(
    () => buildOutboundWebhookFormPrompts(references),
    [references],
  );
  useAIChatPrompts(chatPrompts);

  useEffect(() => {
    void (async () => {
      try {
        const res = await getApiServices({ size: -1, status: 'published' });
        if (isApiSuccess(res)) {
          const items = getApiData<any>(res)?.items || [];
          setApiServiceOptions(
            items.map((s: any) => ({
              label: `${s.name} (${s.code})`,
              value: s.id,
              code: s.code,
            })),
          );
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  const applyResponseConfig = useCallback((cfg?: API.OutboundWebhookResponseConfig | null) => {
    const merged = {
      ...DEFAULT_RESPONSE_CONFIG,
      ...(cfg || {}),
      success: { ...DEFAULT_RESPONSE_CONFIG.success, ...(cfg?.success || {}) },
      exception: { ...DEFAULT_RESPONSE_CONFIG.exception, ...(cfg?.exception || {}) },
    };
    setSuccessSchemaText(JSON.stringify(merged.success?.schema ?? {}, null, 2));
    setSuccessExampleText(JSON.stringify(merged.success?.example ?? {}, null, 2));
    setExceptionSchemaText(JSON.stringify(merged.exception?.schema ?? {}, null, 2));
    setExceptionExampleText(JSON.stringify(merged.exception?.example ?? {}, null, 2));
    setExceptionRules(Array.isArray(merged.exception?.rules) ? merged.exception!.rules! : []);
    setHttpStatusAsException(merged.httpStatusAsException !== false);
  }, []);

  useEffect(() => {
    if (mode !== 'edit' || !id) return;
    void (async () => {
      setLoading(true);
      try {
        const res = await getOutboundWebhook(id);
        if (isApiSuccess(res)) {
          const data = getApiData<API.OutboundWebhook>(res);
          if (data) {
            setWebhookMeta(data);
            form.setFieldsValue({
              code: data.code,
              name: data.name,
              description: data.description,
              triggerApiServiceId: data.triggerApiServiceId,
              triggerApiServiceCode: data.triggerApiServiceCode,
              targetUrl: data.targetUrl,
              httpMethod: data.httpMethod || 'POST',
              authType: data.authType || 'none',
              authSendMode: data.authSendMode || 'header',
              authKeyName: data.authKeyName || undefined,
              authSecret: undefined,
            });
            formValuesRef.current = {
              code: data.code,
              name: data.name,
              description: data.description,
              triggerApiServiceId: data.triggerApiServiceId,
              triggerApiServiceCode: data.triggerApiServiceCode,
              targetUrl: data.targetUrl,
              httpMethod: data.httpMethod || 'POST',
              authType: data.authType || 'none',
            };
            setRequestStructure(data.requestStructure || '');
            setRequestExample(data.requestExample || '{}');
            setTransformScript(data.transformScript || '');
            setMockData(data.mockData || '{}');
            setAuthSecretSet(Boolean(data.authSecretSet));
            setAuthSecretMasked(data.authSecretMasked || null);
            applyResponseConfig(data.responseConfig);
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [mode, id, form, applyResponseConfig]);

  useAISurface({
    id: mode === 'create' ? 'apiservice.outbound_webhook.create' : 'apiservice.outbound_webhook.edit',
    domain: 'apiservice',
    label: '提交外部API编辑',
    read: () => ({
      ...formValuesRef.current,
      requestStructure: requestStructureRef.current,
      requestExample: requestExampleRef.current,
      transformScript: transformScriptRef.current,
      mockData: mockDataRef.current,
      exceptionRules: exceptionRulesRef.current,
    }),
    applyMutation: (mutation) => {
      if (mutation.type === 'outbound_webhook.updated') {
        const p = (mutation.payload || {}) as {
          requestStructure?: string;
          requestExample?: string;
          transformScript?: string;
          mockData?: string;
          exceptionRules?: unknown;
          responseConfig?: API.OutboundWebhookResponseConfig;
        };
        if (p.requestStructure != null) setRequestStructure(p.requestStructure);
        if (p.requestExample != null) setRequestExample(p.requestExample);
        if (p.transformScript != null) setTransformScript(p.transformScript);
        if (p.mockData != null) setMockData(p.mockData);
        if (Array.isArray(p.exceptionRules)) setExceptionRules(p.exceptionRules);
        if (p.responseConfig != null) applyResponseConfig(p.responseConfig as API.OutboundWebhookResponseConfig);
      }
    },
    matchMutation: (mutation) => mutation.type === 'outbound_webhook.updated',
  });

  const handleFillRequestExample = () => {
    const example = buildDefaultRequestExample(requestStructure);
    setRequestExample(JSON.stringify(example, null, 2));
    message.success('已根据请求结构生成 Demo');
  };

  const buildResponseConfig = (): API.OutboundWebhookResponseConfig | null => {
    const successSchema = tryParseJson(successSchemaText);
    const successExample = tryParseJson(successExampleText);
    const exceptionSchema = tryParseJson(exceptionSchemaText);
    const exceptionExample = tryParseJson(exceptionExampleText);
    if (!successSchema.ok) {
      message.error(`成功响应 Schema JSON 无效：${successSchema.error}`);
      return null;
    }
    if (!successExample.ok) {
      message.error(`成功响应 Example JSON 无效：${successExample.error}`);
      return null;
    }
    if (!exceptionSchema.ok) {
      message.error(`异常响应 Schema JSON 无效：${exceptionSchema.error}`);
      return null;
    }
    if (!exceptionExample.ok) {
      message.error(`异常响应 Example JSON 无效：${exceptionExample.error}`);
      return null;
    }
    return {
      success: { schema: successSchema.value, example: successExample.value },
      exception: {
        schema: exceptionSchema.value,
        example: exceptionExample.value,
        rules: exceptionRules.map((r) => r.trim()).filter(Boolean),
      },
      httpStatusAsException,
    };
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const selectedService = apiServiceOptions.find((o) => o.value === values.triggerApiServiceId);
      const requestExampleParsed = tryParseJson(requestExample);
      if (!requestExampleParsed.ok) {
        message.error(`请求 Demo JSON 无效：${requestExampleParsed.error}`);
        return;
      }
      const responseConfig = buildResponseConfig();
      if (!responseConfig) return;

      const body: Partial<API.OutboundWebhook> = {
        code: values.code,
        name: values.name,
        description: values.description,
        triggerApiServiceId: values.triggerApiServiceId,
        triggerApiServiceCode:
          selectedService?.code
          || values.triggerApiServiceCode
          || selectedService?.label?.match(/\(([^)]+)\)/)?.[1],
        targetUrl: values.targetUrl,
        httpMethod: values.httpMethod || 'POST',
        authType: values.authType || 'none',
        authSendMode: values.authType === 'api_key' ? (values.authSendMode || 'header') : undefined,
        authKeyName: values.authType === 'none' ? undefined : values.authKeyName,
        requestStructure,
        requestExample,
        transformScript,
        mockData,
        responseConfig,
      };

      if (values.authType && values.authType !== 'none') {
        if (typeof values.authSecret === 'string' && values.authSecret.length > 0) {
          body.authSecret = values.authSecret;
        }
      }

      setSaving(true);
      let res;
      if (mode === 'create') {
        res = await postOutboundWebhook(body);
        if (isApiSuccess(res)) {
          message.success('创建成功');
          navigate(`/api_services/outbound-webhooks/${res.data?.id}/edit`, { replace: true });
        }
      } else {
        res = await patchOutboundWebhook(id!, body);
        if (isApiSuccess(res)) {
          message.success('保存成功');
          const data = getApiData<API.OutboundWebhook>(res);
          if (data) {
            setWebhookMeta(data);
            setAuthSecretSet(Boolean(data.authSecretSet));
            setAuthSecretMasked(data.authSecretMasked || null);
            form.setFieldValue('authSecret', undefined);
          }
        }
      }
      if (!isApiSuccess(res)) {
        message.error(res.message || '保存失败');
      }
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleAiGenerate = () => {
    addReference({
      type: 'outbound_webhook',
      label: '提交外部API',
      content: formValuesRef.current.name || formValuesRef.current.code || '',
      unique: true,
    });
    sendMockUserMessage(
      buildOutboundWebhookGeneratePrompt({
        targetUrl: formValuesRef.current.targetUrl,
        triggerApiServiceCode: formValuesRef.current.triggerApiServiceCode,
      }),
    );
  };

  const isEdit = mode === 'edit';
  const pageTitle = isEdit
    ? `编辑提交外部API${webhookMeta?.code ? ` · ${webhookMeta.code}` : ''}`
    : '新建提交外部API';

  if (loading) {
    return (
      <FixHeaderPage title={<PageContainerTitleWithBack title={pageTitle} backTo="/api_services/outbound-webhooks" />}>
        <div style={{ textAlign: 'center', padding: '48px 0' }}>加载中…</div>
      </FixHeaderPage>
    );
  }

  return (
    <FixHeaderPage
      title={<PageContainerTitleWithBack title={pageTitle} backTo="/api_services/outbound-webhooks" />}
      subTitle={
        isEdit
          ? '配置目标地址、可选鉴权、请求 Demo、处置脚本与响应判定规则'
          : '业务 API 成功后触发，将数据转换并提交到外部 API'
      }
      centerSlot={<OutboundWebhookSectionNav />}
      extra={
        <Space>
          {isEdit && id ? (
            <Button onClick={() => navigate(`/api_services/outbound-webhooks/${id}/test`)}>去测试</Button>
          ) : null}
          <Button className="ai-btn" icon={<RobotOutlined />} onClick={handleAiGenerate}>
            AI 一键编写
          </Button>
          <Button type="primary" loading={saving} onClick={() => void handleSave()}>
            保存
          </Button>
        </Space>
      }
    >
      <div className="outbound-webhook-form">
        <ProForm
          form={form}
          submitter={false}
          layout="vertical"
          initialValues={{
            httpMethod: 'POST',
            authType: 'none',
            authSendMode: 'header',
          }}
          onValuesChange={(_, all) => {
            formValuesRef.current = { ...formValuesRef.current, ...all };
          }}
        >
          {/* 信息 */}
          <section id="outbound-webhook-section-info" className="outbound-webhook-form__section">
            <h3 className="outbound-webhook-form__section-title">信息</h3>

            <Card title="基础信息" style={{ marginBottom: 16 }}>
              <Row gutter={16}>
                <Col span={12}>
                  <ProFormText
                    name="code"
                    label="编码"
                    placeholder="域:slug，如 fmms:notifyOrder"
                    rules={[{ required: true, message: '请输入编码' }]}
                    disabled={isEdit}
                    tooltip="冒号分层，唯一标识"
                  />
                </Col>
                <Col span={12}>
                  <ProFormText
                    name="name"
                    label="名称"
                    placeholder="提交外部API名称"
                    rules={[{ required: true, message: '请输入名称' }]}
                  />
                </Col>
                <Col span={24}>
                  <ProFormTextArea name="description" label="描述" placeholder="可选" />
                </Col>
              </Row>
            </Card>

            <Card title="目标 API 与触发" style={{ marginBottom: 16 }}>
              <Row gutter={16}>
                <Col span={16}>
                  <ProFormText
                    name="targetUrl"
                    label="外部 API 地址"
                    placeholder="https://example.com/api/notify"
                    rules={[{ required: true, message: '请输入外部 API 地址' }]}
                  />
                </Col>
                <Col span={8}>
                  <Form.Item
                    name="httpMethod"
                    label="Method"
                    rules={[{ required: true, message: '请选择 Method' }]}
                    tooltip="本轮支持 POST / PUT / PATCH，请求体为 JSON"
                  >
                    <Select
                      options={[
                        { label: 'POST', value: 'POST' },
                        { label: 'PUT', value: 'PUT' },
                        { label: 'PATCH', value: 'PATCH' },
                      ]}
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item label="触发方式">
                <Select
                  disabled
                  value="api_hook"
                  options={[{ label: '业务 API HOOK（业务 API 成功后触发）', value: 'api_hook' }]}
                />
              </Form.Item>

              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message="Hook 机制说明"
                description={
                  <ul className="outbound-webhook-form__hook-list">
                    <li>触发时机：绑定业务 API 的 <Text code>HTTP</Text> 调用成功返回后同步触发</li>
                    <li>入参：业务 API 的 <Text code>preview || result</Text>，经处置脚本转换为外呼 body</li>
                    <li>失败语义：外呼失败只记运行历史，不阻断业务 API 主流程</li>
                    <li>当前不设独立「钩子管理中心」；多触发源后再演进</li>
                  </ul>
                }
              />

              <Form.Item
                name="triggerApiServiceId"
                label="绑定的业务 API"
                rules={[{ required: true, message: '请选择绑定的业务 API' }]}
                tooltip="当绑定的业务 API 请求成功后，自动触发本提交"
                extra={selectedApiLabel ? `当前绑定：${selectedApiLabel}` : undefined}
              >
                <Select
                  showSearch
                  allowClear
                  placeholder="选择已发布的业务 API 服务"
                  options={apiServiceOptions}
                  filterOption={(input, option) =>
                    String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                />
              </Form.Item>
            </Card>

            <Card title="接口鉴权（可选）" style={{ marginBottom: 16 }}>
              <Paragraph type="secondary" style={{ marginBottom: 12 }}>
                默认无鉴权。密钥加密落库；编辑时不回传明文，留空表示保留已缓存密钥。
              </Paragraph>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="authType" label="鉴权类型">
                    <Select
                      options={[
                        { label: '无', value: 'none' },
                        { label: 'Bearer Token', value: 'bearer' },
                        { label: 'API Key', value: 'api_key' },
                      ]}
                    />
                  </Form.Item>
                </Col>
                {authType === 'api_key' ? (
                  <Col span={8}>
                    <Form.Item name="authSendMode" label="密钥发送方式">
                      <Select
                        options={[
                          { label: 'Header', value: 'header' },
                          { label: 'Query', value: 'query' },
                        ]}
                      />
                    </Form.Item>
                  </Col>
                ) : null}
                {authType !== 'none' ? (
                  <Col span={8}>
                    <Form.Item
                      name="authKeyName"
                      label={authType === 'bearer' ? 'Header 名' : '参数名'}
                      tooltip={
                        authType === 'bearer'
                          ? '默认 Authorization，值自动加 Bearer 前缀'
                          : 'Header 默认 X-API-Key；Query 默认 api_key'
                      }
                    >
                      <Input placeholder={authType === 'bearer' ? 'Authorization' : 'X-API-Key'} />
                    </Form.Item>
                  </Col>
                ) : null}
              </Row>
              {authType !== 'none' ? (
                <Form.Item
                  name="authSecret"
                  label="密钥"
                  extra={
                    authSecretSet
                      ? `已缓存密钥：${authSecretMasked || '****'}（留空保留，填写则覆盖）`
                      : '尚未缓存密钥'
                  }
                >
                  <Input.Password placeholder={authSecretSet ? '留空保留原密钥' : '输入密钥'} autoComplete="new-password" />
                </Form.Item>
              ) : null}
            </Card>
          </section>

          {/* 请求 */}
          <section id="outbound-webhook-section-request" className="outbound-webhook-form__section">
            <h3 className="outbound-webhook-form__section-title">请求</h3>
            <Card style={{ marginBottom: 16 }}>
              <Row gutter={16}>
                <Col span={12} className="outbound-webhook-form__editor-split-left">
                  <div className="outbound-webhook-form__request-col-title">
                    <span>请求参数结构（TypeScript interface）</span>
                  </div>
                  <Editor
                    height="280px"
                    language="typescript"
                    theme="vs"
                    value={requestStructure}
                    onChange={(v) => setRequestStructure(v || '')}
                    options={MONACO_OPTIONS}
                  />
                </Col>
                <Col span={12}>
                  <div className="outbound-webhook-form__request-col-title">
                    <span>请求参数 Example（JSON）</span>
                    <Button type="link" size="small" onClick={handleFillRequestExample}>
                      按结构生成
                    </Button>
                  </div>
                  <Editor
                    height="280px"
                    language="json"
                    theme="vs"
                    value={requestExample}
                    onChange={(v) => setRequestExample(v || '{}')}
                    options={MONACO_OPTIONS}
                  />
                </Col>
              </Row>
            </Card>
          </section>

          {/* 处理 */}
          <section id="outbound-webhook-section-process" className="outbound-webhook-form__section">
            <h3 className="outbound-webhook-form__section-title">处理</h3>
            <Card
              title="处置脚本"
              style={{ marginBottom: 16 }}
              extra={
                <Text type="secondary" style={{ fontSize: 12 }}>
                  export function transform(data, ctx)
                </Text>
              }
            >
              <Paragraph type="secondary" style={{ marginBottom: 12 }}>
                将业务 API 返回的 <Text code>data</Text> 转换为请求结构，再按 Method 以 JSON 发往目标 URL。
              </Paragraph>
              <Editor
                height="280px"
                language="typescript"
                theme="vs"
                value={transformScript}
                onChange={(v) => setTransformScript(v || '')}
                options={MONACO_OPTIONS}
              />
            </Card>
            <Card title="Mock Data（模拟业务 API 返回）" style={{ marginBottom: 16 }}>
              <Paragraph type="secondary" style={{ marginBottom: 12 }}>
                用于测试页输入，不是「请求 Demo」。请求 Demo 在「请求」分区。
              </Paragraph>
              <Editor
                height="180px"
                language="json"
                theme="vs"
                value={mockData}
                onChange={(v) => setMockData(v || '{}')}
                options={MONACO_OPTIONS}
              />
            </Card>
          </section>

          {/* 响应 */}
          <section id="outbound-webhook-section-response" className="outbound-webhook-form__section">
            <h3 className="outbound-webhook-form__section-title">响应</h3>
            <Card title="成功响应" style={{ marginBottom: 16 }}>
              <ResponseDocumentEditor
                responsesSchemaText={successSchemaText}
                responseExampleText={successExampleText}
                onResponsesSchemaChange={setSuccessSchemaText}
                onResponseExampleChange={setSuccessExampleText}
                schemaTitle="成功 Schema"
                exampleTitle="成功 Example"
              />
            </Card>
            <Card title="异常响应与判定规则" style={{ marginBottom: 16 }}>
              <ResponseDocumentEditor
                responsesSchemaText={exceptionSchemaText}
                responseExampleText={exceptionExampleText}
                onResponsesSchemaChange={setExceptionSchemaText}
                onResponseExampleChange={setExceptionExampleText}
                schemaTitle="异常 Schema"
                exampleTitle="异常 Example"
              />
              <div style={{ height: 16 }} />
              <Form.Item
                label="异常判定规则"
                extra="语法：字段路径 运算符 字面量，如 code != 200、isOK != 'SUCCESS'。任一条命中即判失败。"
              >
                <Select
                  mode="tags"
                  value={exceptionRules}
                  onChange={(v) => setExceptionRules(v as string[])}
                  placeholder="输入规则后回车，如 code != 200"
                  tokenSeparators={[',']}
                  style={{ width: '100%' }}
                />
              </Form.Item>
              <Form.Item label="HTTP 非 2xx 视为异常">
                <Switch checked={httpStatusAsException} onChange={setHttpStatusAsException} />
              </Form.Item>
            </Card>
          </section>
        </ProForm>
      </div>
    </FixHeaderPage>
  );
};

export default OutboundWebhookFormPage;
