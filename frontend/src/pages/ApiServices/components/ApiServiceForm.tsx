import Editor from '@monaco-editor/react';
import { ProForm, ProFormCheckbox, ProFormRadio, ProFormSelect, ProFormText, ProFormTextArea } from '@ant-design/pro-components';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Form, Popover, Row, Segmented, Select, Spin, Tag, Tooltip, Typography } from 'antd';
import type { FormInstance } from 'antd';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import TitleWithHelp from '@/components/TitleWithHelp';
import HandlerSdkHelpModalContent from './HandlerSdkHelpModalContent';
import AntdTagInput from '@/components/AntdTagInput';
import OperationParameterPanel, {
  isQueryOnlyMethod,
  type ParameterRow,
} from '@/components/OperationParameterPanel';
import ResponseDocumentEditor, { tryParseJson } from '@/components/ResponseDocumentPanel';
import ApiServiceEntityLookup, {
  type ApiServiceEntityLookupValue,
} from './ApiServiceEntityLookup';
import DepartmentLookup from './DepartmentLookup';
import {
  scopeCodeFromEntityCode,
  suggestServiceSlugFromEntity,
} from '../ai/apiServiceCodeUtils';
import { useRoleOptions } from '@/hooks/useRoleOptions';
import { postApiServiceResolveConnection } from '@/services/EADAF/api/apiServices';
import { getApiData, getApiErrorMessage, isApiSuccess } from '@/utils/apiResponse';
import {
  API_SERVICE_TRANSPORT_OPTIONS,
  buildTransportEndpointPreview,
  normalizeTransportProtocols,
  type ApiServiceTransportProtocol,
} from '../utils/apiServiceTransport';
import {
  appendFieldsToInterface,
  extractHandlerParams,
  guessHandlerParamTsType,
} from '../utils/extractHandlerParams';
import {
  buildParameterRowsFromInterface,
  collectEnumCodesFromInterface,
  ensureExampleValues,
  loadEnumOptionsByCodes,
  type EnumOptionsByCode,
} from '../utils/buildParameterRowsFromInterface';
import { parseInterfaceFields, parseNestedInterfaceFields } from '../utils/parseInterfaceFields';
import { buildOperationResponsePreview } from '../utils/buildOperationResponsePreview';
import {
  buildParamsAmbientDts,
  formatHandlerDiagnostics,
  loadHandlerSdkDts,
} from '../utils/handlerTypeCheckClient';
import {
  buildHandlerBodyRestriction,
  normalizeHandlerBody,
  wrapHandlerBodyForEditor,
} from '../utils/handlerEditorShell';
import { constrainedEditor } from 'constrained-editor-plugin';
import './ApiServiceForm.css';

const { Text } = Typography;

const PARAM_INTERFACE_HELP = (
  <div style={{ maxWidth: 400 }}>
    <p style={{ margin: '0 0 8px' }}>
      设计期在此声明参数结构（唯一真相源）。请求参数 Example / 测试页仅当参数类型连接到枚举时才渲染 Select。
    </p>
    <p style={{ margin: '0 0 8px' }}>
      枚举连接（推荐）：
      <Text code>type StatusType = getADBEnumByCode&lt;&quot;fmms:Xxx&quot;&gt;;</Text>
      {' '}再写 <Text code>status?: StatusType</Text> 或 <Text code>StatusType[]</Text>（多选）。
      须用泛型尖括号，不能写成函数调用 <Text code>getADBEnumByCode(&quot;...&quot;)</Text>。
    </p>
    <p style={{ margin: '0 0 8px' }}>
      文件字段标注 <Text code>@file</Text>（storage objectId / UUID）。
    </p>
    <p style={{ margin: 0 }}>
      必填字段不要写 <Text code>?</Text>，Example 面板会显示 <Text code>*</Text>。
    </p>
  </div>
);

const GET_PARAM_EXAMPLE_HELP = (
  <div style={{ maxWidth: 360 }}>
    <p style={{ margin: 0 }}>
      左侧 interface 决定参数结构（控件类型）；此处为「请求参数 Example」示例值（与测试页同源），可在默认值上修改。
      Example 不应为空；未填时会按类型生成默认值（如 boolean→false）。
    </p>
  </div>
);

const SQL_SCRIPT_HELP = (
  <div style={{ maxWidth: 360 }}>
    <p style={{ margin: 0 }}>编写 SQL；命名参数可用 :limit、:skip 及自定义 :paramName。</p>
  </div>
);

const HANDLER_SCRIPT_HELP = <HandlerSdkHelpModalContent />;

