import { PlayCircleOutlined, RobotOutlined, ReloadOutlined, ToolOutlined } from '@ant-design/icons';
import { sendMockUserMessage, useAISurface, useChatReference } from '@eadaf/ai-base';
import { Alert, Button, Collapse, Descriptions, Input, Space, Spin, Tag, Typography } from 'antd';
import { message } from '@/utils/antdAppApis';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import PageContainerTitleWithBack from '@/components/PageContainerTitleWithBack';
import FixHeaderPage, { useFixHeaderPageScroll } from '@/components/FixHeaderPage';
import OperationParameterPanel, {
  isQueryOnlyMethod,
  type ParameterRow,
} from '@/components/OperationParameterPanel';
import { ResponseExampleViewer, ResponseSchemaViewer } from '@/components/ResponseDocumentPanel/ResponseSchemaViewer';
import { buildApiServiceReference } from '@/ai/chatReferenceBuilders';
import { buildApiServiceTestParamsPrompt } from '@/pages/ApiServices/ai/buildApiServiceTestParamsPrompt';
import { buildApiServiceTestAutoFixPrompt } from '@/pages/ApiServices/ai/buildApiServiceTestAutoFixPrompt';
import {
  describeApiServiceTestFailure,
  formatApiServiceTestError,
  isApiServiceTestFailure,
} from '@/pages/ApiServices/ai/apiServiceTestError';
import {
  getApiServiceTestProfile,
  postApiServiceSuggestTestParams,
  postApiServiceTest,
} from '@/services/EADAF/api/apiServices';
import {
  buildParameterRowsFromInterface,
  collectEnumCodesFromInterface,
  ensureExampleValues,
  loadEnumOptionsByCodes,
  type EnumOptionsByCode,
} from '@/pages/ApiServices/utils/buildParameterRowsFromInterface';
import {
  extractRequestExampleFromPayload,
  formatRequestExampleText,
  REQUEST_EXAMPLE_FIELD_LABEL,
} from '@/pages/ApiServices/utils/requestOverrides';
import { formatHandlerDiagnostics } from '@/pages/ApiServices/utils/handlerTypeCheckClient';
import { getApiData, getApiErrorMessage, isApiSuccess } from '@/utils/apiResponse';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

const WRITE_OPERATIONS = new Set([
  'create', 'insertOne', 'insertMany', 'save', 'updateOne', 'updateMany',
  'deleteOne', 'deleteMany', 'findOneAndUpdate', 'findOneAndDelete', 'replaceOne',
]);

function isWriteOperation(operation?: string) {
  return Boolean(operation && WRITE_OPERATIONS.has(operation));
}

type TestLocationState = {
  autoRunTest?: boolean;
  fixContext?: { errorMessage?: string };
};

function parseParametersJson(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  if (!trimmed) return {};
  return JSON.parse(trimmed) as Record<string, unknown>;
}

function patchProfileRequestExample(
  profile: API.ApiServiceTestProfile | null,
  operation: string | undefined,
  requestExample: Record<string, unknown>,
): API.ApiServiceTestProfile | null {
  if (!profile) return profile;
  const targetOp = operation || profile.enabledOperations?.[0]?.operation;
  if (!targetOp) return profile;
  return {
    ...profile,
    enabledOperations: profile.enabledOperations?.map((item) => (
      item.operation === targetOp
        ? { ...item, mockParameters: requestExample, mockParametersSource: 'saved' as const }
        : item
    )),
  };
}

function applyRequestExampleToTestState(
  payload: unknown,
  selectedOperation: string | undefined,
  setParametersText: (text: string) => void,
  setProfile: React.Dispatch<React.SetStateAction<API.ApiServiceTestProfile | null>>,
) {
  const { operation, requestExample } = extractRequestExampleFromPayload(payload);
  if (!requestExample) return;
  setParametersText(formatRequestExampleText(requestExample));
  setProfile((prev) => patchProfileRequestExample(prev, operation || selectedOperation, requestExample));
}

