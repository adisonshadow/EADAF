import { PlayCircleOutlined, RobotOutlined } from '@ant-design/icons';
import { Alert, Button, Collapse, Descriptions, Space, Spin, Tag, Typography } from 'antd';
import { message } from '@/utils/antdAppApis';
import Editor from '@monaco-editor/react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAISurface, useAIChatPrompts, sendMockUserMessage } from '@eadaf/ai-base';
import PageContainerTitleWithBack from '@/components/PageContainerTitleWithBack';
import FixHeaderPage, { useFixHeaderPageScroll } from '@/components/FixHeaderPage';
import {
  getOutboundWebhookTestProfile,
  postOutboundWebhookTest,
} from '@/services/EADAF/api/outboundWebhooks';
import { isApiSuccess, getApiData } from '@/utils/apiResponse';
import { buildOutboundWebhookTestPrompt } from '../../ai/buildOutboundWebhookTestPrompt';
import '../outboundWebhookForm.css';

const { Text, Paragraph } = Typography;
const MONACO_OPTIONS = { minimap: { enabled: false }, fontSize: 13, wordWrap: 'on' as const };

const TestResultScrollAnchor: React.FC<{ result: API.OutboundWebhookTestResult | null }> = ({ result }) => {
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

const OutboundWebhookTestPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [profile, setProfile] = useState<API.OutboundWebhookTestProfile>();
  const [mockData, setMockData] = useState('{}');
  const [result, setResult] = useState<API.OutboundWebhookTestResult | null>(null);
  const mockDataRef = useRef(mockData);
  mockDataRef.current = mockData;

  const chatPrompts = useMemo(() => [], []);
  useAIChatPrompts(chatPrompts);

  useAISurface({
    id: 'apiservice.outbound_webhook.test',
    domain: 'apiservice',
    label: '提交外部API测试',
    read: () => ({ mockData: mockDataRef.current, webhookId: id }),
    refresh: () => void loadProfile(),
  });

  const loadProfile = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await getOutboundWebhookTestProfile(id);
      if (isApiSuccess(res)) {
        const data = getApiData<API.OutboundWebhookTestProfile>(res);
        setProfile(data);
        setMockData(data?.mockData || '{}');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProfile();
  }, [id]);

  const handleRunTest = async () => {
    if (!id) return;
    setRunning(true);
    setResult(null);
    try {
      const res = await postOutboundWebhookTest(id, { mockData });
      if (isApiSuccess(res)) {
        setResult(getApiData<API.OutboundWebhookTestResult>(res) || null);
        message.success('测试完成');
      } else {
        message.error(res.message || '测试失败');
      }
    } catch {
      message.error('测试失败');
    } finally {
      setRunning(false);
    }
  };

  const handleAiTest = () => {
    if (!id) return;
    sendMockUserMessage(buildOutboundWebhookTestPrompt({ mockData, webhookId: id }));
  };

  return (
    <FixHeaderPage
      title={(
        <PageContainerTitleWithBack
          title={profile?.name ? `测试 · ${profile.name}` : '测试提交外部API'}
          backTo="/api_services/outbound-webhooks"
        />
      )}
      subTitle={profile?.code ? `编码 ${profile.code}` : '用 Mock Data 运行处置脚本并真实调用外部 API'}
      extra={
        <Space>
          {id ? (
            <Button onClick={() => navigate(`/api_services/outbound-webhooks/${id}/edit`)}>
              返回编辑
            </Button>
          ) : null}
          <Button className="ai-btn" icon={<RobotOutlined />} onClick={handleAiTest}>
            AI 自动测试
          </Button>
          <Button type="primary" icon={<PlayCircleOutlined />} loading={running} onClick={() => void handleRunTest()}>
            运行测试
          </Button>
        </Space>
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <Spin description="正在加载测试上下文…" />
        </div>
      ) : null}

      {!loading && !profile ? (
        <Alert type="error" message="未找到配置" showIcon />
      ) : null}

      {!loading && profile ? (
        <div className="outbound-webhook-test">
          <Alert
            type="warning"
            showIcon
            message="测试将真实调用外部 API"
            description={`系统会用 Mock Data 运行处置脚本，然后以 ${profile.httpMethod || 'POST'} 调用目标 URL。请确保目标可达且可承受测试请求。`}
            style={{ marginBottom: 16 }}
          />

          <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="名称">{profile.name}</Descriptions.Item>
            <Descriptions.Item label="编码">{profile.code}</Descriptions.Item>
            <Descriptions.Item label="Method">
              <Tag>{profile.httpMethod || 'POST'}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="鉴权">
              {profile.authType && profile.authType !== 'none'
                ? `${profile.authType}${profile.authSecretSet ? '（已缓存密钥）' : '（未设密钥）'}`
                : '无'}
            </Descriptions.Item>
            <Descriptions.Item label="目标 URL" span={2}>
              <Text copyable>{profile.targetUrl}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="触发业务 API">{profile.triggerApiServiceCode || '-'}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={profile.status === 'published' ? 'success' : 'default'}>{profile.status}</Tag>
            </Descriptions.Item>
          </Descriptions>

          <Collapse
            style={{ marginBottom: 16 }}
            items={[
              ...(profile.requestStructure
                ? [{
                    key: 'structure',
                    label: '请求结构（TypeScript interface）',
                    children: (
                      <Editor
                        height={160}
                        language="typescript"
                        theme="vs"
                        value={profile.requestStructure}
                        options={{ ...MONACO_OPTIONS, readOnly: true }}
                      />
                    ),
                  }]
                : []),
              ...(profile.requestExample
                ? [{
                    key: 'example',
                    label: '请求 Demo（发往外部的 Example，只读参考）',
                    children: (
                      <Editor
                        height={160}
                        language="json"
                        theme="vs"
                        value={profile.requestExample}
                        options={{ ...MONACO_OPTIONS, readOnly: true }}
                      />
                    ),
                  }]
                : []),
              ...(profile.responseConfig?.exception?.rules?.length
                ? [{
                    key: 'rules',
                    label: '异常判定规则',
                    children: (
                      <Space wrap>
                        {(profile.responseConfig.exception?.rules || []).map((rule) => (
                          <Tag key={rule}>{rule}</Tag>
                        ))}
                        {profile.responseConfig.httpStatusAsException !== false ? (
                          <Tag color="orange">HTTP 非 2xx</Tag>
                        ) : null}
                      </Space>
                    ),
                  }]
                : []),
            ]}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              Mock Data（模拟业务 API 返回的数据）
            </Paragraph>
            <Button
              size="small"
              className="ai-btn"
              icon={<RobotOutlined />}
              style={{ marginLeft: 'auto' }}
              onClick={handleAiTest}
            >
              AI 生成 Mock
            </Button>
          </div>
          <Editor
            height={180}
            language="json"
            theme="vs"
            value={mockData}
            onChange={(v) => setMockData(v || '{}')}
            options={MONACO_OPTIONS}
          />

          <Space wrap style={{ marginTop: 16, marginBottom: 24 }}>
            <Button type="primary" icon={<PlayCircleOutlined />} loading={running} onClick={() => void handleRunTest()}>
              运行测试
            </Button>
            <Button className="ai-btn" icon={<RobotOutlined />} onClick={handleAiTest}>
              AI 自动测试
            </Button>
          </Space>

          {result ? (
            <div className="outbound-webhook-test__result">
              <Collapse
                defaultActiveKey={['result', 'evaluation']}
                items={[
                  {
                    key: 'result',
                    label: `测试结果（${result.status === 'success' ? '成功' : '失败'}，耗时 ${result.durationMs}ms）`,
                    children: (
                      <Descriptions bordered size="small" column={1}>
                        <Descriptions.Item label="处置脚本输出（发往外部的 body）">
                          <pre style={{ margin: 0, maxHeight: 200, overflow: 'auto', fontSize: 12 }}>
                            {JSON.stringify(result.transformedBody, null, 2)}
                          </pre>
                        </Descriptions.Item>
                        <Descriptions.Item label="外部 API 响应状态码">
                          {result.responseStatus ? (
                            <Tag color={result.responseStatus >= 200 && result.responseStatus < 300 ? 'success' : 'error'}>
                              {result.responseStatus}
                            </Tag>
                          ) : '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="外部 API 响应体">
                          <pre style={{ margin: 0, maxHeight: 200, overflow: 'auto', fontSize: 12 }}>
                            {result.responseBody || '(空)'}
                          </pre>
                        </Descriptions.Item>
                        {result.errorMessage ? (
                          <Descriptions.Item label="错误信息">
                            <Text type="danger">{result.errorMessage}</Text>
                          </Descriptions.Item>
                        ) : null}
                      </Descriptions>
                    ),
                  },
                  {
                    key: 'evaluation',
                    label: '规则判定',
                    children: (
                      <Descriptions bordered size="small" column={1}>
                        <Descriptions.Item label="判定结果">
                          <Tag color={result.evaluation?.ok !== false && result.status === 'success' ? 'success' : 'error'}>
                            {result.evaluation?.ok === false || result.status === 'failed' ? '失败' : '成功'}
                          </Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label="HTTP 层失败">
                          {result.evaluation?.httpFailed ? '是' : '否'}
                        </Descriptions.Item>
                        <Descriptions.Item label="命中的异常规则">
                          {result.evaluation?.matchedRules?.length
                            ? (
                              <Space wrap>
                                {result.evaluation.matchedRules.map((r) => (
                                  <Tag key={r} color="error">{r}</Tag>
                                ))}
                              </Space>
                            )
                            : <Text type="secondary">无</Text>}
                        </Descriptions.Item>
                        {result.evaluation?.errorMessage ? (
                          <Descriptions.Item label="判定说明">
                            <Text type="danger">{result.evaluation.errorMessage}</Text>
                          </Descriptions.Item>
                        ) : null}
                      </Descriptions>
                    ),
                  },
                ]}
              />
              <TestResultScrollAnchor result={result} />
            </div>
          ) : null}
        </div>
      ) : null}
    </FixHeaderPage>
  );
};

export default OutboundWebhookTestPage;
