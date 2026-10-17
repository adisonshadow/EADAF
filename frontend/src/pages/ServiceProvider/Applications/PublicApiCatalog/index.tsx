import { useAIChatDisplayMode } from '@eadaf/ai-base';
import { ApiOutlined, PartitionOutlined, CopyOutlined, WarningOutlined, ReadOutlined, CloudUploadOutlined } from '@ant-design/icons';
import { Alert, Button, Segmented, Spin, Tag, Tooltip, Tree, Typography } from 'antd';
import { message } from '@/utils/antdAppApis';
import type { DataNode } from 'antd/es/tree';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  getApplicationsPublicApiCatalog,
  type ApplicationApiCatalogOperation,
  type ApplicationApiCatalogService,
  type ApplicationApiCatalogTreeNode,
  type ApplicationApiCatalogResult,
  type BuiltinApiCatalogItem,
  type CollectionApiCatalogItem,
} from '@/services/EADAF/api/applicationsPublic';
import OperationParameterPanel, { isQueryOnlyMethod } from '@/components/OperationParameterPanel';
import { ResponseExampleViewer } from '@/components/ResponseDocumentPanel/ResponseSchemaViewer';
import {
  buildApplicationApiDocsPath,
  buildExceptionResponsesDocsPath,
  buildOutboundWebhooksDocsPath,
  buildApiSkillDocsPath,
  parseApiDocsRoutePathFromPathname,
} from '@/utils/applicationApiDocsUrl';
import { getApiData, getApiErrorMessage, isApiSuccess } from '@/utils/apiResponse';
import { copyTextToClipboard } from '@/utils/clipboard';
import {
  getTransportProtocolLabel,
  normalizeTransportProtocols,
} from '@/pages/ApiServices/utils/apiServiceTransport';
import './index.css';

const { Text, Paragraph } = Typography;

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '// 无法序列化该结构';
  }
}

function DocPanels({
  request,
  response,
}: {
  request: React.ReactNode;
  response: React.ReactNode;
}) {
  return (
    <div className="application-api-catalog__operation">
      <section className="application-api-catalog__doc-panel">
        <h2 className="application-api-catalog__doc-panel-title">请求</h2>
        <div className="application-api-catalog__doc-panel-body">{request}</div>
      </section>
      <section className="application-api-catalog__doc-panel">
        <h2 className="application-api-catalog__doc-panel-title">响应</h2>
        <div className="application-api-catalog__doc-panel-body">{response}</div>
      </section>
    </div>
  );
}

function methodClass(method?: string) {
  return `application-api-catalog__method application-api-catalog__method--${(method || 'get').toLowerCase()}`;
}

function buildOperationPath(basePath: string | undefined, routePattern?: string) {
  const base = (basePath || '').replace(/\/$/, '');
  const suffix = routePattern || '';
  return `${base}${suffix}` || base || '/';
}

function normalizeRoutePath(routePath?: string): string {
  return String(routePath || '')
    .replace(/^\/+|\/+$/g, '')
    .trim();
}

function findServiceByRoutePath(
  services: ApplicationApiCatalogService[],
  routePath?: string,
): ApplicationApiCatalogService | undefined {
  const target = normalizeRoutePath(routePath);
  if (!target) return undefined;
  return services.find((service) => normalizeRoutePath(service.routePath) === target);
}

function collectApiCodes(nodes: ApplicationApiCatalogTreeNode[]): string[] {
  const codes: string[] = [];
  const walk = (items: ApplicationApiCatalogTreeNode[]) => {
    items.forEach((node) => {
      if (node.isApiNode) codes.push(node.code);
      if (node.children?.length) walk(node.children);
    });
  };
  walk(nodes);
  return codes;
}

function toTreeNodes(items: ApplicationApiCatalogTreeNode[]): DataNode[] {
  return items.map((item) => ({
    key: item.code,
    title: item.isApiNode ? (
      <span>
        <ApiOutlined style={{ marginRight: 6, color: '#1677ff' }} />
        {item.name}
      </span>
    ) : (
      <span>
        <PartitionOutlined style={{ marginRight: 6 }} />
        <Text strong>{item.name}</Text>
        {item.serviceCount != null ? (
          <Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
            ({item.serviceCount})
          </Text>
        ) : null}
      </span>
    ),
    selectable: !!item.isApiNode,
    isLeaf: !!item.isApiNode,
    children: item.children?.length ? toTreeNodes(item.children) : undefined,
  }));
}

