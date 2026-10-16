import { EditOutlined } from '@ant-design/icons';
import { invalidateSkillCache, sendMockUserMessage, useChatReference } from '@eadaf/ai-base';
import { PageContainer, ProForm, ProFormDependency, ProFormSelect, ProFormSwitch, ProFormText, ProFormTextArea } from '@ant-design/pro-components';
import { Button, Flex, Form, Input, Radio, Space, Spin, theme } from 'antd';
import { message } from '@/utils/antdAppApis';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAIFormSurface } from '@/ai/useAIFormSurface';
import ChatReferenceTarget from '@/components/ChatReferenceTarget';
import MilkdownCrepeEditor from '@/components/MilkdownCrepeEditor';
import PageContainerTitleWithBack from '@/components/PageContainerTitleWithBack';
import {
  getAdminSkillsId,
  patchAdminSkillsId,
  postAdminSkills,
} from '@/services/EADAF/api/adminSkills';
import { getApplications } from '@/services/EADAF/api/applications';
import { getAdminTools } from '@/services/EADAF/api/adminTools';
import { getApiData, isApiSuccess } from '@/utils/apiResponse';
import { SLUG_PATTERN } from '../constants';
import {
  buildSkillAutoOptimizePrompt,
  buildSkillContentReference,
  buildSkillFormReference,
} from '../ai/chatReferenceUtils';

function parseCompletionStrategyText(text: string | undefined): Record<string, unknown> | null | undefined {
  const raw = text?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null) return null;
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('completionStrategy 须为 JSON 对象');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && error.message.includes('completionStrategy')) throw error;
    throw new Error('completionStrategy 不是合法 JSON');
  }
}

export type SkillPageMode = 'create' | 'view' | 'edit';

type SkillApplicationScope = 'global' | 'dedicated';

function toApplicationScope(isGlobal?: boolean, isDedicated?: boolean): SkillApplicationScope {
  if (isDedicated) return 'dedicated';
  return 'global';
}

const PAGE_TITLE: Record<SkillPageMode, string> = {
  create: '新建 Skill',
  view: 'Skill 详情',
  edit: '编辑 Skill',
};

function toToolOption(item: { id: string; name: string; functionName?: string; slug?: string }) {
  return {
    label: `${item.name} (${item.functionName || item.slug || item.id})`,
    value: item.id,
  };
}

function mergeToolOptions(
  current: { label: string; value: string }[],
  extra: Array<{ id: string; name: string; functionName?: string; slug?: string }>,
) {
  const map = new Map(current.map((option) => [option.value, option]));
  extra.forEach((item) => {
    if (item?.id && !map.has(item.id)) {
      map.set(item.id, toToolOption(item));
    }
  });
  return Array.from(map.values());
}

async function fetchAllActiveToolOptions() {
  const size = 100;
  let page = 1;
  let total = Infinity;
  const items: Record<string, any>[] = [];

  while (items.length < total) {
    const response = await getAdminTools({ page, size, isActive: true });
    if (!isApiSuccess(response)) break;
    const data = getApiData<{ total?: number; items?: Record<string, any>[] }>(response);
    const batch = data?.items || [];
    total = data?.total ?? batch.length;
    items.push(...batch);
    if (!batch.length || items.length >= total) break;
    page += 1;
  }

  return items.flatMap((item) => {
    if (typeof item.id !== 'string' || typeof item.name !== 'string') return [];
    return [toToolOption(item as { id: string; name: string; functionName?: string; slug?: string })];
  });
}

type ContentViewMode = 'editor' | 'markdown';

const CONTENT_VIEW_OPTIONS = [
  { label: 'Editor', value: 'editor' },
  { label: 'Markdown', value: 'markdown' },
];

interface SkillContentFieldProps {
  value?: string;
  onChange?: (value: string) => void;
  viewMode: ContentViewMode;
  editorKey: number;
  readonly?: boolean;
}

const SkillContentField: React.FC<SkillContentFieldProps> = ({
  value,
  onChange,
  viewMode,
  editorKey,
  readonly,
}) => {
  const { token } = theme.useToken();

  if (viewMode === 'markdown') {
    return (
      <Input.TextArea
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        readOnly={readonly}
        placeholder="在此编写 Skill 指令..."
        spellCheck={false}
        style={{
          minHeight: 360,
          fontFamily: token.fontFamilyCode,
        }}
      />
    );
  }

  return (
    <MilkdownCrepeEditor
      value={value}
      onChange={onChange}
      editorKey={editorKey}
      readonly={readonly}
      placeholder="在此编写 Skill 指令..."
      minHeight={360}
    />
  );
};

