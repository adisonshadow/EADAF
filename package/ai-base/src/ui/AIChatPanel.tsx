import { BulbOutlined, CommentOutlined, MinusOutlined, PaperClipOutlined, PlusOutlined, SettingOutlined, UserOutlined } from '@ant-design/icons';
import type { BubbleListProps, ConversationItemType } from '@ant-design/x';
import { Attachments, Bubble, Conversations, Prompts, Sender, Welcome, XProvider } from '@ant-design/x';
import type { Attachment, AttachmentsRef } from '@ant-design/x/es/attachments';
import type { BubbleListRef } from '@ant-design/x/es/bubble/interface';
import { useXConversations } from '@ant-design/x-sdk';
import { Avatar, Button, InputNumber, Popover, Progress, Segmented, Select, Space, Switch, Tag, Tooltip, message } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAIBaseChat } from '../chat/useAIBaseChat';
import type { AIBaseModelInfo, AIBaseThemeMode } from '../types';
import type { DecisionPreference, ReasoningDisplayMode } from '../config/agentPrefsChannel';
import {
  MAX_TOOL_CONCURRENCY,
  MIN_TOOL_CONCURRENCY,
} from '../config/agentPrefsChannel';
import { useAIChatLayout } from '../provider/context';
import { useEffectiveAIChatConfig } from '../provider/AIChatPageScope';
import { useChatSessionGroupId } from '../provider/ChatSessionGroupContext';
import { useChatReference } from '../provider/ChatReferenceContext';
import { registerAIChatSessionControls, subscribeAIChatMessage } from '../utils/aiChatBridge';
import { formatMessageWithReferences } from '../utils/formatChatReferences';
import { extractAiChatErrorMessage } from '../utils/formatAiChatError';
import {
  getChatStorageNamespace,
  loadChatMeta,
  saveChatMeta,
} from '../storage/chatHistoryDb';
import {
  chatSelectedModelSlugKey,
  getUserHabit,
  setUserHabit,
} from '../storage/userHabit';
import { useDebouncedEffect } from '../storage/useDebouncedEffect';
import TurnReplayPanel from './TurnReplayPanel';
import {
  getModelAttachmentAccept,
  isFileAllowedForModel,
  supportsModelAttachments,
  supportsModelVoiceInput,
} from '../utils/modelAttachmentConfig';
import type { AssistantSegment } from '../chat/chatToolSteps';
import AssistantBubbleContent from './AssistantBubbleContent';
import BubbleActions from './BubbleActions';
import { scrollBubbleListToBottom } from './bubbleListScroll';
import { extractBubbleCopyText } from './extractBubbleCopyText';
import './AIChatPanel.css';
import '../a2ui/NextStepA2uiDeck.css';
import './UserChoiceCard.css';

const DEFAULT_CONVERSATIONS: ConversationItemType[] = [
  { key: 'default', label: '新会话', group: '今天' },
];

const THEME_OPTIONS: { label: string; value: AIBaseThemeMode }[] = [
  { label: '浅色', value: 'light' },
  { label: '深色', value: 'dark' },
  { label: '自动', value: 'auto' },
];

const DECISION_OPTIONS: { label: string; value: DecisionPreference }[] = [
  { label: '让用户抉择', value: 'user' },
  { label: '让 AI 抉择', value: 'ai' },
];

const REASONING_DISPLAY_OPTIONS: { label: string; value: ReasoningDisplayMode }[] = [
  { label: '折叠', value: 'collapsed' },
  { label: '只显示3行', value: 'preview3' },
  { label: '显示全部', value: 'full' },
];

interface AIChatPanelProps {
  onClose: () => void;
}

