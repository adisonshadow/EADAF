import { ProForm } from '@ant-design/pro-components';
import { useAIChatPrompts, useAISurface, useChatReference } from '@eadaf/ai-base';
import { Button, Form, Space } from 'antd';
import { message } from '@/utils/antdAppApis';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageContainerTitleWithBack from '@/components/PageContainerTitleWithBack';
import FixHeaderPage from '@/components/FixHeaderPage';
import ApiServiceSectionNav from '../components/ApiServiceSectionNav';
import {
  getApiServiceOperationCatalog,
  postApiService,
  postApiServicePublish,
} from '@/services/EADAF/api/apiServices';
import {
  getApiData,
  getApiErrorMessage,
  isApiSuccess,
} from '@/utils/apiResponse';
import ApiServiceForm, {
  buildAccessRestrictionPayload,
  buildDefaultRequestExample,
  type ApiServiceFormValues,
} from '../components/ApiServiceForm';
import { scopeCodeFromEntityCode, suggestServiceSlugFromEntity } from '@/pages/ApiServices/ai/apiServiceCodeUtils';
import { buildApiServiceCreatePrompts } from '@/pages/ApiServices/ai/buildApiServiceCreatePrompts';
import { getBusinessDataEntity } from '@/services/EADAF/api/businessData';
import { buildOperationResponsePreview } from '../utils/buildOperationResponsePreview';
import { buildResponseOverridesPayload, resolveResponseExample } from '../utils/responseOverrides';
import { buildRequestOverridesPayload } from '../utils/requestOverrides';
import { tryParseJson } from '@/components/ResponseDocumentPanel';
import {
  ensureHandlerScriptValid,
  formatHandlerDiagnostics,
} from '../utils/handlerTypeCheckClient';
import { normalizeHandlerBody } from '../utils/handlerEditorShell';

const DEFAULT_OPERATION = 'find';

const ApiServiceCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const [form] = ProForm.useForm<ApiServiceFormValues>();

  const [operationCatalog, setOperationCatalog] = useState<API.ApiServiceOperationMeta[]>([]);
  const [definitionScript, setDefinitionScript] = useState('');
  const [handlerScript, setHandlerScript] = useState('');
  const [requestParameterInterface, setRequestParameterInterface] = useState('');
  const [requestExampleText, setRequestExampleText] = useState('{}');
  const [responsesSchemaText, setResponsesSchemaText] = useState('{}');
  const [responseExampleText, setResponseExampleText] = useState('{}');
  const [submitting, setSubmitting] = useState(false);

  const primaryOperation = Form.useWatch('primaryOperation', form);
  const scopeCode = Form.useWatch('scopeCode', form);
  const serviceSlug = Form.useWatch('serviceSlug', form);
  const scriptMode = Form.useWatch('scriptMode', form) || 'sql';

  const definitionScriptRef = useRef(definitionScript);
  definitionScriptRef.current = definitionScript;
  const handlerScriptRef = useRef(handlerScript);
  handlerScriptRef.current = handlerScript;
  const requestParameterInterfaceRef = useRef(requestParameterInterface);
  requestParameterInterfaceRef.current = requestParameterInterface;
  const requestExampleTextRef = useRef(requestExampleText);
  requestExampleTextRef.current = requestExampleText;
  const { references } = useChatReference();

  const entityCodeFromRefs = useMemo(() => {
    const entityRef = references.find((r: { type?: string }) => r.type === 'entity');
    return (entityRef?.content as { code?: string } | undefined)?.code;
  }, [references]);

  const formEntityCode = Form.useWatch('entityCode', form);
  const formEntityId = Form.useWatch('entityId', form);
  const [entityFieldOutline, setEntityFieldOutline] = useState<
    Array<{ key: string; required?: boolean; type?: string }>
  >([]);

  useEffect(() => {
    let cancelled = false;
    const entityId = formEntityId ? String(formEntityId).trim() : '';
    if (!entityId) {
      setEntityFieldOutline([]);
      return undefined;
    }
    void getBusinessDataEntity(entityId)
      .then((res) => {
        if (cancelled) return;
        const entity = getApiData<API.BusinessDataEntity>(res);
        const fields = Array.isArray(entity?.fields) ? entity.fields : [];
        setEntityFieldOutline(
          fields
            .map((field) => {
              const key = String(field.fieldKey || '').trim();
              if (!key) return null;
              const columnInfo = (field.columnInfo || {}) as Record<string, unknown>;
              const typeorm = (field.typeormConfig || {}) as Record<string, unknown>;
              const required = columnInfo.nullable === false || typeorm.nullable === false;
              const rawType = String(columnInfo.type || typeorm.type || '').trim();
              return {
                key,
                ...(required ? { required: true } : {}),
                ...(rawType ? { type: rawType } : {}),
              };
            })
            .filter(Boolean) as Array<{ key: string; required?: boolean; type?: string }>,
        );
      })
      .catch(() => {
        if (!cancelled) setEntityFieldOutline([]);
      });
    return () => {
      cancelled = true;
    };
  }, [formEntityId]);
  const entityCodeForPreview = formEntityCode || entityCodeFromRefs;

  // Chat 引用实体时预填主实体 + Scope + 默认短名
  useEffect(() => {
    const entityRef = references.find((r: { type?: string }) => r.type === 'entity');
    if (!entityRef) return;
    const content = entityRef.content as { code?: string; label?: string; id?: string } | undefined;
    if (!content?.id || form.getFieldValue('entityId')) return;
    const op = String(form.getFieldValue('primaryOperation') || DEFAULT_OPERATION);
    const autoSlug = content.code ? suggestServiceSlugFromEntity(content.code, op) : '';
    form.setFieldsValue({
      entityId: content.id,
      entityCode: content.code,
      entityLabel: content.label,
      ...(content.code
        ? { scopeCode: scopeCodeFromEntityCode(content.code) }
        : {}),
      ...(autoSlug ? { serviceSlug: autoSlug } : {}),
    });
  }, [references, form]);

  useEffect(() => {
    const preview = buildOperationResponsePreview(
      primaryOperation,
      entityCodeForPreview,
      requestParameterInterface,
    );
    if (!preview) return;
    setResponsesSchemaText(JSON.stringify(preview.responsesSchema, null, 2));
    setResponseExampleText(JSON.stringify(preview.responseExample, null, 2));
    setRequestExampleText(JSON.stringify(buildDefaultRequestExample(requestParameterInterface), null, 2));
  }, [primaryOperation, entityCodeForPreview, requestParameterInterface]);

  const previewCode = useMemo(() => {
    const scope = String(scopeCode || '').trim();
    const slug = String(serviceSlug || '').trim();
    if (!scope || !slug) return '';
    return `${scope}:${slug}`;
  }, [scopeCode, serviceSlug]);

  const chatPrompts = useMemo(
    () =>
      buildApiServiceCreatePrompts(references, {
        primaryOperation,
        hasDefinitionScript: Boolean(
          scriptMode === 'typescript' ? handlerScript.trim() : definitionScript.trim(),
        ),
        serviceCode: previewCode || undefined,
      }),
    [references, primaryOperation, definitionScript, handlerScript, scriptMode, previewCode],
  );

  useAIChatPrompts(chatPrompts);

  useAISurface({
    id: 'api-services.create',
    domain: 'bizdata',
    label: '新建 API 服务',
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
        scopeCode: values.scopeCode,
        serviceSlug: values.serviceSlug,
        code: previewCode || values.scopeCode,
        name: values.name,
        description: values.description,
        tags: values.tags,
        primaryOperation: values.primaryOperation,
        scriptMode: values.scriptMode,
        entityId: values.entityId,
        entityCode: values.entityCode,
        entityLabel: values.entityLabel,
        fields: entityFieldOutline.slice(0, 40),
        resolvedConnection: values.resolvedConnectionId
          ? {
              connectionId: values.resolvedConnectionId,
              connectionName: values.resolvedConnectionName,
              dbType: values.resolvedDbType,
              targetSchema: values.resolvedTargetSchema,
            }
          : undefined,
        targetSchema: values.resolvedTargetSchema,
        definitionScript: definitionScriptRef.current,
        handlerScript: handlerScriptRef.current,
        requestParameterInterface: requestParameterInterfaceRef.current,
        requestExampleText: requestExampleTextRef.current,
        accessRestriction: buildAccessRestrictionPayload(values),
        chatReferences: { scopes: scopeRefs, entities: entityRefs },
      };
    },
    applyMutation: (mutation: any) => {
      if (mutation.type === 'apiservice.created') {
        const id = mutation.resourceId
          || (mutation.payload as API.ApiService | undefined)?.id;
        if (id) {
          navigate(`/api_services/${id}/edit`);
        }
        return;
      }
      if (mutation.type === 'apiservice.batch_created') {
        const created = (mutation.payload as { created?: API.ApiService[] } | undefined)?.created;
        const firstId = created?.find((item) => item.id)?.id;
        if (firstId) {
          navigate(`/api_services/${firstId}/edit`);
        }
      }
    },
    matchMutation: (mutation: any) =>
      mutation.domain === 'bizdata'
      && (mutation.type === 'apiservice.created' || mutation.type === 'apiservice.batch_created'),
  });

  useEffect(() => {
    void getApiServiceOperationCatalog().then((res) => {
      const data = getApiData<API.ApiServiceOperationMeta[]>(res);
      if (isApiSuccess(res) && data) setOperationCatalog(data);
    });
  }, []);

  const submit = async (publishAfterCreate: boolean) => {
    const values = await form.validateFields();
    const operation = String(values.primaryOperation || '').trim();
    if (!operation) {
      message.error('请选择主操作类型');
      return;
    }

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
      entityCodeForPreview,
      requestParameterInterface,
    );
    if (!requestExampleParsed.ok) {
      message.error(`请求 Example JSON 无效：${requestExampleParsed.error}`);
      return;
    }

    if ((values.scriptMode || 'sql') === 'typescript') {
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
      const createRes = await postApiService({
        scopeCode: values.scopeCode || scopeCodeFromEntityCode(values.entityCode),
        serviceSlug: values.serviceSlug,
        name: String(values.name || '').trim(),
        description: String(values.description || '').trim() || undefined,
        tags: values.tags || [],
        scriptMode: values.scriptMode || 'sql',
        entityId: values.entityId,
        connectionId: values.resolvedConnectionId,
        targetSchema: values.resolvedTargetSchema,
        definitionScript: values.scriptMode === 'typescript' ? undefined : definitionScript.trim() || undefined,
        handlerScript: values.scriptMode === 'typescript'
          ? normalizeHandlerBody(handlerScript).trim() || undefined
          : undefined,
        requestParameterInterface: requestParameterInterface.trim() || undefined,
        responseOverrides: buildResponseOverridesPayload(
          operation,
          schemaParsed.value as Record<string, unknown>,
          sanitizedResponseExample,
        ),
        requestOverrides: buildRequestOverridesPayload(operation, requestExampleParsed.value),
        accessRestriction: buildAccessRestrictionPayload(values),
        enabledOperations: [operation],
        transportProtocols: values.transportProtocols,
      });

      if (!isApiSuccess(createRes)) {
        message.error(getApiErrorMessage(createRes, '创建失败'));
        return;
      }

      const created = getApiData<API.ApiService>(createRes);
      if (publishAfterCreate && created?.id) {
        const pubRes = await postApiServicePublish(created.id);
        if (!isApiSuccess(pubRes)) {
          message.warning(getApiErrorMessage(pubRes, '已创建 draft，但发布失败'));
        } else {
          message.success('API 服务已创建并发布');
          navigate('/api_services/list');
          return;
        }
      } else {
        message.success('API 服务已创建（draft）');
      }
      navigate('/api_services/list');
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) return;
      message.error(getApiErrorMessage(error, '创建失败'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FixHeaderPage
      title={<PageContainerTitleWithBack title="新建 API 服务" />}
      centerSlot={<ApiServiceSectionNav />}
      extra={
        <Space>
          <Button loading={submitting} onClick={() => void submit(false)}>
            保存为草稿
          </Button>
          <Button type="primary" loading={submitting} onClick={() => void submit(true)}>
            保存并发布
          </Button>
        </Space>
      }
    >
      <ProForm
        form={form}
        submitter={false}
        layout="vertical"
        initialValues={{
          primaryOperation: DEFAULT_OPERATION,
          accessRestrictionMode: 'none',
          scriptMode: 'sql',
          transportProtocols: ['http'],
        }}
      >
        <ApiServiceForm
          form={form}
          mode="create"
          operationCatalog={operationCatalog}
          definitionScript={definitionScript}
          onDefinitionScriptChange={setDefinitionScript}
          handlerScript={handlerScript}
          onHandlerScriptChange={(value) => setHandlerScript(normalizeHandlerBody(value))}
          requestParameterInterface={requestParameterInterface}
          onRequestParameterInterfaceChange={setRequestParameterInterface}
          requestExampleText={requestExampleText}
          onRequestExampleTextChange={setRequestExampleText}
          responsesSchemaText={responsesSchemaText}
          onResponsesSchemaTextChange={setResponsesSchemaText}
          responseExampleText={responseExampleText}
          onResponseExampleTextChange={setResponseExampleText}
        />
      </ProForm>
    </FixHeaderPage>
  );
};

export default ApiServiceCreatePage;