const TRANSPORT_HELP = (
  <div style={{ maxWidth: 380 }}>
    <p style={{ margin: '0 0 8px' }}>可同时启用多种访问协议，至少选择一种。</p>
    <ul style={{ margin: 0, paddingLeft: 18 }}>
      <li><Text strong>HTTP REST</Text>：常规 REST 调用</li>
      <li><Text strong>SSE</Text>：读操作流式推送（find/count 等）</li>
      <li><Text strong>WebSocket</Text>：双向 JSON 消息，适合实时交互</li>
    </ul>
  </div>
);

const RESPONSE_SCHEMA_HELP = (
  <div style={{ maxWidth: 360 }}>
    <p style={{ margin: 0 }}>
      Responses Schema 与 Example（JSON）分开维护；Schema 中可用 $refEntity 引用数据模型实体（如 @web:user）。
    </p>
  </div>
);

const CATEGORY_LABEL: Record<string, string> = {
  read: '读操作',
  create: '写操作（增）',
  update: '写操作（改）',
  delete: '写操作（删）',
  aggregate: '聚合统计',
};

const SQL_PLACEHOLDER = `-- 在此编写服务 SQL，可跨多张物化表 JOIN、聚合、子查询
-- 命名参数示例：WHERE o.status = :status LIMIT :limit OFFSET :skip`;

const PARAM_INTERFACE_PLACEHOLDER = `type StatusType = getADBEnumByCode<"fmms:WorkCardStatus">;

interface RequestParams {
  /** 分页条数 */
  limit?: number;
  skip?: number;
  /** 工卡状态（单选） */
  status?: StatusType;
  /** 文件字段须填 storage objectId（UUID） */
  avatarId?: string; // @file storage objectId
}`;

const REQUEST_EXAMPLE_PLACEHOLDER = `{
  "limit": 10,
  "skip": 0,
  "nearest_only": false
}`;

const CODE_SEGMENT_RE = /^[A-Za-z][A-Za-z0-9_]*$/;

function codeToRoutePath(code: string) {
  return code.trim().split(':').join('/');
}

function buildPreviewCode(scopeCode?: string, serviceSlug?: string) {
  const scope = String(scopeCode || '').trim();
  const slug = String(serviceSlug || '').trim();
  if (!scope || !slug || !CODE_SEGMENT_RE.test(slug)) return '';
  return `${scope}:${slug}`;
}

function sampleValueForInterfaceField(field: { name: string; type?: string; isArray?: boolean }) {
  const type = String(field.type || '').toLowerCase();
  const name = field.name;
  if (name === 'id') return '00000000-0000-4000-8000-000000000001';
  if (name === 'limit') return 10;
  if (name === 'skip' || name === 'offset') return 0;
  if (type.includes('number')) return 0;
  if (type.includes('boolean')) return false;
  if (field.isArray || type.includes('[]') || type.includes('array')) return [];
  if (type.includes('object') || type.includes('record')) return {};
  return name ? `sample_${name}` : '';
}

export function buildDefaultRequestExample(interfaceText?: string) {
  const fields = parseInterfaceFields(interfaceText);
  if (!fields.length) return {};
  const result: Record<string, unknown> = {};
  fields.forEach((field) => {
    result[field.name] = sampleValueForInterfaceField(field);
  });
  // create/update 的 body/set 内联对象：填充嵌套示例，避免 body: {}
  (['body', 'set'] as const).forEach((container) => {
    if (!(container in result)) return;
    const nested = parseNestedInterfaceFields(interfaceText, container);
    if (!nested.length) return;
    const nestedExample: Record<string, unknown> = {};
    nested.forEach((field) => {
      nestedExample[field.name] = sampleValueForInterfaceField(field);
    });
    result[container] = nestedExample;
  });
  return result;
}

export type ApiServiceAccessRestrictionMode = 'none' | 'role' | 'department';

export type ApiServiceFormValues = {
  primaryOperation?: string;
  scopeCode?: string;
  serviceSlug?: string;
  name?: string;
  description?: string;
  tags?: string[];
  transportProtocols?: ApiServiceTransportProtocol[];
  accessRestrictionMode?: ApiServiceAccessRestrictionMode;
  roleIds?: string[];
  departmentIds?: string[];
  scriptMode?: 'sql' | 'typescript';
  /** 主实体（驱动连接 / Schema 推断） */
  entityId?: string;
  entityCode?: string;
  entityLabel?: string;
  /** 推断结果（只读展示 / 提交用） */
  resolvedConnectionId?: string;
  resolvedConnectionName?: string;
  resolvedDbType?: string;
  resolvedTargetSchema?: string;
};

export type ApiServiceFormProps = {
  form: FormInstance<ApiServiceFormValues>;
  mode: 'create' | 'edit';
  operationCatalog: API.ApiServiceOperationMeta[];
  definitionScript: string;
  onDefinitionScriptChange: (value: string) => void;
  handlerScript: string;
  onHandlerScriptChange: (value: string) => void;
  requestParameterInterface: string;
  onRequestParameterInterfaceChange: (value: string) => void;
  requestExampleText: string;
  onRequestExampleTextChange: (value: string) => void;
  readonlyCode?: string;
  /** @deprecated 主实体已改为表单字段 entityId；保留作初始回填兼容 */
  entityId?: string;
  entityCode?: string;
  responsesSchemaText: string;
  onResponsesSchemaTextChange: (value: string) => void;
  responseExampleText: string;
  onResponseExampleTextChange: (value: string) => void;
};