export default function AIChatPanel({ onClose }: AIChatPanelProps) {
  const {
    headerOffset,
    panelWidth,
    client,
    autoNavigate,
    setAutoNavigate,
    toolConcurrency,
    setToolConcurrency,
    decisionPreference,
    setDecisionPreference,
    reasoningDisplayMode,
    setReasoningDisplayMode,
    themeMode,
    resolvedTheme,
    setTheme,
  } = useAIChatLayout();
  const config = useEffectiveAIChatConfig();
  const sessionGroupId = useChatSessionGroupId();
  const storageNamespace = useMemo(
    () => getChatStorageNamespace({ ...config, sessionGroupId }),
    [config, sessionGroupId],
  );
  const { references, removeReference, clearReferences } = useChatReference();
  const [messageApi, contextHolder] = message.useMessage();
  const [models, setModels] = useState<AIBaseModelInfo[]>([]);
  const [senderValue, setSenderValue] = useState('');
  const [deepThinking, setDeepThinking] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [hydratedNamespace, setHydratedNamespace] = useState<string | null>(null);
  const historyReady = hydratedNamespace === storageNamespace;
  // 瞬态系统消息（如 AI 报错）：仅展示，不进 messages/上下文/持久化。切换会话时清除。
  const [systemNotices, setSystemNotices] = useState<{ id: string; content: string }[]>([]);
  const listRef = useRef<BubbleListRef>(null);
  const attachRef = useRef<AttachmentsRef>(null);
  const modelsLoadDoneRef = useRef(false);
  const pendingExternalMessageRef = useRef<string | null>(null);

  const {
    conversations,
    activeConversationKey,
    setActiveConversationKey,
    addConversation,
    getConversation,
    setConversation,
    setConversations,
  } = useXConversations({
    defaultConversations: DEFAULT_CONVERSATIONS,
    defaultActiveConversationKey: DEFAULT_CONVERSATIONS[0].key,
  });

  useEffect(() => {
    let cancelled = false;
    void loadChatMeta(storageNamespace).then((meta) => {
      if (cancelled) return;
      if (meta?.conversations?.length) {
        setConversations(meta.conversations);
      } else {
        setConversations(DEFAULT_CONVERSATIONS);
      }
      if (meta?.activeConversationKey) {
        setActiveConversationKey(meta.activeConversationKey);
      } else {
        setActiveConversationKey(DEFAULT_CONVERSATIONS[0].key);
      }
      setHydratedNamespace(storageNamespace);
    });
    return () => {
      cancelled = true;
    };
  }, [storageNamespace, setConversations, setActiveConversationKey]);

  useDebouncedEffect(
    () => {
      if (!historyReady) return;
      void saveChatMeta(storageNamespace, {
        conversations,
        activeConversationKey,
      });
    },
    [historyReady, storageNamespace, conversations, activeConversationKey],
    300,
  );

  const {
    messages,
    isRequesting,
    selectedSlug,
    setSelectedSlug,
    submitQuery,
    retryAssistantMessage,
    abort,
    contextUsagePercent,
  } = useAIBaseChat(activeConversationKey, {
    persistMessages: historyReady,
    storageNamespace,
  });

  const selectedModel = useMemo(
    () => models.find((item) => item.slug === selectedSlug),
    [models, selectedSlug],
  );
  const attachmentEnabled = supportsModelAttachments(selectedModel?.inputTags);
  const attachmentAccept = getModelAttachmentAccept(selectedModel?.inputTags);
  const voiceInputEnabled = supportsModelVoiceInput(selectedModel?.capabilities);

  useEffect(() => {
    modelsLoadDoneRef.current = false;
    client
      .listModels()
      .then((list) => {
        setModels(list);
        modelsLoadDoneRef.current = true;
      })
      .catch((err: unknown) => {
        modelsLoadDoneRef.current = true;
        const detail =
          err instanceof Error ? err.message : typeof err === 'string' ? err : '加载模型失败';
        messageApi.error(detail || '加载模型失败');
      });
  }, [client, messageApi]);

  useEffect(() => {
    if (!models.length) return;
    const savedSlug = getUserHabit(chatSelectedModelSlugKey(), '');
    const validSaved = savedSlug && models.some((item) => item.slug === savedSlug);
    const nextSlug = validSaved ? savedSlug : models[0]?.slug;
    if (nextSlug && nextSlug !== selectedSlug) {
      setSelectedSlug(nextSlug);
      if (nextSlug !== savedSlug) {
        setUserHabit(chatSelectedModelSlugKey(), nextSlug);
      }
    }
  }, [models, selectedSlug, setSelectedSlug]);

  const handleModelChange = (slug: string) => {
    const nextModel = models.find((item) => item.slug === slug);
    setAttachments((prev) =>
      prev.filter((item) => {
        const file = item.originFileObj as File | undefined;
        return file ? isFileAllowedForModel(file, nextModel?.inputTags) : false;
      }),
    );
    setUserHabit(chatSelectedModelSlugKey(), slug);
    setSelectedSlug(slug);
  };

  const bubbleItems = useMemo(
    () => [
      ...messages.map(({ id, message: msg, status }) => {
        const text = typeof msg.content === 'string' ? msg.content.trim() : '';
        const segments = (msg as { segments?: AssistantSegment[] }).segments;
        const hasBody = !!segments?.length || !!text;
        const isPlaceholder = text === '正在思考中...' || text === '正在生成回复...';

        return {
          key: id,
          role: msg.role,
          content: msg.content,
          loading: status === 'loading' && !hasBody && (!text || isPlaceholder),
          status,
          streaming: msg.role === 'assistant' && (status === 'loading' || status === 'updating'),
          extraInfo: {
            reasoningContent: (msg as { reasoningContent?: string }).reasoningContent,
            segments,
            copyText: extractBubbleCopyText(msg.content, segments),
          },
        };
      }),
      // 瞬态系统消息（AI 报错等）：不入对话上下文，仅展示
      ...systemNotices.map((notice) => ({
        key: notice.id,
        role: 'system-error',
        content: notice.content,
      })),
    ],
    [messages, systemNotices],
  );

  const retryAssistantRef = useRef<(assistantId: string) => void>(() => {});
  const requestingRef = useRef(isRequesting);

  const bubbleRole = useMemo<BubbleListProps['role']>(
    () => ({
      assistant: {
        placement: 'start',
        variant: 'borderless',
        contentRender: (content, info) => (
          <AssistantBubbleContent
            content={content}
            status={info.status}
            reasoningContent={info.extraInfo?.reasoningContent}
            segments={info.extraInfo?.segments}
            nextStepPrompts={config.nextStepPrompts}
          />
        ),
        footer: (content, info) => {
          if (info.status === 'loading' || info.status === 'updating') return null;
          const copyText =
            (typeof info.extraInfo?.copyText === 'string' && info.extraInfo.copyText) ||
            extractBubbleCopyText(content, info.extraInfo?.segments);
          return (
            <BubbleActions
              text={copyText}
              onRetry={() => {
                if (requestingRef.current) return;
                retryAssistantRef.current(String(info.key ?? ''));
              }}
            />
          );
        },
      },
      user: {
        placement: 'end',
        avatar: <Avatar icon={<UserOutlined />} />,
      },
      // AI 报错等系统消息：红色、居中、无边框，不入对话上下文
      'system-error': {
        placement: 'start',
        variant: 'borderless',
        contentRender: (content) => <div className="aibase-chat-system-error">{content}</div>,
      },
    }),
    [config.nextStepPrompts],
  );

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    scrollBubbleListToBottom(listRef, behavior);
  }, []);

  useEffect(() => {
    if (!messages.length) return;
    scrollToBottom(messages.length <= 1 ? 'instant' : 'smooth');
  }, [messages.length, scrollToBottom]);

  const resolveModelForSubmit = useCallback(() => {
    if (selectedSlug) {
      return { slug: selectedSlug, model: selectedModel };
    }
    if (models.length > 0) {
      const first = models[0];
      setSelectedSlug(first.slug);
      setUserHabit(chatSelectedModelSlugKey(), first.slug);
      return { slug: first.slug, model: first };
    }
    return null;
  }, [models, selectedModel, selectedSlug, setSelectedSlug]);

  const handleSubmit = useCallback(
    async (content: string) => {
      const displayText = content.trim();
      if (!displayText && attachments.length === 0) return;

      const resolved = resolveModelForSubmit();
      if (!resolved) {
        if (!modelsLoadDoneRef.current) {
          pendingExternalMessageRef.current = displayText;
          return;
        }
        messageApi.warning('暂无可用 AI 模型，请先在「AI 管理」中配置并启用模型');
        return;
      }

      const { slug, model } = resolved;
      const apiText = formatMessageWithReferences(displayText, references);
      const pendingAttachments = attachments;

      setSenderValue('');
      setAttachments([]);
      clearReferences();
      try {
        await submitQuery(apiText, {
          enableThinking: deepThinking,
          displayContent: displayText,
          attachments: pendingAttachments,
          inputTags: model?.inputTags,
          modelSlug: slug,
        });
        requestAnimationFrame(() => scrollToBottom());

        const conversation = getConversation(activeConversationKey);
        const titleSource = displayText || pendingAttachments.map((item) => item.name).join('、');
        if (conversation?.label === '新会话' && titleSource) {
          setConversation(activeConversationKey, { ...conversation, label: titleSource.slice(0, 20) });
        }
      } catch (error) {
        // AI 报错以内联系统消息展示（红色、不入对话上下文/持久化）
        setSystemNotices((prev) => [
          ...prev,
          { id: `sys-${Date.now()}`, content: extractAiChatErrorMessage(error) },
        ]);
      }
    },
    [
      activeConversationKey,
      attachments,
      clearReferences,
      deepThinking,
      getConversation,
      messageApi,
      references,
      resolveModelForSubmit,
      scrollToBottom,
      setConversation,
      submitQuery,
    ],
  );

  const handleRetryAssistant = useCallback(
    async (assistantId: string) => {
      if (!assistantId || requestingRef.current) return;
      const resolved = resolveModelForSubmit();
      if (!resolved) {
        if (!modelsLoadDoneRef.current) {
          messageApi.warning('模型仍在加载，请稍后再试');
          return;
        }
        messageApi.warning('暂无可用 AI 模型，请先在「AI 管理」中配置并启用模型');
        return;
      }
      try {
        await retryAssistantMessage(assistantId, {
          enableThinking: deepThinking,
          modelSlug: resolved.slug,
        });
        requestAnimationFrame(() => scrollToBottom());
      } catch (error) {
        setSystemNotices((prev) => [
          ...prev,
          { id: `sys-${Date.now()}`, content: extractAiChatErrorMessage(error) },
        ]);
      }
    },
    [deepThinking, messageApi, resolveModelForSubmit, retryAssistantMessage, scrollToBottom],
  );

  useEffect(() => {
    requestingRef.current = isRequesting;
  }, [isRequesting]);

  useEffect(() => {
    retryAssistantRef.current = handleRetryAssistant;
  }, [handleRetryAssistant]);

  useEffect(() => {
    const pending = pendingExternalMessageRef.current;
    if (!pending || !modelsLoadDoneRef.current) return;

    if (models.length > 0) {
      pendingExternalMessageRef.current = null;
      void handleSubmit(pending);
      return;
    }

    pendingExternalMessageRef.current = null;
    messageApi.warning('暂无可用 AI 模型，请先在「AI 管理」中配置并启用模型');
  }, [handleSubmit, messageApi, models, selectedSlug]);

  const handleAttachmentChange = ({ fileList }: { fileList: Attachment[] }) => {
    const inputTags = selectedModel?.inputTags;
    const next = fileList.filter((item) => {
      const file = item.originFileObj as File | undefined;
      if (!file) return true;
      const allowed = isFileAllowedForModel(file, inputTags);
      if (!allowed) {
        messageApi.warning(`当前模型不支持附件类型：${file.name}`);
      }
      return allowed;
    });
    setAttachments(next);
  };

  useEffect(() => {
    registerAIChatSessionControls({
      loadConversation: setActiveConversationKey,
      getActiveConversationKey: () => activeConversationKey,
      getStorageNamespace: () => storageNamespace,
    });
    return () => registerAIChatSessionControls(null);
  }, [activeConversationKey, storageNamespace, setActiveConversationKey]);

  useEffect(() => {
    return subscribeAIChatMessage((text) => {
      // 流式期间拒绝外部提交，避免并发 turn 污染会话级 plan（P1-3）。
      // 【用户选择】是 ask_user hard-stop 后的合法续跑，必须放行。
      if (requestingRef.current && !String(text).includes('【用户选择】')) {
        messageApi.warning('助手正在处理中，请稍后再试');
        return;
      }
      void handleSubmit(text);
    });
  }, [handleSubmit, messageApi]);

  // 切换会话时清除瞬态系统消息（错误不入持久化，切回也不复现）
  useEffect(() => {
    setSystemNotices([]);
  }, [activeConversationKey]);

  const handleNewConversation = () => {
    const key = Date.now().toString();
    addConversation({ key, label: '新会话', group: '今天' });
    setActiveConversationKey(key);
  };

  /** 会话列表 DESC：新会话（Date.now key）在前；非数字 key（如 default）靠后 */
  const conversationItems = useMemo(() => {
    const rank = (key: string) => {
      const n = Number(key);
      return Number.isFinite(n) ? n : 0;
    };
    return [...conversations]
      .sort((a, b) => rank(String(b.key)) - rank(String(a.key)))
      .map((item) =>
        item.key === activeConversationKey ? { ...item, label: `[当前] ${item.label}` } : item,
      );
  }, [conversations, activeConversationKey]);

  const chatHeader = (
    <div className="aibase-chat-header">
      <div className="aibase-chat-header-title">{config.headerCaption}</div>
      <Space size={0}>
        <Button
          type="text"
          icon={<PlusOutlined />}
          className="aibase-chat-header-btn"
          onClick={handleNewConversation}
        />
        <Popover
          placement="bottomRight"
          trigger="click"
          styles={{
            container: {
              padding: 0,
              maxHeight: 'calc(80vh - 60px)',
              overflowY: 'auto',
              boxShadow:
                '0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 3px 6px -4px rgba(0, 0, 0, 0.12), 0 9px 28px 8px rgba(0, 0, 0, 0.05)',
            },
          }}
          content={
            <div data-aibase-theme={resolvedTheme}>
              <Conversations
                className="aibase-chat-conversations"
                items={[...conversations]
                  // key 多为 Date.now()；DESC 让最新会话排在分组最前
                  .sort((a, b) => String(b.key).localeCompare(String(a.key), undefined, { numeric: true }))
                  .map((item) =>
                    item.key === activeConversationKey
                      ? { ...item, label: `[当前] ${item.label}` }
                      : item,
                  )}
                activeKey={activeConversationKey}
                groupable
                onActiveChange={setActiveConversationKey}
                styles={{ item: { padding: '0 8px' } }}
              />
            </div>
          }
        >
          <Button type="text" icon={<CommentOutlined />} className="aibase-chat-header-btn" />
        </Popover>
        <Popover
          placement="bottomRight"
          trigger="click"
          styles={{
            container: {
              padding: 0,
              maxHeight: 'calc(80vh - 60px)',
              overflowY: 'auto',
              boxShadow:
                '0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 3px 6px -4px rgba(0, 0, 0, 0.12), 0 9px 28px 8px rgba(0, 0, 0, 0.05)',
            },
          }}
          content={
            <div className="aibase-chat-settings" data-aibase-theme={resolvedTheme}>
              <div className="aibase-chat-settings-row is-stacked">
                <div className="aibase-chat-settings-info">
                  <span className="aibase-chat-settings-label">外观</span>
                  <span className="aibase-chat-settings-desc">
                    与宿主应用界面主题同步。选择「自动」时跟随系统浅色 / 深色。
                  </span>
                </div>
                <Segmented
                  className="aibase-chat-settings-control"
                  size="small"
                  block
                  value={themeMode}
                  options={THEME_OPTIONS}
                  onChange={(value) => setTheme(value as AIBaseThemeMode)}
                  aria-label="AI 助手外观"
                />
              </div>
              <div className="aibase-chat-settings-row">
                <div className="aibase-chat-settings-info">
                  <span className="aibase-chat-settings-label">自动跳转</span>
                  <span className="aibase-chat-settings-desc">
                    开启后，AI 完成任务可根据语义路由自动跳转到相关页面（如创建后进入编辑页）。
                    仅约束 AI 的页面跳转工具，不影响业务工具自身的跳转。
                  </span>
                </div>
                <Switch
                  checked={autoNavigate}
                  onChange={setAutoNavigate}
                  size="small"
                  aria-label="自动跳转"
                />
              </div>
              <div className="aibase-chat-settings-row">
                <div className="aibase-chat-settings-info">
                  <span className="aibase-chat-settings-label">并行工具调用</span>
                  <span className="aibase-chat-settings-desc">
                    同一步内最多同时运行多少个可并行的 Tool 调用。默认 10，范围{' '}
                    {MIN_TOOL_CONCURRENCY}–{MAX_TOOL_CONCURRENCY}。
                  </span>
                </div>
                <InputNumber
                  className="aibase-chat-settings-control"
                  size="small"
                  min={MIN_TOOL_CONCURRENCY}
                  max={MAX_TOOL_CONCURRENCY}
                  value={toolConcurrency}
                  onChange={(value) => {
                    if (typeof value === 'number') setToolConcurrency(value);
                  }}
                  aria-label="并行工具调用数"
                />
              </div>
              <div className="aibase-chat-settings-row is-stacked">
                <div className="aibase-chat-settings-info">
                  <span className="aibase-chat-settings-label">面临抉择时倾向</span>
                  <span className="aibase-chat-settings-desc">
                    「让用户抉择」时 AI 应通过选择题征求你的意见；「让 AI 抉择」时常规取舍由
                    AI 自行决定（危险/不可逆操作仍会询问）。
                  </span>
                </div>
                <Segmented
                  className="aibase-chat-settings-control"
                  size="small"
                  block
                  value={decisionPreference}
                  options={DECISION_OPTIONS}
                  onChange={(value) => setDecisionPreference(value as DecisionPreference)}
                  aria-label="面临抉择时倾向"
                />
              </div>
              <div className="aibase-chat-settings-row is-stacked">
                <div className="aibase-chat-settings-info">
                  <span className="aibase-chat-settings-label">思考内容显示方式</span>
                  <span className="aibase-chat-settings-desc">
                    「折叠」只显示深度思考标题；「只显示3行」滚动展示最后三行，点击可展开；「显示全部」在生成过程中展开全文。
                  </span>
                </div>
                <Segmented
                  className="aibase-chat-settings-control"
                  size="small"
                  block
                  value={reasoningDisplayMode}
                  options={REASONING_DISPLAY_OPTIONS}
                  onChange={(value) => setReasoningDisplayMode(value as ReasoningDisplayMode)}
                  aria-label="思考内容显示方式"
                />
              </div>
              <div className="aibase-chat-settings-row is-stacked">
                <TurnReplayPanel />
              </div>
            </div>
          }
        >
          <Button
            type="text"
            icon={<SettingOutlined />}
            className="aibase-chat-header-btn"
            aria-label="AI 助手设置"
          />
        </Popover>
        <Button
          type="text"
          icon={<MinusOutlined />}
          className="aibase-chat-header-btn"
          onClick={onClose}
          aria-label="最小化 AI 助手"
        />
      </Space>
    </div>
  );

  return (
    <aside
      className="aibase-chat-panel"
      data-aibase-theme={resolvedTheme}
      style={{ top: headerOffset, width: panelWidth }}
    >
      {contextHolder}
      <XProvider>
        {chatHeader}

        <div className="aibase-chat-list">
          {!messages.length && !systemNotices.length ? (
            <div className="aibase-chat-empty">
              <Welcome
                variant="borderless"
                title={config.welcome.title}
                description={config.welcome.description}
                className="aibase-chat-welcome"
              />
              <Prompts
                vertical
                title="您可以试试"
                items={config.prompts}
                onItemClick={(info) => handleSubmit(String(info.data?.description || ''))}
                styles={{ title: { fontSize: 14 } }}
              />
            </div>
          ) : (
            <Bubble.List
              ref={listRef}
              className="aibase-chat-bubble-list"
              items={bubbleItems}
              role={bubbleRole}
              autoScroll
            />
          )}
        </div>

        <div className="aibase-chat-send">
          {references.length > 0 && (
            <div className="aibase-chat-references">
              {references.map((ref) => (
                <Tag
                  key={ref.id}
                  closable
                  onClose={() => removeReference(ref.id)}
                  className="aibase-chat-ref-tag"
                >
                  {ref.label}
                </Tag>
              ))}
            </div>
          )}
          <Sender
            value={senderValue}
            onChange={setSenderValue}
            loading={isRequesting}
            onSubmit={handleSubmit}
            onCancel={abort}
            placeholder="输入消息，Enter 发送"
            allowSpeech={voiceInputEnabled}
            header={
              attachmentEnabled ? (
                <Sender.Header open={attachments.length > 0} forceRender>
                  <Attachments
                    ref={attachRef}
                    items={attachments}
                    onChange={handleAttachmentChange}
                    overflow="scrollX"
                    beforeUpload={() => false}
                    accept={attachmentAccept}
                    multiple
                  />
                </Sender.Header>
              ) : undefined
            }
            footer={
              <div className="aibase-chat-send-footer">
                {attachmentEnabled && (
                  <Button
                    type="text"
                    size="small"
                    className="aibase-chat-attach-btn"
                    icon={<PaperClipOutlined />}
                    disabled={isRequesting}
                    aria-label="添加附件"
                    onClick={() =>
                      attachRef.current?.select({
                        accept: attachmentAccept,
                        multiple: true,
                      })
                    }
                  />
                )}
                {models.length > 1 && (
                  <Select
                    className="aibase-chat-model-select"
                    size="small"
                    variant="filled"
                    placeholder="选择模型"
                    value={selectedSlug}
                    popupMatchSelectWidth={false}
                    options={models.map((m) => ({
                      label: m.displayName,
                      value: m.slug,
                    }))}
                    onChange={handleModelChange}
                    disabled={isRequesting}
                  />
                )}
                <Sender.Switch
                  icon={<BulbOutlined />}
                  checkedChildren="深度思考"
                  unCheckedChildren="深度思考"
                  value={deepThinking}
                  onChange={setDeepThinking}
                  disabled={isRequesting}
                />
                <Tooltip title={`上下文用量 ${contextUsagePercent}%（过高时将自动整理历史消息）`}>
                  <Progress
                    type="circle"
                    percent={contextUsagePercent}
                    size={20}
                    showInfo={false}
                    className="aibase-chat-context-progress"
                    strokeColor={contextUsagePercent >= 85 ? '#faad14' : undefined}
                  />
                </Tooltip>
              </div>
            }
          />
        </div>
      </XProvider>
    </aside>
  );
}
