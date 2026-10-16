import { PlayCircleOutlined, RobotOutlined } from '@ant-design/icons';
import { sendMockUserMessage, useAISurface } from '@eadaf/ai-base';
import { Alert, Button, Collapse, Descriptions, Input, Space, Spin, Tag, Typography } from 'antd';
import { message } from '@/utils/antdAppApis';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageContainerTitleWithBack from '@/components/PageContainerTitleWithBack';
import FixHeaderPage from '@/components/FixHeaderPage';
import { buildCollectionPipelineTestPrompt } from '@/pages/BusinessData/ai/buildCollectionPipelineTestPrompt';
import {
  getCollectionPipelineTestProfile,
  postCollectionPipelineTest,
} from '@/services/EADAF/api/businessData';
import { getApiData, getApiErrorMessage, isApiSuccess } from '@/utils/apiResponse';

const { Paragraph } = Typography;
const { TextArea } = Input;

const listPath = '/api_services/collection-pipelines';

const CollectionPipelineTestPage: React.FC = () => {
  const navigate = useNavigate();
  const { id: pipelineId } = useParams<{ id: string }>();
  const [profileLoading, setProfileLoading] = useState(true);
  const [testLoading, setTestLoading] = useState(false);
  const [profile, setProfile] = useState<API.CollectionPipelineTestProfile | null>(null);
  const [rawInput, setRawInput] = useState('');
  const [testError, setTestError] = useState<string | null>(null);
  const [result, setResult] = useState<API.CollectionPipelineTestResult | null>(null);

  const rawInputRef = useRef(rawInput);
  rawInputRef.current = rawInput;
  const pipelineIdRef = useRef(pipelineId);
  pipelineIdRef.current = pipelineId;

  const loadProfile = useCallback(async () => {
    if (!pipelineId) return;
    setProfileLoading(true);
    try {
      const res = await getCollectionPipelineTestProfile(pipelineId);
      if (!isApiSuccess(res)) {
        message.error(getApiErrorMessage(res, '加载测试配置失败'));
        return;
      }
      const data = getApiData<API.CollectionPipelineTestProfile>(res);
      setProfile(data ?? null);
      setRawInput(data?.sampleData || '');
    } finally {
      setProfileLoading(false);
    }
  }, [pipelineId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useAISurface({
    id: 'bizdata.collection-pipeline.test',
    domain: 'bizdata',
    label: '采集管道测试',
    read: () => ({
      pipelineId: pipelineIdRef.current,
      code: profile?.code,
      name: profile?.name,
      rawInput: rawInputRef.current,
      protocolType: profile?.protocolType,
      targetStructure: profile?.targetStructure,
      parseScript: profile?.parseScript,
      storeScript: profile?.storeScript,
      lastTestError: testError,
      lastTestResult: result,
    }),
    refresh: () => {
      if (profile?.sampleData != null) setRawInput(profile.sampleData);
    },
  });

  const runTest = async (runType = 'test') => {
    if (!pipelineId) return;
    setTestLoading(true);
    setTestError(null);
    try {
      const res = await postCollectionPipelineTest(pipelineId, {
        rawInput,
        runType,
      });
      if (!isApiSuccess(res)) {
        const err = getApiErrorMessage(res, '测试失败');
        setTestError(err);
        message.error(err);
        return;
      }
      const data = getApiData<API.CollectionPipelineTestResult>(res);
      setResult(data ?? null);
      message.success(data?.rolledBack ? '测试完成（已回滚）' : '测试完成');
    } catch (error) {
      const err = getApiErrorMessage(error, '测试失败');
      setTestError(err);
      message.error(err);
    } finally {
      setTestLoading(false);
    }
  };

  const runAiTest = () => {
    sendMockUserMessage(
      buildCollectionPipelineTestPrompt({
        code: profile?.code,
        name: profile?.name,
      }),
    );
  };

  return (
    <FixHeaderPage
      title={(
        <PageContainerTitleWithBack
          title={`测试请求${profile?.code ? ` · ${profile.code}` : ''}`}
        />
      )}
      extra={
        pipelineId ? (
          <Button onClick={() => navigate(`${listPath}/${pipelineId}/edit`)}>去编辑</Button>
        ) : null
      }
    >
      {profileLoading && (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <Spin description="加载中…" />
        </div>
      )}

      {!profileLoading && (
        <div style={{ maxWidth: 888, margin: '0 auto', padding: '0 24px 24px' }}>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message={profile?.ingestUrl ? `采集 API: POST ${profile.ingestUrl}` : undefined}
            description={
              <>
                <div>{profile?.authHint}</div>
                <div>{profile?.bodyHint}</div>
              </>
            }
          />

          <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="code">{profile?.code}</Descriptions.Item>
            <Descriptions.Item label="协议">{profile?.protocolType}</Descriptions.Item>
            <Descriptions.Item label="实体">{profile?.entityCode}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag>{profile?.status}</Tag>
            </Descriptions.Item>
          </Descriptions>

          <Paragraph strong>原始样本数据</Paragraph>
          <TextArea
            rows={6}
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            placeholder="输入与业务系统 POST 相同的 plain text 样本"
            style={{ marginBottom: 16 }}
          />

          <Space style={{ marginBottom: 16 }}>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              loading={testLoading}
              onClick={() => void runTest('test')}
            >
              运行测试
            </Button>
            <Button icon={<RobotOutlined />} onClick={runAiTest}>
              AI 自动测试
            </Button>
          </Space>

          {testError ? <Alert type="error" message={testError} style={{ marginBottom: 16 }} /> : null}

          {result ? (
            <Collapse
              defaultActiveKey={['parse', 'store']}
              items={[
                {
                  key: 'parse',
                  label: '解析结果',
                  children: (
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                      {JSON.stringify(result.parseOutput, null, 2)}
                    </pre>
                  ),
                },
                {
                  key: 'store',
                  label: '存储结果',
                  children: (
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                      {JSON.stringify(result.storeOutput, null, 2)}
                    </pre>
                  ),
                },
                {
                  key: 'meta',
                  label: '执行信息',
                  children: (
                    <Descriptions size="small" column={1}>
                      <Descriptions.Item label="耗时">{result.durationMs} ms</Descriptions.Item>
                      <Descriptions.Item label="回滚">
                        {result.rolledBack ? '是（测试模式）' : '否'}
                      </Descriptions.Item>
                      <Descriptions.Item label="runId">{result.runId}</Descriptions.Item>
                    </Descriptions>
                  ),
                },
              ]}
            />
          ) : null}
        </div>
      )}
    </FixHeaderPage>
  );
};

export default CollectionPipelineTestPage;