const ApiServiceForm: React.FC<ApiServiceFormProps> = ({
  form,
  mode,
  operationCatalog,
  definitionScript,
  onDefinitionScriptChange,
  handlerScript,
  onHandlerScriptChange,
  requestParameterInterface,
  onRequestParameterInterfaceChange,
  requestExampleText,
  onRequestExampleTextChange,
  readonlyCode,
  entityId: entityIdProp,
  entityCode: entityCodeProp,
  responsesSchemaText,
  onResponsesSchemaTextChange,
  responseExampleText,
  onResponseExampleTextChange,
}) => {
  const { roleOptions, roleOptionsLoading } = useRoleOptions();
  const scopeCode = Form.useWatch('scopeCode', form);
  const serviceSlug = Form.useWatch('serviceSlug', form);
  const formEntityId = Form.useWatch('entityId', form);
  const formEntityCode = Form.useWatch('entityCode', form);
  const formEntityLabel = Form.useWatch('entityLabel', form);
  const accessRestrictionMode = Form.useWatch('accessRestrictionMode', form);
  const scriptMode = Form.useWatch('scriptMode', form) || 'sql';
  const transportProtocols = Form.useWatch('transportProtocols', form) as ApiServiceTransportProtocol[] | undefined;
  const primaryOperation = Form.useWatch('primaryOperation', form);

  const entityId = formEntityId || entityIdProp;
  const entityCode = formEntityCode || entityCodeProp;

  const entityLookupValue = useMemo<ApiServiceEntityLookupValue | null>(() => {
    if (!entityId) return null;
    return {
      entityId,
      entityCode: entityCode || entityId,
      entityLabel: formEntityLabel,
    };
  }, [entityId, entityCode, formEntityLabel]);

  const [resolvedConnection, setResolvedConnection] = useState<API.ApiServiceResolvedConnection | null>(null);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  /** 用户是否手动改过服务短名；未改时随主实体/主操作自动填充 */
  const [serviceSlugDirty, setServiceSlugDirty] = useState(mode === 'edit');
  const [handlerDiagnosticsText, setHandlerDiagnosticsText] = useState<string | null>(null);
  /** enumCode → options（interface 声明的 getADBEnumByCode） */
  const [enumOptionsByCode, setEnumOptionsByCode] = useState<EnumOptionsByCode>({});
  const monacoRef = React.useRef<any>(null);
  const handlerEditorRef = React.useRef<any>(null);
  const constrainedRef = React.useRef<ReturnType<typeof constrainedEditor> | null>(null);
  const applyingExternalHandlerRef = React.useRef(false);

  const handlerDisplayValue = useMemo(
    () => wrapHandlerBodyForEditor(handlerScript),
    [handlerScript],
  );

  const applyHandlerRestrictions = useCallback((editor: any, fullText: string) => {
    const model = editor?.getModel?.();
    const constrained = constrainedRef.current;
    if (!model || !constrained) return;
    try {
      constrained.removeRestrictionsIn(model);
    } catch {
      // model may not yet have restrictions
    }
    constrained.addRestrictionsTo(model, [buildHandlerBodyRestriction(fullText)]);
  }, []);

  const applyMonacoLibs = useCallback(async (monaco: any, ifaceText: string) => {
    const tsDefaults = monaco.languages.typescript.typescriptDefaults;
    tsDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      noEmit: true,
      strict: false,
      noImplicitAny: false,
    });
    tsDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    });
    const sdkDts = await loadHandlerSdkDts();
    tsDefaults.addExtraLib(sdkDts || 'declare function db(entityCode?: string): any;\ndeclare const params: any;\ndeclare const ctx: any;\ndeclare interface HandlerContext { [key: string]: unknown }', 'file:///eadaf-handler-sdk.d.ts');
    tsDefaults.addExtraLib(buildParamsAmbientDts(ifaceText), 'file:///eadaf-handler-params.d.ts');
  }, []);

  const handleIfaceEditorBeforeMount = useCallback((monaco: any) => {
    const tsDefaults = monaco.languages.typescript.typescriptDefaults;
    tsDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      noEmit: true,
      strict: false,
      noImplicitAny: false,
    });
    tsDefaults.addExtraLib(
      'type getADBEnumByCode<_Code extends string = string> = string;\n',
      'file:///eadaf-adb-enum.d.ts',
    );
  }, []);

  const handleHandlerEditorBeforeMount = useCallback((monaco: any) => {
    monacoRef.current = monaco;
    void applyMonacoLibs(monaco, requestParameterInterface);
  }, [applyMonacoLibs, requestParameterInterface]);

  const handleHandlerEditorMount = useCallback((editor: any, monaco: any) => {
    handlerEditorRef.current = editor;
    monacoRef.current = monaco;
    const constrained = constrainedEditor(monaco);
    constrained.initializeIn(editor);
    constrainedRef.current = constrained;
    const fullText = editor.getModel()?.getValue() || wrapHandlerBodyForEditor(handlerScript);
    applyHandlerRestrictions(editor, fullText);
    const range = buildHandlerBodyRestriction(fullText).range;
    editor.setPosition({ lineNumber: range[0], column: Math.min(3, range[3] || 1) });
  }, [applyHandlerRestrictions, handlerScript]);

  useEffect(() => {
    if (!monacoRef.current || scriptMode !== 'typescript') return;
    void applyMonacoLibs(monacoRef.current, requestParameterInterface);
  }, [requestParameterInterface, scriptMode, applyMonacoLibs]);

  // 外部（AI / 加载）更新 body 时，同步编辑器并重建锁定区间（按 body 比较，避免缩进往返抖动）
  useEffect(() => {
    if (scriptMode !== 'typescript') return;
    const editor = handlerEditorRef.current;
    const model = editor?.getModel?.();
    if (!editor || !model) return;
    const currentBody = normalizeHandlerBody(model.getValue());
    const nextBody = normalizeHandlerBody(handlerScript);
    if (currentBody === nextBody) return;
    const next = wrapHandlerBodyForEditor(nextBody);
    applyingExternalHandlerRef.current = true;
    model.setValue(next);
    applyingExternalHandlerRef.current = false;
    applyHandlerRestrictions(editor, next);
  }, [handlerScript, scriptMode, applyHandlerRestrictions]);

  const handleHandlerEditorChange = useCallback((val?: string) => {
    if (applyingExternalHandlerRef.current) return;
    const body = normalizeHandlerBody(val ?? '');
    onHandlerScriptChange(body);
  }, [onHandlerScriptChange]);

  useEffect(() => {
    if (scriptMode !== 'typescript') {
      setHandlerDiagnosticsText(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const { ensureHandlerScriptValid } = await import('../utils/handlerTypeCheckClient');
      const body = normalizeHandlerBody(handlerScript);
      const result = await ensureHandlerScriptValid(body, requestParameterInterface);
      if (cancelled) return;
      if (!result) {
        setHandlerDiagnosticsText(null);
        return;
      }
      setHandlerDiagnosticsText(formatHandlerDiagnostics(result.diagnostics));
    }, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [scriptMode, handlerScript, requestParameterInterface]);

  const operationSelectOptions = useMemo(() => {
    const groups = new Map<string, API.ApiServiceOperationMeta[]>();
    operationCatalog.forEach((item) => {
      const key = item.category || 'read';
      const list = groups.get(key) || [];
      list.push(item);
      groups.set(key, list);
    });
    return Array.from(groups.entries()).map(([category, items]) => ({
      label: CATEGORY_LABEL[category] || category,
      options: items.map((item) => ({
        label: item.label || item.operation,
        value: item.operation,
      })),
    }));
  }, [operationCatalog]);

  const previewCode = useMemo(() => {
    if (mode === 'edit' && readonlyCode) return readonlyCode;
    return buildPreviewCode(scopeCode, serviceSlug);
  }, [mode, readonlyCode, scopeCode, serviceSlug]);

  useEffect(() => {
    if (!scopeCode && !entityId) {
      setResolvedConnection(null);
      setResolveError(null);
      form.setFieldsValue({
        resolvedConnectionId: undefined,
        resolvedConnectionName: undefined,
        resolvedDbType: undefined,
        resolvedTargetSchema: undefined,
      });
      return;
    }

    let cancelled = false;
    (async () => {
      setResolveLoading(true);
      setResolveError(null);
      try {
        const res = await postApiServiceResolveConnection({
          scopeCode: scopeCode || undefined,
          entityId: entityId || undefined,
        });
        if (cancelled) return;
        if (!isApiSuccess(res)) {
          setResolvedConnection(null);
          form.setFieldsValue({
            resolvedConnectionId: undefined,
            resolvedConnectionName: undefined,
            resolvedDbType: undefined,
            resolvedTargetSchema: undefined,
          });
          setResolveError(getApiErrorMessage(res, '无法推断数据库连接'));
          return;
        }
        const data = getApiData<API.ApiServiceResolvedConnection>(res) || null;
        setResolvedConnection(data);
        form.setFieldsValue({
          resolvedConnectionId: data?.connectionId,
          resolvedConnectionName: data?.connectionName,
          resolvedDbType: data?.dbType,
          resolvedTargetSchema: data?.targetSchema,
        });
      } catch (error) {
        if (!cancelled) {
          setResolvedConnection(null);
          form.setFieldsValue({
            resolvedConnectionId: undefined,
            resolvedConnectionName: undefined,
            resolvedDbType: undefined,
            resolvedTargetSchema: undefined,
          });
          setResolveError(getApiErrorMessage(error, '无法推断数据库连接'));
        }
      } finally {
        if (!cancelled) setResolveLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [scopeCode, entityId, form]);

  const handlePrimaryEntityChange = useCallback(
    (next?: ApiServiceEntityLookupValue) => {
      if (!next?.entityId) {
        form.setFieldsValue({
          entityId: undefined,
          entityCode: undefined,
          entityLabel: undefined,
          scopeCode: undefined,
        });
        return;
      }
      const derivedScope = scopeCodeFromEntityCode(next.entityCode);
      const op = String(form.getFieldValue('primaryOperation') || 'find');
      const autoSlug = suggestServiceSlugFromEntity(next.entityCode, op);
      setServiceSlugDirty(false);
      form.setFieldsValue({
        entityId: next.entityId,
        entityCode: next.entityCode,
        entityLabel: next.entityLabel,
        scopeCode: derivedScope,
        ...(autoSlug ? { serviceSlug: autoSlug } : {}),
      });
    },
    [form],
  );

  // 主操作变化且短名未手动改过时，按「实体末段 + Create/Find…」重填
  useEffect(() => {
    if (serviceSlugDirty) return;
    if (!entityCode || !primaryOperation) return;
    const autoSlug = suggestServiceSlugFromEntity(entityCode, primaryOperation);
    if (!autoSlug) return;
    if (form.getFieldValue('serviceSlug') === autoSlug) return;
    form.setFieldsValue({ serviceSlug: autoSlug });
  }, [entityCode, primaryOperation, serviceSlugDirty, form]);

  const scriptHelp = scriptMode === 'typescript' ? HANDLER_SCRIPT_HELP : SQL_SCRIPT_HELP;

  const endpointPreview = useMemo(() => {
    const routePath = previewCode ? previewCode.split(':').join('/') : '';
    const protocols = normalizeTransportProtocols(transportProtocols);
    return buildTransportEndpointPreview(routePath, protocols);
  }, [previewCode, transportProtocols]);

  const operationMeta = useMemo(
    () => operationCatalog.find((item) => item.operation === primaryOperation),
    [operationCatalog, primaryOperation],
  );
  const httpMethod = operationMeta?.httpMethod;
  const routePattern = operationMeta?.routePattern || '';
  const isGetOperation = isQueryOnlyMethod(httpMethod);

  const neededEnumCodes = useMemo(
    () => collectEnumCodesFromInterface(requestParameterInterface),
    [requestParameterInterface],
  );

  const neededEnumCodesKey = useMemo(
    () => neededEnumCodes.slice().sort().join('|'),
    [neededEnumCodes],
  );

  useEffect(() => {
    let cancelled = false;
    if (!neededEnumCodes.length) {
      setEnumOptionsByCode({});
      return undefined;
    }
    void (async () => {
      try {
        const next = await loadEnumOptionsByCodes(neededEnumCodes);
        if (!cancelled) setEnumOptionsByCode(next);
      } catch {
        if (!cancelled) setEnumOptionsByCode({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [neededEnumCodesKey]);

  const previewParameterRows = useMemo<ParameterRow[]>(
    () =>
      buildParameterRowsFromInterface({
        interfaceText: requestParameterInterface,
        httpMethod,
        routePattern,
        enumOptionsByCode,
      }),
    [requestParameterInterface, httpMethod, routePattern, enumOptionsByCode],
  );

  const handlerMissingInterfaceFields = useMemo(() => {
    if (scriptMode !== 'typescript') return [];
    const body = normalizeHandlerBody(handlerScript);
    const declared = new Set(parseInterfaceFields(requestParameterInterface).map((f) => f.name));
    return extractHandlerParams(body).filter((name) => !declared.has(name));
  }, [scriptMode, handlerScript, requestParameterInterface]);

  const handleAppendHandlerParamsToInterface = useCallback(() => {
    if (!handlerMissingInterfaceFields.length) return;
    const next = appendFieldsToInterface(
      requestParameterInterface,
      handlerMissingInterfaceFields.map((name) => ({
        name,
        type: guessHandlerParamTsType(name),
      })),
    );
    onRequestParameterInterfaceChange(next);
  }, [
    handlerMissingInterfaceFields,
    requestParameterInterface,
    onRequestParameterInterfaceChange,
  ]);

  const responsePreview = useMemo(
    () => buildOperationResponsePreview(primaryOperation, entityCode, requestParameterInterface),
    [primaryOperation, entityCode, requestParameterInterface],
  );

  const requestExampleError = useMemo(() => {
    if (isGetOperation) return null;
    const parsed = tryParseJson(requestExampleText);
    return parsed.ok ? null : parsed.error;
  }, [requestExampleText, isGetOperation]);

  const requestExampleValues = useMemo(() => {
    const parsed = tryParseJson(requestExampleText);
    const current =
      parsed.ok && parsed.value && typeof parsed.value === 'object' && !Array.isArray(parsed.value)
        ? (parsed.value as Record<string, unknown>)
        : {};
    // Example 基于 interface 结构补齐，避免空对象
    return ensureExampleValues(previewParameterRows, current);
  }, [requestExampleText, previewParameterRows]);

  // interface / 枚举就绪后，若 Example 仍为空则写回默认 Example
  useEffect(() => {
    if (!isGetOperation || !previewParameterRows.length) return;
    const parsed = tryParseJson(requestExampleText);
    const current =
      parsed.ok && parsed.value && typeof parsed.value === 'object' && !Array.isArray(parsed.value)
        ? (parsed.value as Record<string, unknown>)
        : {};
    const ensured = ensureExampleValues(previewParameterRows, current);
    if (JSON.stringify(ensured) === JSON.stringify(current)) return;
    if (Object.keys(current).length === 0) {
      onRequestExampleTextChange(JSON.stringify(ensured, null, 2));
    }
  }, [
    isGetOperation,
    previewParameterRows,
    requestExampleText,
    onRequestExampleTextChange,
  ]);

  const handleRequestExampleValuesChange = useCallback(
    (values: Record<string, unknown>) => {
      onRequestExampleTextChange(JSON.stringify(values, null, 2));
    },
    [onRequestExampleTextChange],
  );

  return (
    <div className="api-service-form">
      {/* 信息 */}
      <section id="api-service-section-info" className="api-service-form__section">
        <h3 className="api-service-form__section-title">信息</h3>

        <Card style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="主操作类型" required>
                <div className="api-service-form__operation-row">
                  <Form.Item
                    name="primaryOperation"
                    rules={[{ required: true, message: '请选择主操作类型' }]}
                    noStyle
                  >
                    <Select
                      showSearch
                      allowClear
                      placeholder="选择 API 主操作（find / aggregate / create 等）"
                      optionFilterProp="label"
                      options={operationSelectOptions}
                      className="api-service-form__operation-select"
                    />
                  </Form.Item>
                  {httpMethod ? (
                    <>
                      <Tag color={isGetOperation ? 'blue' : 'green'} className="api-service-form__operation-tag">
                        {httpMethod}
                      </Tag>
                      <Tooltip
                        title={
                          isGetOperation
                            ? 'GET 请求：参数通过 URL query string 传递，运行时不会读取 request body'
                            : `${httpMethod} 请求：参数通过 request body（application/json）传递`
                        }
                      >
                        <QuestionCircleOutlined className="api-service-form__operation-help-icon" />
                      </Tooltip>
                    </>
                  ) : null}
                </div>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="主实体"
                required
                tooltip="必选。按该实体物化记录推断连接与 Schema；服务短名/code 默认由其推导"
              >
                <ApiServiceEntityLookup
                  value={entityLookupValue}
                  onChange={handlePrimaryEntityChange}
                />
              </Form.Item>
              <Form.Item
                name="entityId"
                hidden
                rules={[{ required: true, message: '请选择主实体' }]}
              >
                <input />
              </Form.Item>
              <Form.Item name="entityCode" hidden>
                <input />
              </Form.Item>
              <Form.Item name="entityLabel" hidden>
                <input />
              </Form.Item>
              <Form.Item name="scopeCode" hidden>
                <input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <ProFormText
                label={
                  <span className="api-service-form__service-slug-label">
                    服务短名
                    {previewCode ? (
                      <Popover
                        trigger={['hover', 'click']}
                        content={
                          <div className="api-service-form__code-popover">
                            <div>
                              服务 code：<Text code>{previewCode}</Text>
                            </div>
                            <div>
                              路径：<Text code>/api/v1/data/{codeToRoutePath(previewCode)}</Text>
                            </div>
                          </div>
                        }
                      >
                        <Tag className="api-service-form__code-tag">Code</Tag>
                      </Popover>
                    ) : null}
                  </span>
                }
                name="serviceSlug"
                rules={[
                  { required: mode === 'create', message: '请输入服务短名' },
                  {
                    pattern: CODE_SEGMENT_RE,
                    message: '须为字母开头且仅含字母数字下划线',
                  },
                ]}
                fieldProps={{
                  placeholder: 'ActualHoursStatsCreate',
                  onChange: () => setServiceSlugDirty(true),
                }}
                tooltip="默认=实体末段+主操作（如 Create/Find，首字母大写驼峰）；可改。code = Scope前缀:短名"
              />
            </Col>
            <Col span={12}>
              <ProFormText
                label="显示名称"
                name="name"
                placeholder="订单汇总 API"
                rules={[{ required: true, message: '请输入显示名称' }]}
              />
            </Col>
            <Col span={12}>
              <Form.Item label="标签" name="tags" tooltip="可输入多个标签，按回车确认">
                <AntdTagInput placeholder="report, readonly" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <ProFormTextArea
                label="备注 / 描述"
                name="description"
                placeholder="说明该 API 的业务用途、调用方、入参约定与注意事项"
                fieldProps={{ rows: 3, maxLength: 2000, showCount: true }}
                tooltip="对外文档与列表说明；建议写清谁调用、何时调用、create/update 等关键约定"
              />
            </Col>
            <Col span={24} style={{ marginTop: 8 }}>
              {resolveLoading && <Spin size="small" description="正在推断数据库连接…" />}
              {!resolveLoading && entityId && resolvedConnection && (
                <Text type="secondary">
                  将使用连接：{resolvedConnection.connectionName}
                  （{resolvedConnection.dbType}
                  {resolvedConnection.targetSchema
                    ? `，Schema：${resolvedConnection.targetSchema}`
                    : ''}
                  ，由主实体物化推断）
                  {scopeCode ? (
                    <>
                      {' · 域 '}
                      <Text code>{scopeCode}</Text>
                    </>
                  ) : null}
                </Text>
              )}
              {!resolveLoading && resolveError && (
                <Text type="danger">{resolveError}</Text>
              )}
            </Col>
            {endpointPreview.length > 0 ? (
              <Col span={24}>
                <div className="api-service-form__endpoint-preview">
                  {endpointPreview.map((item) => (
                    <div key={item.protocol} className="api-service-form__endpoint-preview-item">
                      <Tag color="blue">{item.label}</Tag>
                      <Text code copyable>{item.url}</Text>
                    </div>
                  ))}
                </div>
              </Col>
            ) : null}
          </Row>
        </Card>

        <Card title="API 访问限制" style={{ marginBottom: 16 }}>
          <ProFormRadio.Group
            name="accessRestrictionMode"
            label="访问策略"
            options={[
              { label: '无限制', value: 'none' },
              { label: '限制用户角色', value: 'role' },
              { label: '限制用户组织', value: 'department' },
            ]}
          />
          {accessRestrictionMode === 'role' && (
            <ProFormSelect
              name="roleIds"
              label="允许的角色"
              mode="multiple"
              rules={[{ required: true, message: '请选择至少一个角色' }]}
              options={roleOptions}
              fieldProps={{
                loading: roleOptionsLoading,
                placeholder: '选择可访问该 API 的角色',
              }}
            />
          )}
          {accessRestrictionMode === 'department' && (
            <Form.Item
              name="departmentIds"
              label="允许的组织"
              rules={[{ required: true, message: '请选择至少一个组织' }]}
            >
              <DepartmentLookup />
            </Form.Item>
          )}
          <Text type="secondary">测试页发送测试请求时默认绕过访问限制</Text>
        </Card>

        <Card
          title={<TitleWithHelp title="访问协议" help={TRANSPORT_HELP} />}
          style={{ marginBottom: 16 }}
        >
          <ProFormCheckbox.Group
            name="transportProtocols"
            rules={[
              {
                validator: (_, value) => {
                  const list = normalizeTransportProtocols(value as string[] | undefined);
                  return list.length ? Promise.resolve() : Promise.reject(new Error('至少选择一种访问协议'));
                },
              },
            ]}
            options={API_SERVICE_TRANSPORT_OPTIONS.map((item) => ({
              label: (
                <span>
                  {item.label}
                  <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                    {item.description}
                  </Text>
                </span>
              ),
              value: item.value,
            }))}
          />
        </Card>
      </section>

      {/* 请求 */}
      <section id="api-service-section-request" className="api-service-form__section">
        <h3 className="api-service-form__section-title">请求</h3>

        <Card style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col
              span={12}
              className={isGetOperation ? undefined : 'api-service-form__editor-split-left'}
            >
              <div className="api-service-form__request-col-title">
                <TitleWithHelp title="请求参数结构（TypeScript interface）" help={PARAM_INTERFACE_HELP} />
              </div>
              <Editor
                height="280px"
                language="typescript"
                value={requestParameterInterface}
                onChange={(val) => onRequestParameterInterfaceChange(val || '')}
                beforeMount={handleIfaceEditorBeforeMount}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  wordWrap: 'on',
                  placeholder: PARAM_INTERFACE_PLACEHOLDER,
                }}
              />
            </Col>
            <Col span={12}>
              {isGetOperation ? (
                <>
                  <div className="api-service-form__request-col-title">
                    <TitleWithHelp title="请求参数 Example（Query）" help={GET_PARAM_EXAMPLE_HELP} />
                  </div>
                  <div className="operation-parameter-panel--bounded">
                    <OperationParameterPanel
                      httpMethod={httpMethod}
                      parameters={previewParameterRows}
                      values={requestExampleValues}
                      onChange={handleRequestExampleValuesChange}
                      emptyText="暂无可识别的参数字段"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="api-service-form__request-col-title">请求参数 Example（JSON）</div>
                  {requestExampleError ? (
                    <Alert type="error" showIcon message={requestExampleError} style={{ marginBottom: 8 }} />
                  ) : null}
                  <Editor
                    height="280px"
                    language="json"
                    value={requestExampleText}
                    onChange={(val) => onRequestExampleTextChange(val || '')}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 13,
                      wordWrap: 'on',
                      placeholder: REQUEST_EXAMPLE_PLACEHOLDER,
                    }}
                  />
                </>
              )}
            </Col>
          </Row>
        </Card>
      </section>

      {/* 处理 */}
      <section id="api-service-section-process" className="api-service-form__section">
        <h3 className="api-service-form__section-title">处理</h3>

        <Card
          title={
            <TitleWithHelp
              title="服务脚本"
              help={scriptHelp}
              helpMode={scriptMode === 'typescript' ? 'modal' : 'popover'}
              modalTitle="TypeScript Handler SDK"
              modalWidth={760}
            />
          }
          style={{ marginBottom: 16 }}
          extra={
            <Form.Item name="scriptMode" noStyle>
              <Segmented
                options={[
                  { label: 'SQL', value: 'sql' },
                  { label: 'TypeScript Handler', value: 'typescript' },
                ]}
              />
            </Form.Item>
          }
        >
          {scriptMode === 'typescript' && handlerMissingInterfaceFields.length > 0 ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message="Handler 使用了未在「请求参数结构」中声明的参数"
              description={
                <span>
                  缺失：{handlerMissingInterfaceFields.map((n) => (
                    <Text code key={n} style={{ marginRight: 6 }}>{n}</Text>
                  ))}
                  。请补全 interface（推荐），否则参数面板 / OpenAPI / 测试 Example 不会展示这些字段。
                </span>
              }
              action={
                <Button size="small" type="primary" onClick={handleAppendHandlerParamsToInterface}>
                  补全到请求参数结构
                </Button>
              }
            />
          ) : null}
          {scriptMode === 'typescript' && handlerDiagnosticsText ? (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 12 }}
              message="Handler 语法/类型检查未通过"
              description={
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12 }}>
                  {handlerDiagnosticsText}
                </pre>
              }
            />
          ) : null}
          {scriptMode === 'typescript' ? (
            <Editor
              key={`handler-editor:${mode}:${readonlyCode || 'new'}`}
              height="360px"
              language="typescript"
              path="file:///eadaf-api-handler.ts"
              defaultValue={handlerDisplayValue}
              onChange={handleHandlerEditorChange}
              beforeMount={handleHandlerEditorBeforeMount}
              onMount={handleHandlerEditorMount}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                wordWrap: 'on',
              }}
            />
          ) : (
            <Editor
              height="320px"
              language="sql"
              value={definitionScript}
              onChange={(val) => onDefinitionScriptChange(val || '')}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                wordWrap: 'on',
                placeholder: SQL_PLACEHOLDER,
              }}
            />
          )}
        </Card>
      </section>

      {/* 响应 */}
      <section id="api-service-section-response" className="api-service-form__section">
        <h3 className="api-service-form__section-title">响应</h3>

        {responsePreview ? (
          <Card
            title={<TitleWithHelp title="响应结构（Responses Schema & Example）" help={RESPONSE_SCHEMA_HELP} />}
            style={{ marginBottom: 16 }}
          >
            <ResponseDocumentEditor
              responsesSchemaText={responsesSchemaText}
              responseExampleText={responseExampleText}
              onResponsesSchemaChange={onResponsesSchemaTextChange}
              onResponseExampleChange={onResponseExampleTextChange}
            />
          </Card>
        ) : null}
      </section>

      {/* 暂时不用
      <Card title="数据模型" style={{ marginBottom: 16 }}>
        <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
          点击右侧按钮添加 AI 引用，辅助推断实体与物化
        </Text>
        <DataModelReferenceTree />
      </Card>
      */}
    </div>
  );
};

export default ApiServiceForm;

export function buildAccessRestrictionPayload(values: ApiServiceFormValues): API.ApiServiceAccessRestriction {
  const mode = values.accessRestrictionMode || 'none';
  if (mode === 'role') {
    return { mode: 'role', roleIds: values.roleIds || [], departmentIds: [] };
  }
  if (mode === 'department') {
    return { mode: 'department', roleIds: [], departmentIds: values.departmentIds || [] };
  }
  return { mode: 'none', roleIds: [], departmentIds: [] };
}
