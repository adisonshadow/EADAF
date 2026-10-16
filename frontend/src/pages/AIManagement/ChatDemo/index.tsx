import { BulbOutlined, RobotOutlined, UserOutlined } from '@ant-design/icons';
import { Bubble, Prompts, Sender, Welcome, XProvider } from '@ant-design/x';
import { useXChat } from '@ant-design/x-sdk';
import { PageContainer } from '@ant-design/pro-components';
import { Avatar, Flex, Select } from 'antd';
import { message } from '@/utils/antdAppApis';
import React, { useEffect, useMemo, useState } from 'react';
import { getAiServiceModels, type AiServiceModelInfo } from '@/services/UAC/api/aiService';
import { createEADAFChatProvider, type EADAFChatMessage } from './EADAFChatProvider';
import { extractAiChatErrorMessage } from '@eadaf/ai-base';
import AssistantMarkdown from './AssistantMarkdown';

const renderAssistantContent = (
  content: React.ReactNode,
  info: { status?: string; extraInfo?: { reasoningContent?: string } },
) => {
  const text = typeof content === 'string' ? content : String(content ?? '');
  return (
    <AssistantMarkdown
      content={text}
      reasoningContent={info.extraInfo?.reasoningContent}
      status={info.status}
    />
  );
};

const bubbleRoles = {
  assistant: {
    placement: 'start' as const,
    avatar: <Avatar icon={<RobotOutlined />} />,
    contentRender: renderAssistantContent,
  },
  user: {
    placement: 'end' as const,
    avatar: <Avatar icon={<UserOutlined />} />,
  },
};

const promptItems = [
  { key: '1', label: '你好，请介绍一下你自己' },
  { key: '2', label: '用三句话说明 EADAF 系统的作用' },
  { key: '3', label: '帮我写一段产品简介' },
];

const ChatDemoPage: React.FC = () => {
  const [modelOptions, setModelOptions] = useState<{ label: string; value: string }[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>();
  const [senderValue, setSenderValue] = useState('');
  const [deepThinking, setDeepThinking] = useState(false);
  const [provider] = useState(() => createEADAFChatProvider());

  const { messages, onRequest, isRequesting, abort } = useXChat({
    provider,
    requestPlaceholder: (): EADAFChatMessage => ({
      role: 'assistant',
      content: '正在思考中...',
    }),
    requestFallback: (_, { error, messageInfo }): EADAFChatMessage => {
      if (error.name === 'AbortError') {
        return {
          role: 'assistant',
          content: messageInfo?.message?.content || '已取消回复',
        };
      }
      const msg = extractAiChatErrorMessage(error);
      if (msg.includes('content-type') && msg.includes('not support')) {
        return {
          role: 'assistant',
          content: 'AI 服务返回异常（非 JSON/SSE），请检查 Provider API Key 与 base_url 配置是否正确',
        };
      }
      return {
        role: 'assistant',
        content: msg || '请求失败，请稍后重试',
      };
    },
  });

  useEffect(() => {
    const loadModels = async () => {
      try {
        const response = await getAiServiceModels();
        const models = response?.data || [];
        setModelOptions(
          models.map((item: AiServiceModelInfo) => ({
            label: `${item.displayName} (${item.slug})`,
            value: item.slug,
          })),
        );
        if (models[0]?.slug) {
          setSelectedSlug(models[0].slug);
        }
      } catch {
        message.error('加载模型列表失败');
      }
    };
    loadModels();
  }, []);

  const bubbleItems = useMemo(
    () =>
      messages.map(({ id, message: msg, status }) => ({
        key: id,
        role: msg.role,
        content: msg.content,
        loading: status === 'loading',
        status,
        streaming:
          msg.role === 'assistant' && (status === 'loading' || status === 'updating'),
        extraInfo: {
          reasoningContent: (msg as { reasoningContent?: string }).reasoningContent,
        },
      })),
    [messages],
  );

  const handleSubmit = (content: string) => {
    if (!selectedSlug) {
      message.warning('请先选择模型');
      return;
    }
    if (!content.trim()) {
      return;
    }
    setSenderValue('');
    onRequest({ query: content, slug: selectedSlug, enableThinking: deepThinking });
  };

  const isEmpty = messages.length === 0;

  return (
    <PageContainer pageHeaderRender={() => {return <></> }}>
      <Flex vertical gap={16} style={{ height: 'calc(100vh - 220px)', minHeight: 520 }}>
        <Flex align="center" gap={12} wrap="wrap">
          <span>选择模型：</span>
          <Select
            style={{ minWidth: 320 }}
            placeholder="请选择 AI 模型"
            options={modelOptions}
            value={selectedSlug}
            onChange={setSelectedSlug}
            showSearch
            optionFilterProp="label"
          />
        </Flex>

        <XProvider>
          <Flex
            vertical
            flex={1}
            style={{
              border: '1px solid #f0f0f0',
              borderRadius: 8,
              overflow: 'hidden',
              background: '#fff',
            }}
          >
            {isEmpty ? (
              <Flex vertical flex={1} align="center" justify="center" gap={16} style={{ padding: 24 }}>
                <Welcome
                  title="AI Chat Demo"
                  description="选择模型后开始对话，体验 EADAF AI 网关流式能力"
                  variant="borderless"
                />
                <Prompts
                  items={promptItems}
                  wrap
                  onItemClick={(info) => {
                    const label = String(info.data.label || '');
                    setSenderValue(label);
                  }}
                />
              </Flex>
            ) : (
              <Bubble.List
                style={{ flex: 1, overflow: 'auto', padding: 16 }}
                items={bubbleItems}
                role={bubbleRoles}
                autoScroll
              />
            )}

            <Sender
              style={{ padding: 16, borderTop: '1px solid #f0f0f0' }}
              value={senderValue}
              loading={isRequesting}
              onChange={setSenderValue}
              onSubmit={handleSubmit}
              onCancel={abort}
              placeholder="输入消息，Enter 发送"
              footer={
                <Sender.Switch
                  icon={<BulbOutlined />}
                  checkedChildren="深度思考"
                  unCheckedChildren="深度思考"
                  value={deepThinking}
                  onChange={setDeepThinking}
                  disabled={isRequesting}
                />
              }
            />
          </Flex>
        </XProvider>
      </Flex>
    </PageContainer>
  );
};

export default ChatDemoPage;
