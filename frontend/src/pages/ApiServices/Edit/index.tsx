import { RobotOutlined } from '@ant-design/icons';
import { ProForm } from '@ant-design/pro-components';
import { sendMockUserMessage, useAISurface, useChatReference } from '@eadaf/ai-base';
import { Alert, Button, Popconfirm, Space, Spin } from 'antd';
import { message } from '@/utils/antdAppApis';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { buildApiServiceReference } from '@/ai/chatReferenceBuilders';
import PageContainerTitleWithBack from '@/components/PageContainerTitleWithBack';
import FixHeaderPage from '@/components/FixHeaderPage';
import ApiServiceSectionNav from '../components/ApiServiceSectionNav';
import { buildApiServiceEditPolishPrompt } from '@/pages/ApiServices/ai/buildApiServiceEditPolishPrompt';
import ApiServiceForm, {
  buildAccessRestrictionPayload,
  buildDefaultRequestExample,
  type ApiServiceFormValues,
} from '../components/ApiServiceForm';
import { scopeCodeFromEntityCode } from '@/pages/ApiServices/ai/apiServiceCodeUtils';
import {
  getApiService,
  getApiServiceOperationCatalog,
  patchApiService,
  postApiServicePublish,
} from '@/services/EADAF/api/apiServices';
import {
  getApiData,
  getApiErrorMessage,
  isApiSuccess,
} from '@/utils/apiResponse';
import { apiServiceStatusEnum } from '@/enums';
import { renderStatusBadge } from '@/utils/statusBadge';
import { buildOperationResponsePreview } from '../utils/buildOperationResponsePreview';
import {
  buildResponseOverridesPayload,
  ensureResponseOverridesForOperation,
  readResponseOverride,
  resolveResponseExample,
} from '../utils/responseOverrides';
import { buildRequestOverridesPayload, formatRequestExampleText, readRequestOverride } from '../utils/requestOverrides';
import { tryParseJson } from '@/components/ResponseDocumentPanel';
import {
  ensureHandlerScriptValid,
  formatHandlerDiagnostics,
} from '../utils/handlerTypeCheckClient';
import { normalizeHandlerBody } from '../utils/handlerEditorShell';

type EditLocationState = {
  autoRunTest?: boolean;
  fixContext?: { errorMessage?: string };
  fromAutoFix?: boolean;
};

const ApiServiceEditPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state || {}) as EditLocationState;
  const { id: serviceId } = useParams<{ id: string }>();
  const [form] = ProForm.useForm<ApiServiceFormValues>();

  const [loading, setLoading] = useState(true);
  const [operationCatalog, setOperationCatalog] = useState<API.ApiServiceOperationMeta[]>([]);
  const [definitionScript, setDefinitionScript] = useState('');
  const [handlerScript, setHandlerScript] = useState('');
  const [requestParameterInterface, setRequestParameterInterface] = useState('');
  const [requestExampleText, setRequestExampleText] = useState('{}');
  const [responsesSchemaText, setResponsesSchemaText] = useState('{}');
  const [responseExampleText, setResponseExampleText] = useState('{}');
  const [submitting, setSubmitting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [serviceMeta, setServiceMeta] = useState<API.ApiService | null>(null);

  const definitionScriptRef = useRef(definitionScript);
  definitionScriptRef.current = definitionScript;
  const handlerScriptRef = useRef(handlerScript);
  handlerScriptRef.current = handlerScript;
  const requestParameterInterfaceRef = useRef(requestParameterInterface);
  requestParameterInterfaceRef.current = requestParameterInterface;
  const requestExampleTextRef = useRef(requestExampleText);
  requestExampleTextRef.current = requestExampleText;
  const serviceIdRef = useRef(serviceId);
  serviceIdRef.current = serviceId;
  const { references, addReference } = useChatReference();

  const loadService = useCallback(async () => {
    if (!serviceId) return;
    setLoading(true);
    try {
      const res = await getApiService(serviceId);
      if (!isApiSuccess(res)) {
        message.error(getApiErrorMessage(res, '加载 API 服务失败'));
        return;
      }
      const data = getApiData<API.ApiService>(res);
      if (!data) {
        message.error('API 服务不存在');
        return;
      }
      setServiceMeta(data);
      setDefinitionScript(data.definitionScript || '');
      setHandlerScript(normalizeHandlerBody(data.handlerScript || ''));
      setRequestParameterInterface(data.requestParameterInterface || '');
      const operation = data.enabledOperations?.[0];
      const savedOverride = readResponseOverride(data.securityConfig, operation);
      const savedRequestOverride = readRequestOverride(data.securityConfig, operation);
      if (savedOverride?.responsesSchema) {
        const { overrides } = ensureResponseOverridesForOperation({
          operation: operation || 'find',
          entityCode: data.entityCode,
          requestParameterInterface: data.requestParameterInterface,
          responseOverrides: operation
            ? { [operation]: savedOverride }
            : undefined,
        });
        const ensured = operation ? overrides[operation] : savedOverride;
        setResponsesSchemaText(JSON.stringify(ensured?.responsesSchema || savedOverride.responsesSchema, null, 2));
        const resolvedExample = resolveResponseExample(
          ensured?.responseExample ?? savedOverride.responseExample ?? {},
          operation,
          data.entityCode,
          data.requestParameterInterface,
        );
        setResponseExampleText(JSON.stringify(resolvedExample, null, 2));
      } else {
        const preview = buildOperationResponsePreview(
          operation,
          data.entityCode,
          data.requestParameterInterface,
        );
        if (preview) {
          setResponsesSchemaText(JSON.stringify(preview.responsesSchema, null, 2));
          setResponseExampleText(JSON.stringify(preview.responseExample, null, 2));
        }
      }
      if (savedRequestOverride?.requestExample != null) {
        setRequestExampleText(JSON.stringify(savedRequestOverride.requestExample, null, 2));
      } else {
        setRequestExampleText(JSON.stringify(
          buildDefaultRequestExample(data.requestParameterInterface),
          null,
          2,
        ));
      }
      const restriction = data.accessRestriction || { mode: 'none' as const };
      form.setFieldsValue({
        scopeCode: data.scopeCode,
        serviceSlug: data.serviceSlug,
        name: data.name,
        description: data.description || '',
        tags: data.tags || [],
        primaryOperation: data.enabledOperations?.[0],
        accessRestrictionMode: restriction.mode || 'none',
        roleIds: restriction.roleIds,
        departmentIds: restriction.departmentIds,
        scriptMode: data.scriptMode || 'sql',
        transportProtocols: data.transportProtocols?.length ? data.transportProtocols : ['http'],
        entityId: data.entityId,
        entityCode: data.entityCode,
        entityLabel: data.entity?.label,
      });
    } catch (error) {
      message.error(getApiErrorMessage(error, '加载 API 服务失败'));
    } finally {
      setLoading(false);
    }
  }, [form, serviceId]);

  useEffect(() => {
    void loadService();
    void getApiServiceOperationCatalog().then((res) => {
      const data = getApiData<API.ApiServiceOperationMeta[]>(res);
      if (isApiSuccess(res) && data) setOperationCatalog(data);
    });
  }, [loadService]);

  useAISurface({
    id: 'api-services.edit',
    domain: 'bizdata',
    label: '编辑 API 服务',
    read: () => {
      const values = form.getFieldsValue();
      const scopeRefs = references
        .filter((r: any) => r.type === 'scope')
        .map((r: any) => (r.content as { code?: string })?.code)
        .filter(Boolean);
      const entityRefs = references
        .filter((r: any) => r.type === 'entity')
        .map((r: any) => {
          const c = r.content as { code?: string; label?: string; id?: string };
          return { code: c.code, label: c.label, id: c.id };
        });
      return {
        serviceId: serviceIdRef.current,
        code: serviceMeta?.code,
        scopeCode: values.scopeCode || serviceMeta?.scopeCode,
        serviceSlug: values.serviceSlug || serviceMeta?.serviceSlug,
        name: values.name || serviceMeta?.name,
        description: values.description ?? serviceMeta?.description,
        status: serviceMeta?.status,
        entityId: values.entityId || serviceMeta?.entityId,
        entityCode: values.entityCode || serviceMeta?.entityCode,
        entityLabel: values.entityLabel || serviceMeta?.entity?.label,
        resolvedConnection: values.resolvedConnectionId
          ? {
              connectionId: values.resolvedConnectionId,
              connectionName: values.resolvedConnectionName,
              dbType: values.resolvedDbType,
              targetSchema: values.resolvedTargetSchema,
            }
          : serviceMeta?.connectionId
            ? {
                connectionId: serviceMeta.connectionId,
                connectionName: serviceMeta.connection?.name,
                targetSchema: serviceMeta.targetSchema,
              }
            : undefined,
        targetSchema: values.resolvedTargetSchema || serviceMeta?.targetSchema,
        primaryOperation: values.primaryOperation,
        scriptMode: values.scriptMode || serviceMeta?.scriptMode,
        definitionScript: definitionScriptRef.current,
        handlerScript: handlerScriptRef.current,
        requestParameterInterface: requestParameterInterfaceRef.current,
        requestExampleText: requestExampleTextRef.current,
        accessRestriction: buildAccessRestrictionPayload(values),
        fixContext: locationState.fixContext,
        chatReferences: { scopes: scopeRefs, entities: entityRefs },
      };
    },
    applyMutation: (mutation: any) => {
      if (mutation.type !== 'apiservice.updated') return;
      if (mutation.resourceId && mutation.resourceId !== serviceIdRef.current) return;
      const payload = mutation.payload as API.ApiService | undefined;
      if (payload?.definitionScript != null) {
        setDefinitionScript(payload.definitionScript);
      }
      if (payload?.handlerScript != null) {
        setHandlerScript(normalizeHandlerBody(payload.handlerScript));
      }
      if (payload?.requestParameterInterface != null) {
        setRequestParameterInterface(payload.requestParameterInterface);
      }
      const operation = String(
        payload?.enabledOperations?.[0]
        || form.getFieldValue('primaryOperation')
        || '',
      ).trim();
      const savedRequestExample = readRequestOverride(
        payload?.securityConfig as Record<string, unknown> | undefined,
        operation,
      )?.requestExample;
      if (savedRequestExample != null) {
        setRequestExampleText(formatRequestExampleText(savedRequestExample));
      }
      if (payload) {
        setServiceMeta((prev) => ({ ...prev, ...payload }));
        form.setFieldsValue({
          name: payload.name ?? form.getFieldValue('name'),
          description: payload.description ?? form.getFieldValue('description'),
          tags: payload.tags ?? form.getFieldValue('tags'),
          scopeCode: payload.scopeCode ?? form.getFieldValue('scopeCode'),
          serviceSlug: payload.serviceSlug ?? form.getFieldValue('serviceSlug'),
          scriptMode: payload.scriptMode ?? form.getFieldValue('scriptMode'),
        });
      }
    },
    matchMutation: (mutation: any) =>
      mutation.domain === 'bizdata' && mutation.type === 'apiservice.updated',
  });

  const submit = async () => {
    if (!serviceId) return;
    const values = await form.validateFields();
    const operation = String(values.primaryOperation || '').trim();
    const schemaParsed = tryParseJson(responsesSchemaText);
    const exampleParsed = tryParseJson(responseExampleText);
    const requestExampleParsed = tryParseJson(requestExampleText);
    if (!schemaParsed.ok) {
      message.error(`Responses Schema JSON 无效：${schemaParsed.error}`);
      return;
    }
    if (!exampleParsed.ok) {
      message.error(`Response Example JSON 无效：${exampleParsed.error}`);
      return;
    }
    const sanitizedResponseExample = resolveResponseExample(
      exampleParsed.value,
      operation,
      serviceMeta?.entityCode,
      requestParameterInterface,
    );
    if (!requestExampleParsed.ok) {
      message.error(`请求 Example JSON 无效：${requestExampleParsed.error}`);
      return;
    }

    if (values.scriptMode === 'typescript') {
      const check = await ensureHandlerScriptValid(
        normalizeHandlerBody(handlerScript),
        requestParameterInterface,
      );
      if (check) {
        message.error(`Handler 语法检查未通过：\n${formatHandlerDiagnostics(check.diagnostics)}`);
        return;
      }
    }

    setSubmitting(true);
    try {
      if (!values.entityId) {
        message.error('请选择主实体');
        setSubmitting(false);
        return;
      }
      const res = await patchApiService(serviceId, {
        scopeCode: values.scopeCode || scopeCodeFromEntityCode(values.entityCode),
        serviceSlug: values.serviceSlug,
        name: String(values.name || '').trim(),
        description: String(values.description || '').trim(),
        tags: values.tags || [],
        scriptMode: values.scriptMode,
        entityId: values.entityId,
        connectionId: values.resolvedConnectionId,
        targetSchema: values.resolvedTargetSchema,
        definitionScript: values.scriptMode === 'typescript' ? undefined : definitionScript.trim() || undefined,
        handlerScript: values.scriptMode === 'typescript'
          ? normalizeHandlerBody(handlerScript).trim() || undefined
          : undefined,
        requestParameterInterface: requestParameterInterface.trim() || undefined,
        responseOverrides: operation
          ? buildResponseOverridesPayload(
            operation,
            schemaParsed.value as Record<string, unknown>,
            sanitizedResponseExample,
          )
          : undefined,
        requestOverrides: operation
          ? buildRequestOverridesPayload(operation, requestExampleParsed.value)
          : undefined,
        accessRestriction: buildAccessRestrictionPayload(values),
        enabledOperations: values.primaryOperation ? [String(values.primaryOperation)] : undefined,
        transportProtocols: values.transportProtocols,
      });

      if (!isApiSuccess(res)) {
        message.error(getApiErrorMessage(res, '保存失败'));
        return;
      }
      const updated = getApiData<API.ApiService>(res);
      if (updated) setServiceMeta(updated);
      if (updated?.status === 'draft' && serviceMeta?.status === 'published') {
        message.success('已保存，服务已回到草稿状态，请重新发布');
      } else {
        message.success('API 服务已保存');
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) return;
      message.error(getApiErrorMessage(error, '保存失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAiPolish = () => {
    if (!serviceMeta) return;
    addReference(
      buildApiServiceReference({
        id: serviceMeta.id,
        code: serviceMeta.code,
        name: serviceMeta.name,
        routePath: serviceMeta.routePath,
        status: serviceMeta.status,
        entityCode: serviceMeta.entityCode,
      }),
    );
    sendMockUserMessage(
      buildApiServiceEditPolishPrompt({
        serviceId: serviceMeta.id,
        code: serviceMeta.code,
        name: serviceMeta.name,
        primaryOperation: form.getFieldValue('primaryOperation') || serviceMeta.enabledOperations?.[0],
        scriptMode: form.getFieldValue('scriptMode') || serviceMeta.scriptMode,
        entityCode: serviceMeta.entityCode,
      }),
    );
  };

  const handlePublish = async () => {
    if (!serviceId) return;
    setPublishing(true);
    try {
      const res = await postApiServicePublish(serviceId);
      if (!isApiSuccess(res)) {
        message.error(getApiErrorMessage(res, '发布失败'));
        return;
      }
      const data = getApiData<API.ApiService>(res);
      if (data) setServiceMeta(data);
      message.success('发布成功');
    } catch {
      message.error('发布失败');
    } finally {
      setPublishing(false);
    }
  };

  const showPublishAction = serviceMeta
    && (serviceMeta.status === 'draft' || serviceMeta.status === 'disabled' || !serviceMeta.status);

  if (loading) {
    return (
      <FixHeaderPage title={<PageContainerTitleWithBack title="编辑 API 服务" />}>
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <Spin description="加载中…" />
        </div>
      </FixHeaderPage>
    );
  }

  return (
    <FixHeaderPage
      title={(
        <PageContainerTitleWithBack
          title={`编辑 API 服务${serviceMeta?.code ? ` · ${serviceMeta.code}` : ''}`}
        />
      )}
      subTitle={
        serviceMeta ? (
          <Space size={8} wrap>
            <span>版本 v{serviceMeta.version ?? 0}</span>
            {renderStatusBadge(serviceMeta.status || 'draft', apiServiceStatusEnum)}
            {showPublishAction ? (
              <Popconfirm title="确定发布该 API 服务？" onConfirm={() => void handlePublish()}>
                <Button size="small" type="primary" loading={publishing}>
                  发布
                </Button>
              </Popconfirm>
            ) : null}
          </Space>
        ) : (
          '修改 Scope、访问限制、参数 interface 与 SQL/TypeScript Handler'
        )
      }
      centerSlot={<ApiServiceSectionNav />}
      extra={
        <Space>
          {serviceId && (
            <Button onClick={() => navigate(`/api_services/${serviceId}/test`)}>去测试</Button>
          )}
          {serviceMeta && (
            <Button className="ai-btn" icon={<RobotOutlined />} onClick={handleAiPolish}>
              AI 完善
            </Button>
          )}
          <Button type="primary" loading={submitting} onClick={() => void submit()}>
            保存
          </Button>
        </Space>
      }
    >
      {locationState.fixContext?.errorMessage && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          title="AI 正在修复以下测试错误"
          description={
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12 }}>
              {locationState.fixContext.errorMessage}
            </pre>
          }
        />
      )}

      <ProForm form={form} submitter={false} layout="vertical">
        <ApiServiceForm
          form={form}
          mode="edit"
          operationCatalog={operationCatalog}
          definitionScript={definitionScript}
          onDefinitionScriptChange={setDefinitionScript}
          handlerScript={handlerScript}
          onHandlerScriptChange={(value) => setHandlerScript(normalizeHandlerBody(value))}
          requestParameterInterface={requestParameterInterface}
          onRequestParameterInterfaceChange={setRequestParameterInterface}
          requestExampleText={requestExampleText}
          onRequestExampleTextChange={setRequestExampleText}
          readonlyCode={serviceMeta?.code}
          responsesSchemaText={responsesSchemaText}
          onResponsesSchemaTextChange={setResponsesSchemaText}
          responseExampleText={responseExampleText}
          onResponseExampleTextChange={setResponseExampleText}
        />
      </ProForm>
    </FixHeaderPage>
  );
};

export default ApiServiceEditPage;