function toBuiltinTreeNodes(items: ApplicationApiCatalogTreeNode[]): DataNode[] {
  return items.map((item) => ({
    key: item.code,
    title: item.isApiNode ? (
      <span>
        <ApiOutlined style={{ marginRight: 6, color: '#1677ff' }} />
        {item.name}
      </span>
    ) : (
      <span>
        <PartitionOutlined style={{ marginRight: 6 }} />
        <Text strong>{item.name}</Text>
      </span>
    ),
    selectable: !!item.isApiNode,
    isLeaf: !!item.isApiNode,
    children: item.children?.length ? toBuiltinTreeNodes(item.children) : undefined,
  }));
}

function BuiltinApiDetail({
  api,
  applicationKey,
}: {
  api: BuiltinApiCatalogItem;
  applicationKey: string;
}) {
  const navigate = useNavigate();
  const METHOD_COLORS: Record<string, string> = {
    GET: 'blue',
    POST: 'green',
    PUT: 'orange',
    DELETE: 'red',
    PATCH: 'cyan',
  };
  const operations: ApplicationApiCatalogOperation[] = api.operations?.length
    ? api.operations
    : (api.httpMethods || []).map((httpMethod) => ({
        operation: httpMethod.toLowerCase(),
        httpMethod,
        routePattern: api.routePath,
      }));
  const showPerMethodHead = operations.length > 1;

  return (
    <div className="application-api-catalog__detail">
      <h1 className="application-api-catalog__service-title">{api.label}</h1>
      <div className="application-api-catalog__service-meta">
        <div>
          <Text code>{api.code}</Text>
          {api.domain ? <Tag style={{ marginLeft: 8 }}>{api.domain}</Tag> : null}
        </div>
        {api.description ? <Paragraph style={{ marginTop: 8 }}>{api.description}</Paragraph> : null}
        <div style={{ marginTop: 12 }}>
          <div className="application-api-catalog__operation-head" style={{ cursor: 'default' }}>
            {(api.httpMethods || []).length ? (
              api.httpMethods.map((m) => (
                <span key={m} className={methodClass(m)}>{m}</span>
              ))
            ) : null}
            <span className="application-api-catalog__path">{api.routePath}</span>
          </div>
        </div>
        {api.actions?.length ? (
          <div style={{ marginTop: 12 }}>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>操作类型</Text>
            {api.actions.map((a) => (
              <Tag key={a} color={METHOD_COLORS[a.toUpperCase()] || 'default'}>{a}</Tag>
            ))}
          </div>
        ) : null}
        <Alert
          type="info"
          showIcon
          style={{ marginTop: 16 }}
          message="内置 API：外部应用通过应用 API 密钥调用时，不受角色/组织限制（按应用授权鉴权）。"
        />
      </div>

      <div className="application-api-catalog__operations" style={{ marginTop: 16 }}>
        {operations.map((op) => (
          <div key={`${api.code}-${op.httpMethod}`} className="application-api-catalog__operation-group">
            {showPerMethodHead ? <OperationEndpointHead operation={op} /> : null}
            <OperationBlock
              key={`${api.code}-${op.httpMethod}`}
              operation={op}
              requestParameterInterface={op.requestParameterInterface}
            />
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        <Button
          type="link"
          icon={<WarningOutlined />}
          style={{ padding: 0 }}
          onClick={() => navigate(buildExceptionResponsesDocsPath(applicationKey))}
        >
          异常响应信息明细
        </Button>
      </div>
    </div>
  );
}

const PROTOCOL_LABEL: Record<string, string> = {
  serial: '串口',
  modbus_rtu: 'Modbus RTU',
  modbus_tcp: 'Modbus TCP',
};

function CollectionApiDetail({
  api,
  applicationKey,
}: {
  api: CollectionApiCatalogItem;
  applicationKey: string;
}) {
  const navigate = useNavigate();
  const path = api.basePath || (api.routePath ? `/api/v1/ingest/${api.routePath}` : '');
  const hasResponseInterface = Boolean(api.responseInterface?.trim());
  const hasResponseExample = api.responseExample != null
    && typeof api.responseExample === 'object'
    && Object.keys(api.responseExample as object).length > 0;

  const requestPanel = (
    <div className="application-api-catalog__doc-section">
      <Alert
        type="info"
        showIcon
        message={api.authHint || '使用应用 JWT 调用采集接口'}
        description={api.bodyHint}
      />
      {api.sampleData ? (
        <>
          <Text strong className="application-api-catalog__doc-section-title">样本数据（Request Body）</Text>
          <pre className="application-api-catalog__schema">{api.sampleData}</pre>
        </>
      ) : (
        <Text type="secondary">暂无样本数据</Text>
      )}
      {api.targetStructure ? (
        <>
          <Text strong className="application-api-catalog__doc-section-title">
            解析目标结构（parseOutput）
          </Text>
          <pre className="application-api-catalog__schema">{api.targetStructure}</pre>
        </>
      ) : null}
    </div>
  );

  const responsePanel = (
    <div className="application-api-catalog__doc-section">
      {hasResponseInterface ? (
        <>
          <Text strong className="application-api-catalog__doc-section-title">
            响应结构（TypeScript interface）
          </Text>
          <pre className="application-api-catalog__schema">
            {api.responseInterface!.trim()}
          </pre>
        </>
      ) : null}
      {hasResponseExample ? (
        <>
          <Text strong className="application-api-catalog__doc-section-title">
            响应示例（Example）
          </Text>
          <div className="application-api-catalog__response-example">
            <ResponseExampleViewer value={api.responseExample} />
          </div>
        </>
      ) : null}
      {!hasResponseInterface && !hasResponseExample ? (
        <Text type="secondary">暂无响应文档</Text>
      ) : null}
    </div>
  );

  return (
    <div className="application-api-catalog__detail">
      <h1 className="application-api-catalog__service-title">{api.label || api.name || api.code}</h1>
      <div className="application-api-catalog__service-meta">
        <div>
          <Text code>{api.code}</Text>
          {api.status === 'draft' ? (
            <Tag color="orange" style={{ marginLeft: 8 }}>未发布</Tag>
          ) : api.status === 'published' ? (
            <Tag color="green" style={{ marginLeft: 8 }}>已发布</Tag>
          ) : null}
          {api.protocolType ? (
            <Tag style={{ marginLeft: 8 }}>{PROTOCOL_LABEL[api.protocolType] || api.protocolType}</Tag>
          ) : null}
          {api.entityCode ? <Tag style={{ marginLeft: 8 }}>{api.entityLabel || api.entityCode}</Tag> : null}
        </div>
        {api.description ? <Paragraph style={{ marginTop: 8 }}>{api.description}</Paragraph> : null}
        <div style={{ marginTop: 12 }}>
          <div className="application-api-catalog__operation-head" style={{ cursor: 'default' }}>
            <span className={methodClass('POST')}>POST</span>
            <span className="application-api-catalog__path">{path}</span>
          </div>
        </div>
        {api.status === 'draft' ? (
          <Alert
            type="warning"
            showIcon
            style={{ marginTop: 12 }}
            message="此采集管道尚未发布，仅供开发查阅；发布后方可实际调用。"
          />
        ) : null}
      </div>

      <div className="application-api-catalog__operations" style={{ marginTop: 16 }}>
        <DocPanels request={requestPanel} response={responsePanel} />
      </div>

      <div style={{ marginTop: 16 }}>
        <Button
          type="link"
          icon={<WarningOutlined />}
          style={{ padding: 0 }}
          onClick={() => navigate(buildExceptionResponsesDocsPath(applicationKey))}
        >
          异常响应信息明细
        </Button>
      </div>
    </div>
  );
}

function OperationEndpointHead({
  operation,
  basePath,
}: {
  operation: ApplicationApiCatalogOperation;
  basePath?: string;
}) {
  const path = buildOperationPath(basePath, operation.routePattern);
  return (
    <div className="application-api-catalog__operation-head">
      <span className={methodClass(operation.httpMethod)}>{operation.httpMethod}</span>
      <span className="application-api-catalog__path">{path}</span>
      <Text type="secondary">{operation.label || operation.operation}</Text>
    </div>
  );
}

function OperationBlock({
  operation,
  requestParameterInterface,
}: {
  operation: ApplicationApiCatalogOperation;
  requestParameterInterface?: string;
}) {
  const interfaceText = operation.requestParameterInterface || requestParameterInterface;
  const hasInterface = Boolean(interfaceText?.trim());
  const hasSchema = Boolean(operation.parametersSchema && Object.keys(operation.parametersSchema).length);
  const requestExample = operation.requestExample || operation.mockParameters;
  const hasRequestExample = Boolean(requestExample && Object.keys(requestExample).length);
  const hasResponseInterface = Boolean(operation.responseInterface?.trim());
  const hasResponseExample = operation.responseExample != null
    && typeof operation.responseExample === 'object'
    && Object.keys(operation.responseExample as object).length > 0;

  const isQuery = isQueryOnlyMethod(operation.httpMethod);

  const requestPanel = (
    <div className="application-api-catalog__doc-section">
      {hasInterface ? (
        <>
          <Text strong className="application-api-catalog__doc-section-title">
            请求参数结构（TypeScript interface）
          </Text>
          <pre className="application-api-catalog__schema">
            {interfaceText!.trim()}
          </pre>
        </>
      ) : null}
      {isQuery && hasSchema ? (
        <>
          <Text strong className="application-api-catalog__doc-section-title">
            请求参数 Example（Query）
          </Text>
          <OperationParameterPanel
            httpMethod={operation.httpMethod}
            parametersSchema={operation.parametersSchema}
            routePattern={operation.routePattern}
            values={requestExample}
            readOnly
            emptyText="无参数"
          />
        </>
      ) : null}
      {!isQuery && hasRequestExample ? (
        <>
          <Text strong className="application-api-catalog__doc-section-title">
            请求参数 Example（JSON）
          </Text>
          <pre className="application-api-catalog__schema">
            {safeJson(requestExample)}
          </pre>
        </>
      ) : null}
      {!isQuery && !hasRequestExample && hasSchema ? (
        <>
          <Text strong className="application-api-catalog__doc-section-title">Parameters</Text>
          <OperationParameterPanel
            httpMethod={operation.httpMethod}
            parametersSchema={operation.parametersSchema}
            routePattern={operation.routePattern}
            readOnly
            emptyText="无参数"
          />
        </>
      ) : null}
      {hasSchema ? (
        <details className="application-api-catalog__inner-collapse">
          <summary>Parameters Schema（运行时 JSON Schema）</summary>
          <pre className="application-api-catalog__schema">
            {safeJson(operation.parametersSchema)}
          </pre>
        </details>
      ) : null}
      {!hasInterface && !hasSchema && !hasRequestExample ? (
        <Text type="secondary">暂无请求参数</Text>
      ) : null}
    </div>
  );

  const responsePanel = (
    <div className="application-api-catalog__doc-section">
      {hasResponseInterface ? (
        <>
          <Text strong className="application-api-catalog__doc-section-title">
            响应结构（TypeScript interface）
          </Text>
          <pre className="application-api-catalog__schema">
            {operation.responseInterface!.trim()}
          </pre>
        </>
      ) : null}
      {hasResponseExample ? (
        <>
          <Text strong className="application-api-catalog__doc-section-title">
            响应示例（Example）
          </Text>
          <div className="application-api-catalog__response-example">
            <ResponseExampleViewer value={operation.responseExample} />
          </div>
        </>
      ) : null}
      {!hasResponseInterface && !hasResponseExample ? (
        <Text type="secondary">暂无响应文档</Text>
      ) : null}
    </div>
  );

  return <DocPanels request={requestPanel} response={responsePanel} />;
}

function ServiceDetail({
  service,
  applicationKey,
}: {
  service: ApplicationApiCatalogService;
  applicationKey: string;
}) {
  const navigate = useNavigate();
  return (
    <div className="application-api-catalog__detail">
      <h1 className="application-api-catalog__service-title">{service.name || service.code}</h1>
      <div className="application-api-catalog__service-meta">
        <div>
          <Text code>{service.code}</Text>
          {service.status === 'draft' ? (
            <Tag color="orange" style={{ marginLeft: 8 }}>
              未发布
            </Tag>
          ) : service.status === 'published' ? (
            <Tag color="green" style={{ marginLeft: 8 }}>
              已发布
            </Tag>
          ) : null}
          {service.version != null ? <Tag style={{ marginLeft: 8 }}>v{service.version}</Tag> : null}
          {normalizeTransportProtocols(service.transportProtocols).map((p) => (
            <Tag key={p} style={{ marginLeft: 4 }}>
              {getTransportProtocolLabel(p)}
            </Tag>
          ))}
        </div>
        {service.description ? <Paragraph style={{ marginTop: 8 }}>{service.description}</Paragraph> : null}
        {service.status === 'draft' ? (
          <Alert
            type="warning"
            showIcon
            style={{ marginTop: 12 }}
            message="此 API 尚未发布，仅供开发查阅；发布后方可实际调用。"
          />
        ) : null}
        {/* <Paragraph style={{ marginBottom: 0 }}>
          Base URL: <Text code copyable>{service.basePath}</Text>
          {service.routePath ? (
            <>
              {' '}
              · route_path: <Text code>{service.routePath}</Text>
            </>
          ) : null}
          {service.entityCode ? (
            <>
              {' '}
              · 实体: <Text code>{service.entityCode}</Text>
            </>
          ) : null}
        </Paragraph> */}
        {service.tags?.length ? (
          <div style={{ marginTop: 8 }}>
            {service.tags.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </div>
        ) : null}
      </div>

      <div className="application-api-catalog__operations">
        {(service.operations || []).length ? (
          service.operations!.map((op) => (
            <div key={`${service.code}-${op.operation}`} className="application-api-catalog__operation-group">
              <OperationEndpointHead operation={op} basePath={service.basePath} />
              <Paragraph type="secondary" className="application-api-catalog__operation-meta">
                Operation: <Text code>{op.operation}</Text>
                {op.category ? (
                  <>
                    {' '}
                    · Category: <Text code>{op.category}</Text>
                  </>
                ) : null}
              </Paragraph>
              <OperationBlock
                operation={op}
                requestParameterInterface={service.requestParameterInterface}
              />
            </div>
          ))
        ) : (
          <Alert type="info" showIcon message="该 API 服务暂无已启用的 Operation" />
        )}
      </div>

      {/* 异常响应明细链接（所有 API 共享，打开专门的异常响应页） */}
      <div style={{ marginTop: 16 }}>
        <Button
          type="link"
          icon={<WarningOutlined />}
          style={{ padding: 0 }}
          onClick={() => navigate(buildExceptionResponsesDocsPath(applicationKey))}
        >
          异常响应信息明细
        </Button>
      </div>
    </div>
  );
}

const ApplicationPublicApiCatalogPage: React.FC = () => {
  useAIChatDisplayMode('hidden');
  const location = useLocation();
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<ApplicationApiCatalogResult | undefined>(undefined);
  const [selectedServiceCode, setSelectedServiceCode] = useState<string>();
  const [tab, setTab] = useState<'business' | 'builtin' | 'ingest'>('business');
  const [selectedBuiltinCode, setSelectedBuiltinCode] = useState<string>();
  const [selectedCollectionCode, setSelectedCollectionCode] = useState<string>();

  const routePathFromUrl = useMemo(
    () => (code ? parseApiDocsRoutePathFromPathname(location.pathname, code) : undefined),
    [code, location.pathname],
  );

  const syncSelectionFromUrl = useCallback(
    (data: ApplicationApiCatalogResult, routePath?: string) => {
      if (routePath) {
        const matched = findServiceByRoutePath(data.services, routePath);
        if (matched?.code) {
          setSelectedServiceCode(matched.code);
          return;
        }
      }
      const firstApi = data.tree ? collectApiCodes(data.tree)[0] : undefined;
      setSelectedServiceCode(firstApi);
    },
    [],
  );

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getApplicationsPublicApiCatalog(code, { skipErrorHandler: true });
        if (cancelled) return;
        if (!isApiSuccess(res)) {
          setError(getApiErrorMessage(res, '加载 API 目录失败'));
          return;
        }
        const data = getApiData<ApplicationApiCatalogResult>(res);
        setCatalog(data);
        // 默认 Tab：业务 → 内置 → 采集，取第一个非空
        const businessEmpty = !data?.tree?.length;
        const builtinHas = !!data?.builtinApiTree?.length;
        const collectionHas = !!data?.collectionApiTree?.length;
        if (businessEmpty && builtinHas) {
          setTab('builtin');
        } else if (businessEmpty && !builtinHas && collectionHas) {
          setTab('ingest');
        }
      } catch (err) {
        if (!cancelled) setError(getApiErrorMessage(err, '加载 API 目录失败'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  useEffect(() => {
    if (!catalog) return;
    syncSelectionFromUrl(catalog, routePathFromUrl);
  }, [catalog, routePathFromUrl, syncSelectionFromUrl]);

  useEffect(() => {
    if (!catalog || !code) return undefined;
    const onPopState = () => {
      const routePath = parseApiDocsRoutePathFromPathname(window.location.pathname, code);
      syncSelectionFromUrl(catalog, routePath);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [catalog, code, syncSelectionFromUrl]);

  const treeNodes = useMemo(() => (catalog?.tree ? toTreeNodes(catalog.tree) : []), [catalog?.tree]);
  const builtinTreeNodes = useMemo(
    () => (catalog?.builtinApiTree ? toBuiltinTreeNodes(catalog.builtinApiTree) : []),
    [catalog?.builtinApiTree],
  );
  const collectionTreeNodes = useMemo(
    () => (catalog?.collectionApiTree ? toBuiltinTreeNodes(catalog.collectionApiTree) : []),
    [catalog?.collectionApiTree],
  );
  const selectedService = useMemo(
    () => catalog?.services?.find((item) => item.code === selectedServiceCode),
    [catalog?.services, selectedServiceCode],
  );
  const selectedBuiltinApi = useMemo(
    () => catalog?.builtinApis?.find((item) => item.code === selectedBuiltinCode),
    [catalog?.builtinApis, selectedBuiltinCode],
  );
  const selectedCollectionApi = useMemo(
    () => catalog?.collectionApis?.find((item) => item.code === selectedCollectionCode),
    [catalog?.collectionApis, selectedCollectionCode],
  );

  const hasBusinessApis = treeNodes.length > 0;
  const hasBuiltinApis = builtinTreeNodes.length > 0;
  const hasCollectionApis = collectionTreeNodes.length > 0;

  const handleSelectService = useCallback(
    (serviceCode: string) => {
      if (!code || !catalog) return;
      const service = catalog.services.find((item) => item.code === serviceCode);
      if (!service?.routePath) return;
      if (selectedServiceCode === serviceCode) return;
      const nextPath = buildApplicationApiDocsPath(code, service.routePath);
      if (window.location.pathname !== nextPath) {
        window.history.replaceState(window.history.state, '', nextPath);
      }
      setSelectedServiceCode(serviceCode);
    },
    [catalog, code, selectedServiceCode],
  );

  const openApiJsonUrl = useMemo(() => {
    if (!code || typeof window === 'undefined') return '';
    return `${window.location.origin}/api/v1/applications-public/${encodeURIComponent(code)}/apis.json`;
  }, [code]);

  const handleCopyJsonUrl = useCallback(async () => {
    if (!openApiJsonUrl) return;
    const ok = await copyTextToClipboard(openApiJsonUrl);
    if (ok) message.success('已复制 OpenAPI JSON URL，可直接交给 AI 读取');
    else message.error('复制失败，请手动复制：' + openApiJsonUrl);
  }, [openApiJsonUrl]);

  if (loading) {
    return (
      <div className="application-api-catalog" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" description="加载 API 目录..." />
      </div>
    );
  }

  if (error || !catalog) {
    return (
      <div className="application-api-catalog" style={{ padding: 24 }}>
        <Alert type="error" showIcon message={error || '无法加载 API 目录'} />
      </div>
    );
  }

  return (
    <div className="application-api-catalog">
      <header className="application-api-catalog__header">
        <div className="application-api-catalog__header-main">
          <h1 className="application-api-catalog__header-title">{catalog.application.name} · API 文档</h1>
          <p className="application-api-catalog__header-sub">
            应用 <Text code style={{ color: '#fff' }}>{catalog.application.code}</Text>
            {' · '}
            以下为该应用已授权可访问的 API（公开文档，无需登录）
            {' · '}
            右上「复制 JSON URL」可直接给 AI 读取
          </p>
        </div>
        <div className="application-api-catalog__header-actions">
          <Button
            type="primary"
            ghost
            size="small"
            icon={<CloudUploadOutlined />}
            onClick={() => code && navigate(buildOutboundWebhooksDocsPath(code))}
          >
            关联提交外部API
          </Button>
          <Button
            type="primary"
            ghost
            size="small"
            icon={<WarningOutlined />}
            onClick={() => code && navigate(buildExceptionResponsesDocsPath(code))}
          >
            异常响应
          </Button>
          <Button
            type="primary"
            ghost
            size="small"
            icon={<ReadOutlined />}
            onClick={() => code && navigate(buildApiSkillDocsPath(code))}
          >
            API SKILL
          </Button>
          <Tooltip
            placement="bottomRight"
            title={
              <div style={{ maxWidth: 300 }}>
                <div>复制该应用的 OpenAPI 契约地址（apis.json，免登录）。</div>
                <div style={{ marginTop: 4 }}>
                  可直接粘贴给 AI 读取，让它按真实路径与参数名调用；
                  文件较大，建议让 AI 用 <Text code>eadaf_api_contract</Text> 按 path/keyword 过滤后再取。
                </div>
              </div>
            }
          >
            <Button
              type="primary"
              size="small"
              icon={<CopyOutlined />}
              onClick={handleCopyJsonUrl}
              disabled={!openApiJsonUrl}
              aria-label="复制 OpenAPI JSON URL（可交给 AI 读取）"
            >
              复制 JSON URL
            </Button>
          </Tooltip>
        </div>
      </header>

      <div className="application-api-catalog__body">
        <aside className="application-api-catalog__sidebar application-api-catalog__tree">
          {hasBusinessApis || hasBuiltinApis || hasCollectionApis ? (
            <Segmented
              block
              value={tab}
              onChange={(val) => setTab(val as 'business' | 'builtin' | 'ingest')}
              options={[
                { label: '业务 API', value: 'business' },
                { label: '内置 API', value: 'builtin' },
                { label: '采集 API', value: 'ingest' },
              ]}
              style={{ marginBottom: 12 }}
            />
          ) : null}
          {tab === 'business' ? (
            treeNodes.length ? (
              <Tree
                showLine
                defaultExpandAll
                motion={false}
                selectedKeys={selectedServiceCode ? [selectedServiceCode] : []}
                treeData={treeNodes}
                onSelect={(keys) => {
                  const key = keys[0] as string | undefined;
                  if (key) handleSelectService(key);
                }}
              />
            ) : (
              <Text type="secondary">暂无已授权的业务 API 域，请在应用 API 配置中勾选可访问域</Text>
            )
          ) : tab === 'builtin' ? (
            builtinTreeNodes.length ? (
              <Tree
                showLine
                defaultExpandAll
                motion={false}
                selectedKeys={selectedBuiltinCode ? [selectedBuiltinCode] : []}
                treeData={builtinTreeNodes}
                onSelect={(keys) => {
                  const key = keys[0] as string | undefined;
                  if (key) setSelectedBuiltinCode(key);
                }}
              />
            ) : (
              <Text type="secondary">暂无已授权的内置 API，请在应用 API 配置中勾选可访问内置 API</Text>
            )
          ) : collectionTreeNodes.length ? (
            <Tree
              showLine
              defaultExpandAll
              motion={false}
              selectedKeys={selectedCollectionCode ? [selectedCollectionCode] : []}
              treeData={collectionTreeNodes}
              onSelect={(keys) => {
                const key = keys[0] as string | undefined;
                if (key) setSelectedCollectionCode(key);
              }}
            />
          ) : (
            <Text type="secondary">
              暂无对本应用开放的采集 API（需为草稿/已发布，且未限制来源或已将本应用加入白名单）
            </Text>
          )}
        </aside>

        <main className="application-api-catalog__content">
          {tab === 'business' ? (
            selectedService ? (
              <ServiceDetail service={selectedService} applicationKey={code!} />
            ) : (
              <div className="application-api-catalog__detail application-api-catalog__empty">
                请从左侧选择一个 API 服务查看明细
              </div>
            )
          ) : tab === 'builtin' ? (
            selectedBuiltinApi ? (
              <BuiltinApiDetail
                key={selectedBuiltinApi.code}
                api={selectedBuiltinApi}
                applicationKey={code!}
              />
            ) : (
              <div className="application-api-catalog__detail application-api-catalog__empty">
                请从左侧选择一个内置 API 查看明细
              </div>
            )
          ) : selectedCollectionApi ? (
            <CollectionApiDetail api={selectedCollectionApi} applicationKey={code!} />
          ) : (
            <div className="application-api-catalog__detail application-api-catalog__empty">
              请从左侧选择一个采集 API 查看明细
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default ApplicationPublicApiCatalogPage;