interface SkillFormPageProps {
  mode: SkillPageMode;
}

const SkillFormPage: React.FC<SkillFormPageProps> = ({ mode }) => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(mode !== 'create');
  const [saving, setSaving] = useState(false);
  const [toolOptions, setToolOptions] = useState<{ label: string; value: string }[]>([]);
  const [applicationOptions, setApplicationOptions] = useState<{ label: string; value: string }[]>([]);
  const [editorKey, setEditorKey] = useState(0);
  const [contentViewMode, setContentViewMode] = useState<ContentViewMode>('editor');
  const { token } = theme.useToken();
  const { addReference } = useChatReference();

  const readOnly = mode === 'view';
  const listPath = '/ai_management/skills';

  const referenceContext = { toolOptions, applicationOptions };

  const handleAddFormReference = () => {
    const values = form.getFieldsValue();
    addReference(buildSkillFormReference(values, referenceContext));
  };

  const handleAutoOptimize = () => {
    const values = form.getFieldsValue();
    addReference(buildSkillFormReference(values, referenceContext));
    sendMockUserMessage(buildSkillAutoOptimizePrompt(values));
  };

  useEffect(() => {
    void fetchAllActiveToolOptions().then(setToolOptions);

    getApplications({ size: -1 }).then((response) => {
      if (isApiSuccess(response)) {
        const data = getApiData<{ items: Record<string, any>[] }>(response);
        setApplicationOptions(
          (data?.items || []).map((item) => ({
            label: `${item.name}${item.code ? ` (${item.code})` : ''}`,
            value: item.application_id,
          })),
        );
      }
    });
  }, []);

  const loadDetail = useCallback(async () => {
    if (mode === 'create' || !id) return;

    setLoading(true);
    try {
      const response = await getAdminSkillsId({ id });
      if (!isApiSuccess(response)) {
        message.error('获取 Skill 详情失败');
        navigate(listPath, { replace: true });
        return;
      }
      const data = getApiData<Record<string, any>>(response);
      if (!data) {
        message.error('获取 Skill 详情失败');
        navigate(listPath, { replace: true });
        return;
      }
      form.setFieldsValue({
        ...data,
        applicationScope: toApplicationScope(data.isGlobal, data.isDedicated),
        toolIds: (data.tools || []).map((t: any) => t.id),
        applicationIds: data.applicationIds || [],
        completionStrategyText: data.completionStrategy
          ? JSON.stringify(data.completionStrategy, null, 2)
          : '',
      });
      setToolOptions((prev) => mergeToolOptions(prev, data.tools || []));
      setEditorKey(Date.now());
    } catch {
      message.error('获取 Skill 详情失败');
      navigate(listPath, { replace: true });
    } finally {
      setLoading(false);
    }
  }, [form, id, listPath, mode, navigate]);

  useAIFormSurface({
    resourceType: 'skill',
    resourceId: mode !== 'create' ? id : undefined,
    form,
    reloadDetail: loadDetail,
  });

  useEffect(() => {
    setContentViewMode('editor');
  }, [id, mode]);

  useEffect(() => {
    if (mode === 'create') {
      form.resetFields();
      form.setFieldsValue({
        isActive: true,
        applicationScope: 'global',
        contentMarkdown: '# 新 Skill\n\n在此编写 Skill 指令...',
      });
      setEditorKey(Date.now());
      setLoading(false);
      return;
    }

    if (!id) {
      navigate(listPath, { replace: true });
      return;
    }

    void loadDetail();
  }, [form, id, listPath, loadDetail, mode, navigate]);

  // options 晚于表单值就绪时，强制 Select 重新解析 label（避免只显示 UUID）
  useEffect(() => {
    if (mode === 'create' || loading || !toolOptions.length) return;
    const toolIds = form.getFieldValue('toolIds') as string[] | undefined;
    if (toolIds?.length) {
      form.setFieldsValue({ toolIds: [...toolIds] });
    }
  }, [form, loading, mode, toolOptions]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const completionStrategy = parseCompletionStrategyText(values.completionStrategyText);
      setSaving(true);
      const applicationScope = values.applicationScope as SkillApplicationScope;
      const payload = {
        name: values.name,
        slug: values.slug?.trim(),
        description: values.description,
        contentMarkdown: values.contentMarkdown,
        toolIds: values.toolIds || [],
        isActive: values.isActive,
        isGlobal: applicationScope === 'global',
        isDedicated: applicationScope === 'dedicated',
        applicationIds: applicationScope === 'dedicated' ? values.applicationIds || [] : [],
        completionStrategy,
      };

      if (mode === 'create') {
        const response = await postAdminSkills(payload);
        if (!isApiSuccess(response)) {
          message.error('创建 Skill 失败');
          return;
        }
        message.success('创建成功');
      } else if (id) {
        const response = await patchAdminSkillsId({ id }, payload);
        if (!isApiSuccess(response)) {
          message.error('更新 Skill 失败');
          return;
        }
        message.success('更新成功');
      }
      invalidateSkillCache();
      navigate(listPath);
    } catch (error) {
      if (error instanceof Error && /completionStrategy|JSON/.test(error.message)) {
        message.error(error.message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer
      title={
        <PageContainerTitleWithBack
          title={
            <Space size={4} align="center">
              <span>{PAGE_TITLE[mode]}</span>
              <ChatReferenceTarget onClick={handleAddFormReference} />
            </Space>
          }
        />
      }
      extra={
        readOnly ? (
          <Button
            type="primary"
            icon={<EditOutlined />}
            onClick={() => navigate(`/ai_management/skills/${id}/edit`)}
          >
            编辑
          </Button>
        ) : (
          <Space>
            <Button onClick={handleAutoOptimize}>自动优化</Button>
            <Button type="primary" loading={saving} onClick={handleSubmit}>
              保存
            </Button>
          </Space>
        )
      }
    >
      <Spin spinning={loading}>
        <ProForm form={form} submitter={false} readonly={readOnly} layout="vertical">
          <ProFormText name="name" label="名称" rules={[{ required: true }]} />
          <ProFormText
            name="slug"
            label="Skill ID"
            tooltip="唯一标识，创建后请谨慎修改"
            rules={[
              { required: true, message: '请输入 Skill ID' },
              { pattern: SLUG_PATTERN, message: '仅支持小写字母、数字与连字符' },
            ]}
          />
          <ProFormTextArea name="description" label="描述" />
          <Form.Item
            name="applicationScope"
            label="应用范围"
            tooltip="全局 Skill 对所有应用可见；专用 Skill 仅对选定的应用系统可见"
            rules={[{ required: true, message: '请选择应用范围' }]}
          >
            <Radio.Group optionType="button" buttonStyle="solid" disabled={readOnly}>
              <Radio.Button value="global">全局 Skill</Radio.Button>
              <Radio.Button value="dedicated">专用 Skill</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <ProFormDependency name={['applicationScope']}>
            {({ applicationScope }) =>
              applicationScope === 'dedicated' ? (
                <ProFormSelect
                  name="applicationIds"
                  label="支持的应用系统"
                  mode="multiple"
                  options={applicationOptions}
                  rules={[{ required: true, message: '请至少选择一个应用系统' }]}
                />
              ) : null
            }
          </ProFormDependency>
          <ProFormSelect name="toolIds" label="关联 Tool" mode="multiple" options={toolOptions} />
          {mode !== 'create' && <ProFormSwitch name="isActive" label="启用" />}
          <ProFormTextArea
            name="completionStrategyText"
            label="完成策略 (JSON)"
            tooltip="对应 aibase.skills.completion_strategy；空表示清除。字段如 requiredTools / claimRules / terminationStrictness / allowDirectAnswerTermination 等。"
            fieldProps={{
              rows: 10,
              style: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' },
            }}
            placeholder={'{\n  "terminationStrictness": "strict",\n  "requiredTools": []\n}'}
          />
          <div style={{ marginBottom: token.marginLG }}>
            <Flex justify="space-between" align="center" gap={8} style={{ marginBottom: token.marginXS }}>
              <Space size={4} align="center">
                <span
                  style={{
                    color: token.colorText,
                    fontSize: token.fontSize,
                    fontWeight: token.fontWeightStrong,
                    lineHeight: token.lineHeight,
                  }}
                >
                  Skill 内容
                </span>
                <ChatReferenceTarget
                  onClick={() => {
                    const values = form.getFieldsValue();
                    addReference(buildSkillContentReference(values));
                  }}
                />
              </Space>
              <Radio.Group
                size="small"
                optionType="button"
                buttonStyle="solid"
                value={contentViewMode}
                options={CONTENT_VIEW_OPTIONS}
                onChange={(event) => {
                  const nextMode = event.target.value as ContentViewMode;
                  if (nextMode === 'editor') {
                    setEditorKey(Date.now());
                  }
                  setContentViewMode(nextMode);
                }}
              />
            </Flex>
            <Form.Item name="contentMarkdown" noStyle>
              <SkillContentField
                viewMode={contentViewMode}
                editorKey={editorKey}
                readonly={readOnly}
              />
            </Form.Item>
          </div>
        </ProForm>
      </Spin>
    </PageContainer>
  );
};

export default SkillFormPage;