/** 测试结果被渲染后，将 FixHeaderPage 内容区滚动到底部 */
const TestResultScrollAnchor: React.FC<{ result: API.ApiServiceTestResult | null }> = ({ result }) => {
  const anchorRef = useRef<HTMLDivElement>(null);
  const { scrollToElement, scrollReady } = useFixHeaderPageScroll();

  useEffect(() => {
    if (!result || !scrollReady) return;
    const frame = requestAnimationFrame(() => {
      scrollToElement(anchorRef.current);
    });
    return () => cancelAnimationFrame(frame);
  }, [result, scrollReady, scrollToElement]);

  return <div ref={anchorRef} aria-hidden style={{ height: 0 }} />;
};

const ApiServiceTestPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state || {}) as TestLocationState;
  const { id: serviceId } = useParams<{ id: string }>();
  const { addReference } = useChatReference();
  const [profileLoading, setProfileLoading] = useState(true);
  const [testLoading, setTestLoading] = useState(false);
  const [profile, setProfile] = useState<API.ApiServiceTestProfile | null>(null);
  const [selectedOperation, setSelectedOperation] = useState<string | undefined>();
  const [parametersText, setParametersText] = useState('{}');
  const [parseError, setParseError] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [result, setResult] = useState<API.ApiServiceTestResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [enumOptionsByCode, setEnumOptionsByCode] = useState<EnumOptionsByCode>({});
  const autoRunConsumedRef = useRef(false);

  const parametersRef = useRef(parametersText);
  parametersRef.current = parametersText;
  const selectedOperationRef = useRef(selectedOperation);
  selectedOperationRef.current = selectedOperation;
  const testErrorRef = useRef(testError);
  testErrorRef.current = testError;
  const resultRef = useRef(result);
  resultRef.current = result;

  const currentOpProfile = useMemo(
    () => profile?.enabledOperations?.find((item) => item.operation === selectedOperation),
    [profile, selectedOperation],
  );

  const isGetOperation = isQueryOnlyMethod(currentOpProfile?.httpMethod);
  const interfaceText = profile?.requestParameterInterface;

  const neededEnumCodesKey = useMemo(
    () => collectEnumCodesFromInterface(interfaceText).slice().sort().join('|'),
    [interfaceText],
  );

  useEffect(() => {
    let cancelled = false;
    const codes = collectEnumCodesFromInterface(interfaceText);
    if (!codes.length) {
      setEnumOptionsByCode({});
      return undefined;
    }
    void (async () => {
      try {
        const next = await loadEnumOptionsByCodes(codes);
        if (!cancelled) setEnumOptionsByCode(next);
      } catch {
        if (!cancelled) setEnumOptionsByCode({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [neededEnumCodesKey, interfaceText]);

  /** 与编辑页同源：由 requestParameterInterface 生成参数结构 */
  const parameterRows = useMemo<ParameterRow[]>(
    () =>
      buildParameterRowsFromInterface({
        interfaceText,
        httpMethod: currentOpProfile?.httpMethod,
        routePattern: currentOpProfile?.routePattern,
        enumOptionsByCode,
      }),
    [interfaceText, currentOpProfile?.httpMethod, currentOpProfile?.routePattern, enumOptionsByCode],
  );

  const showStructuredPanel =
    isGetOperation && (parameterRows.length > 0 || Boolean(currentOpProfile?.parameterSchema));

  // Example 值：在 interface 默认结构上保留已填内容，空则补齐
  const structuredValues = useMemo<Record<string, unknown>>(() => {
    if (!showStructuredPanel) return {};
    let current: Record<string, unknown> = {};
    try {
      const parsed = parseParametersJson(parametersText);
      current = parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      current = {};
    }
    if (parameterRows.length) {
      return ensureExampleValues(parameterRows, current);
    }
    return current;
  }, [parametersText, showStructuredPanel, parameterRows]);

  // Example 为空时写入默认值（Example 不应是空对象）
  useEffect(() => {
    if (!isGetOperation || !parameterRows.length) return;
    let current: Record<string, unknown> = {};
    try {
      current = parseParametersJson(parametersText) || {};
    } catch {
      current = {};
    }
    if (Object.keys(current).length > 0) return;
    const ensured = ensureExampleValues(parameterRows, {});
    setParametersText(JSON.stringify(ensured, null, 2));
  }, [isGetOperation, parameterRows, parametersText, selectedOperation]);

  const loadProfile = useCallback(async () => {
    if (!serviceId) return;
    setProfileLoading(true);
    setLoadError(null);
    setResult(null);
    try {
      const res = await getApiServiceTestProfile(serviceId);
      if (!isApiSuccess(res)) {
        setLoadError(getApiErrorMessage(res, '加载测试上下文失败'));
        setProfile(null);
        return;
      }
      const data = getApiData<API.ApiServiceTestProfile>(res);
      setProfile(data || null);
      const firstOp = data?.enabledOperations?.[0]?.operation;
      setSelectedOperation(firstOp);
      const mock = data?.enabledOperations?.[0]?.mockParameters || {};
      setParametersText(JSON.stringify(mock, null, 2));
      setParseError(null);
    } catch (err) {
      setLoadError(getApiErrorMessage(err, '加载测试上下文失败'));
      setProfile(null);
    } finally {
      setProfileLoading(false);
    }
  }, [serviceId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useAISurface({
    id: 'api-services.test',
    domain: 'bizdata',
    label: 'API 服务测试',
    read: () => ({
      serviceId,
      serviceCode: profile?.code,
      selectedOperation: selectedOperationRef.current,
      parametersText: parametersRef.current,
      testError: testErrorRef.current,
      lastTestResult: resultRef.current,
      profileSummary: profile
        ? {
            code: profile.code,
            basePath: profile.basePath,
            operations: profile.enabledOperations?.map((op) => op.operation),
          }
        : null,
    }),
    applyMutation: (mutation) => {
      if (mutation.type === 'apiservice.test_params.suggested' || mutation.type === 'apiservice.test_params.set') {
        applyRequestExampleToTestState(
          mutation.payload,
          selectedOperationRef.current,
          (text) => {
            setParametersText(text);
            setParseError(null);
            setTestError(null);
          },
          setProfile,
        );
        return;
      }
      if (mutation.type === 'apiservice.test_completed') {
        const payload = mutation.payload as {
          success?: boolean;
          error?: string;
          preview?: unknown;
          executable?: boolean;
          executableReason?: string;
          validationErrors?: Array<{ path?: string; message?: string }>;
          savedMockParameters?: Record<string, unknown>;
          operation?: string;
        };
        if (payload?.success === false) {
          setTestError(payload.error || '测试失败');
          setResult(null);
          return;
        }
        setTestError(null);
        setResult(payload as API.ApiServiceTestResult);
        applyRequestExampleToTestState(
          payload,
          selectedOperationRef.current,
          (text) => {
            setParametersText(text);
            setParseError(null);
          },
          setProfile,
        );
      }
    },
    matchMutation: (mutation) =>
      mutation.domain === 'bizdata'
      && (
        mutation.type === 'apiservice.test_params.suggested'
        || mutation.type === 'apiservice.test_params.set'
        || mutation.type === 'apiservice.test_completed'
      ),
  });

  const handleResetMock = async () => {
    if (!serviceId || !selectedOperation) return;
    try {
      const res = await postApiServiceSuggestTestParams(serviceId, { operation: selectedOperation });
      if (!isApiSuccess(res)) {
        message.error(getApiErrorMessage(res, '重置请求参数 Example 失败'));
        return;
      }
      const data = getApiData<API.ApiServiceSuggestTestParamsResult>(res);
      setParametersText(formatRequestExampleText(data?.mockParameters));
      setParseError(null);
      message.success('已重置为默认请求参数 Example');
    } catch (err) {
      message.error(getApiErrorMessage(err, '重置请求参数 Example 失败'));
    }
  };

  const handleAiGenerate = () => {
    if (!profile) return;
    addReference(
      buildApiServiceReference({
        id: profile.serviceId,
        code: profile.code,
        name: profile.name,
        routePath: profile.routePath,
        status: profile.status,
        entityCode: profile.entityCode,
      }),
    );
    sendMockUserMessage(
      buildApiServiceTestParamsPrompt({
        code: profile.code,
        name: profile.name,
        operation: selectedOperation,
        operationLabel: currentOpProfile?.label,
      }),
    );
  };

  const handleAutoFix = () => {
    if (!profile) return;
    addReference(
      buildApiServiceReference({
        id: profile.serviceId,
        code: profile.code,
        name: profile.name,
        routePath: profile.routePath,
        status: profile.status,
        entityCode: profile.entityCode,
      }),
    );
    sendMockUserMessage(
      buildApiServiceTestAutoFixPrompt({
        serviceId: profile.serviceId,
        code: profile.code,
        name: profile.name,
        operation: selectedOperation,
        operationLabel: currentOpProfile?.label,
        parametersText,
        errorMessage: testError || parseError || undefined,
      }),
    );
  };

  const runTest = useCallback(async () => {
    if (!serviceId || !selectedOperation) return;
    let parameters: Record<string, unknown>;
    try {
      parameters = parseParametersJson(parametersText);
      setParseError(null);
    } catch {
      setParseError('参数 JSON 格式不正确');
      setTestError(null);
      return;
    }

    setTestLoading(true);
    setResult(null);
    setTestError(null);
    try {
      const res = await postApiServiceTest(
        serviceId,
        {
          operation: selectedOperation,
          parameters,
        },
        { skipErrorHandler: true },
      );
      if (isApiSuccess(res)) {
        const data = getApiData<API.ApiServiceTestResult>(res) || null;
        setResult(data);
        if (data?.savedMockParameters) {
          setParametersText(formatRequestExampleText(data.savedMockParameters));
          setParseError(null);
          setProfile((prev) => patchProfileRequestExample(
            prev,
            selectedOperation,
            data.savedMockParameters as Record<string, unknown>,
          ));
        }
        const failureMessage = describeApiServiceTestFailure(data);
        if (isApiServiceTestFailure(data)) {
          setTestError(failureMessage || '测试未通过');
        } else {
          setTestError(null);
        }
      } else {
        const diagnostics = (res as { data?: { diagnostics?: Array<{ line: number; column: number; message: string }> } })
          ?.data?.diagnostics;
        const errMsg = diagnostics?.length
          ? `Handler 语法检查未通过：\n${formatHandlerDiagnostics(diagnostics)}`
          : getApiErrorMessage(res, '测试请求失败');
        setTestError(formatApiServiceTestError(res, errMsg));
      }
    } catch (err) {
      const diagnostics =
        err && typeof err === 'object' && 'data' in err
          ? (err as { data?: { diagnostics?: Array<{ line: number; column: number; message: string }> } }).data?.diagnostics
          : undefined;
      const errMsg = diagnostics?.length
        ? `Handler 语法检查未通过：\n${formatHandlerDiagnostics(diagnostics)}`
        : formatApiServiceTestError(err, '测试请求失败');
      setTestError(errMsg);
    } finally {
      setTestLoading(false);
    }
  }, [parametersText, selectedOperation, serviceId]);

  useEffect(() => {
    autoRunConsumedRef.current = false;
  }, [serviceId]);

  useEffect(() => {
    if (!locationState.autoRunTest || autoRunConsumedRef.current) return;
    if (profileLoading || !profile || !selectedOperation) return;
    autoRunConsumedRef.current = true;
    void runTest();
    navigate(location.pathname, { replace: true, state: {} });
  }, [
    location.pathname,
    locationState.autoRunTest,
    navigate,
    profile,
    profileLoading,
    runTest,
    selectedOperation,
  ]);

  const schemaCollapseItems = [
    ...(profile?.requestParameterInterface
      ? [
          {
            key: 'interface',
            label: '请求参数 TypeScript interface（设计期）',
            children: (
              <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}>
                {profile.requestParameterInterface}
              </pre>
            ),
          },
        ]
      : []),
    ...(currentOpProfile?.parameterSchema
      ? [
          {
            key: 'schema',
            label: '请求参数 运行时 JSON Schema',
            children: (
              <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(currentOpProfile.parameterSchema, null, 2)}
              </pre>
            ),
          },
        ]
      : []),
    ...(currentOpProfile?.responseInterface
      ? [
          {
            key: 'responseInterface',
            label: '响应结构 TypeScript interface',
            children: (
              <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}>
                {currentOpProfile.responseInterface}
              </pre>
            ),
          },
        ]
      : []),
    ...(currentOpProfile?.responsesSchema || currentOpProfile?.responseSchema
      ? [
          {
            key: 'responseSchema',
            label: '响应 Schema (200)',
            children: (
              <ResponseSchemaViewer
                value={currentOpProfile.responsesSchema || {
                  200: {
                    description: '获取成功',
                    content: {
                      'application/json': {
                        schema: currentOpProfile.responseSchema,
                      },
                    },
                  },
                }}
              />
            ),
          },
        ]
      : []),
    ...(currentOpProfile?.responseExample != null
      ? [
          {
            key: 'responseExample',
            label: '响应 Example (200)',
            children: <ResponseExampleViewer value={currentOpProfile.responseExample} />,
          },
        ]
      : []),
  ];

  return (
    <FixHeaderPage
      title={(
        <PageContainerTitleWithBack
          title={`测试请求${profile?.code ? ` · ${profile.code}` : ''}`}
        />
      )}
      extra={
        serviceId ? (
          <Button onClick={() => navigate(`/api_services/${serviceId}/edit`)}>去编辑</Button>
        ) : null
      }
    >
      {profileLoading && (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <Spin description="正在加载测试上下文…" />
        </div>
      )}

      {!profileLoading && loadError && (
        <Alert type="error" message={loadError} showIcon style={{ marginBottom: 16 }} />
      )}

      {!profileLoading && profile && (
        <div style={{ maxWidth: 888, margin: '0 auto' }}>
          {profile.testAutoRollback === false
            && isWriteOperation(selectedOperation)
            && currentOpProfile?.executable !== false && (
            <Alert
              type="warning"
              showIcon
              message="API 测试中：写操作将真实落库"
              description="系统设置已关闭「API 测试中写操作自动回滚」。本次仅在测试页执行的写操作会提交到数据库，不影响已发布 API 的线上行为。"
              style={{ marginBottom: 16 }}
            />
          )}
          <Descriptions size="small" column={1} bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Operation">
              <Text>
                {currentOpProfile?.label || selectedOperation}
                {currentOpProfile?.httpMethod ? ` (${currentOpProfile.httpMethod})` : ''}
              </Text>
              {currentOpProfile?.executable === false && (
                <Tag color="warning" style={{ marginLeft: 8 }}>
                  仅校验
                </Tag>
              )}
              {currentOpProfile?.mockParametersSource === 'saved' && (
                <Tag color="success" style={{ marginLeft: 8 }}>
                  已保存 Example
                </Tag>
              )}
            </Descriptions.Item>
            {/* {currentOpProfile?.requestPreview && (
              <Descriptions.Item label="请求预览">
                <Text code copyable>
                  {currentOpProfile.requestPreview.method} {currentOpProfile.requestPreview.url}
                </Text>
              </Descriptions.Item>
            )} */}
            {currentOpProfile?.executableReason && currentOpProfile.executable === false && (
              <Descriptions.Item label="说明">
                <Text type="secondary">{currentOpProfile.executableReason}</Text>
              </Descriptions.Item>
            )}
            {profile.transportEndpoints?.length ? (
              <Descriptions.Item label="访问协议">
                <Space orientation="vertical" size={4}>
                  {profile.transportEndpoints.map((item) => (
                    <span key={item.protocol}>
                      <Tag>{item.label || item.protocol}</Tag>
                      <Text code copyable>{item.url}</Text>
                    </span>
                  ))}
                </Space>
              </Descriptions.Item>
            ) : null}
          </Descriptions>

          {schemaCollapseItems.length > 0 && (
            <Collapse items={schemaCollapseItems} style={{ marginBottom: 12 }} />
          )}

          {/* GET 操作：参数在 URL query string 说明 */}
          {/* {isGetOperation && currentOpProfile?.parameterSchema ? (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 8 }}
              message={`${String(currentOpProfile.httpMethod || 'GET').toUpperCase()} 请求参数通过 URL query string 传递，无 request body`}
            />
          ) : null} */}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {showStructuredPanel
                ? `${REQUEST_EXAMPLE_FIELD_LABEL}（Query）`
                : `${REQUEST_EXAMPLE_FIELD_LABEL}（JSON）`}
            </Paragraph>
            <Button
              size="small"
              className="ai-btn"
              icon={<RobotOutlined />}
              style={{ marginLeft: 'auto' }}
              onClick={handleAiGenerate}
            >
              AI 生成参数
            </Button>
          </div>
          {showStructuredPanel ? (
            <div className="operation-parameter-panel--bounded" style={{ marginBottom: 8 }}>
              <OperationParameterPanel
                httpMethod={currentOpProfile?.httpMethod}
                parameters={parameterRows.length ? parameterRows : undefined}
                parametersSchema={parameterRows.length ? undefined : currentOpProfile?.parameterSchema}
                routePattern={currentOpProfile?.routePattern}
                values={structuredValues}
                onChange={(next) => {
                  setParametersText(JSON.stringify(next, null, 2));
                  setParseError(null);
                  setTestError(null);
                }}
              />
            </div>
          ) : (
            <TextArea
              rows={10}
              value={parametersText}
              onChange={(e) => {
                setParametersText(e.target.value);
                setParseError(null);
                setTestError(null);
              }}
              style={{ fontFamily: 'monospace', fontSize: 12, marginBottom: 8 }}
            />
          )}
          {parseError && (
            <Alert type="error" message={parseError} showIcon style={{ marginBottom: 12 }} />
          )}
          {testError && !parseError && (
            <Alert type="error" message="测试失败" description={testError} showIcon style={{ marginBottom: 12 }} />
          )}

          <Space wrap style={{ marginBottom: 24 }}>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              loading={testLoading}
              onClick={() => void runTest()}
            >
              发送测试
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => void handleResetMock()}>
              重置 Example
            </Button>
            <Button
              className="ai-btn"
              icon={<RobotOutlined />}
              disabled={!profile || !selectedOperation}
              onClick={handleAiGenerate}
            >
              AI Mock数据
            </Button>
            <Button
              icon={<ToolOutlined />}
              disabled={!testError && !parseError}
              onClick={handleAutoFix}
            >
              自动修复
            </Button>
          </Space>

          {result && (
            <div className="api-service-test__result" style={{ paddingBottom: 40 }}>
              {result.executableReason && result.executable === false && (
                <Alert
                  type="warning"
                  title={result.executableReason}
                  showIcon
                  style={{ marginBottom: 12 }}
                />
              )}
              <Collapse
                defaultActiveKey={['response']}
                items={[
                  {
                    key: 'response',
                    label: '响应结果',
                    children:
                      result.preview != null ? (
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.5 }}>
                          {JSON.stringify(result.preview, null, 2)}
                        </pre>
                      ) : (
                        <Text type="secondary">无响应体</Text>
                      ),
                  },
                  ...(result.requestPreview
                    || result.query
                    || result.body
                    || result.pathParams
                    || result.parameters
                    ? [{
                        key: 'request',
                        label: '请求信息',
                        children: (
                          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.5 }}>
                            {JSON.stringify(
                              result.requestPreview || {
                                method: result.httpMethod,
                                url: result.url,
                                pathParams: result.pathParams,
                                query: result.query,
                                body: result.body,
                                parameters: result.parameters,
                              },
                              null,
                              2,
                            )}
                          </pre>
                        ),
                      }]
                    : []),
                  {
                    key: 'meta',
                    label: '执行信息',
                    children: (
                      <Descriptions size="small" column={1}>
                        <Descriptions.Item label="请求">
                          <Text code>
                            {result.httpMethod} {result.url}
                          </Text>
                        </Descriptions.Item>
                        {typeof result.durationMs === 'number' && (
                          <Descriptions.Item label="耗时">{result.durationMs} ms</Descriptions.Item>
                        )}
                        <Descriptions.Item label="状态">
                          <Space size={8} wrap>
                            {result.rolledBack && <Tag color="blue">写操作已回滚</Tag>}
                            {result.rolledBack === false
                              && isWriteOperation(result.operation || selectedOperation)
                              && result.executable !== false && (
                              <Tag color="orange">已落库</Tag>
                            )}
                            {result.executable === false && <Tag color="warning">未执行</Tag>}
                            {result.executable !== false
                              && !result.rolledBack
                              && !(
                                result.rolledBack === false
                                && isWriteOperation(result.operation || selectedOperation)
                              ) && (
                              <Tag color="success">成功</Tag>
                            )}
                          </Space>
                        </Descriptions.Item>
                        {result.operation ? (
                          <Descriptions.Item label="操作">{result.operation}</Descriptions.Item>
                        ) : null}
                      </Descriptions>
                    ),
                  },
                ]}
              />
              <TestResultScrollAnchor result={result} />
            </div>
          )}
        </div>
      )}
    </FixHeaderPage>
  );
};

export default ApiServiceTestPage;
