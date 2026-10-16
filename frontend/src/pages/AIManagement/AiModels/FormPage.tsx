import { EditOutlined } from '@ant-design/icons';
import {
  PageContainer,
  ProForm,
  ProFormDigit,
  ProFormSelect,
  ProFormSwitch,
  ProFormText,
  ProFormTextArea,
} from '@ant-design/pro-components';
import { Button, Form, Space, Spin } from 'antd';
import { message } from '@/utils/antdAppApis';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageContainerTitleWithBack from '@/components/PageContainerTitleWithBack';
import { useAIFormSurface } from '@/ai/useAIFormSurface';
import {
  getAdminModelsId,
  patchAdminModelsId,
  postAdminModels,
} from '@/services/EADAF/api/adminModels';
import { getAdminProviders } from '@/services/EADAF/api/adminProviders';
import { getApiData, isApiSuccess, parseApiListResponse } from '@/utils/apiResponse';
import { AI_CAPABILITIES, AI_MODALITIES, SLUG_PATTERN } from '../constants';

export type ModelPageMode = 'create' | 'view' | 'edit';

const PAGE_TITLE: Record<ModelPageMode, string> = {
  create: '新建 AI 模型',
  view: 'AI 模型详情',
  edit: '编辑 AI 模型',
};

interface ModelFormPageProps {
  mode: ModelPageMode;
}

const parseDefaultParams = (value?: string) => {
  if (!value || !value.trim()) {
    return undefined;
  }
  try {
    return JSON.parse(value);
  } catch {
    throw new Error('defaultParams 必须是合法 JSON');
  }
};

const stringifyDefaultParams = (value?: Record<string, unknown>) => {
  if (!value || Object.keys(value).length === 0) {
    return '';
  }
  return JSON.stringify(value, null, 2);
};

const ModelFormPage: React.FC<ModelFormPageProps> = ({ mode }) => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(mode !== 'create');
  const [saving, setSaving] = useState(false);
  const [providerOptions, setProviderOptions] = useState<{ label: string; value: string }[]>([]);

  const readOnly = mode === 'view';
  const listPath = '/ai_management/models';

  const loadProviders = useCallback(async () => {
    const response = await getAdminProviders({ page: 1, size: 100, isActive: true });
    const { items } = parseApiListResponse<API.AdminProvider>(response);
    setProviderOptions(
      items.map((item) => ({
        label: `${item.name} (${item.slug})`,
        value: item.id || '',
      })),
    );
  }, []);

  const loadDetail = useCallback(async () => {
    if (mode === 'create' || !id) return;

    setLoading(true);
    try {
      await loadProviders();
      const response = await getAdminModelsId({ id });
      if (!isApiSuccess(response)) {
        message.error('获取模型详情失败');
        navigate(listPath, { replace: true });
        return;
      }
      const data = getApiData<API.AdminAiModel>(response);
      if (!data) {
        message.error('获取模型详情失败');
        navigate(listPath, { replace: true });
        return;
      }
      form.setFieldsValue({
        ...data,
        defaultParams: stringifyDefaultParams(data.defaultParams),
        maxConcurrent: data.rateLimit?.maxConcurrent ?? undefined,
        requestsPerMinute: data.rateLimit?.requestsPerMinute ?? undefined,
      });
    } catch {
      message.error('获取模型详情失败');
      navigate(listPath, { replace: true });
    } finally {
      setLoading(false);
    }
  }, [form, id, listPath, loadProviders, mode, navigate]);

  useAIFormSurface({
    resourceType: 'model',
    resourceId: mode !== 'create' ? id : undefined,
    form,
    reloadDetail: loadDetail,
  });

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    if (mode === 'create') {
      form.resetFields();
      form.setFieldsValue({ isActive: true, inputTags: ['text'], outputTags: ['text'] });
      setLoading(false);
      return;
    }

    if (!id) {
      navigate(listPath, { replace: true });
      return;
    }

    void loadDetail();
  }, [form, id, listPath, loadDetail, mode, navigate]);

  const buildPayload = (values: Record<string, unknown>) => {
    const maxConcurrent = values.maxConcurrent as number | undefined;
    const requestsPerMinute = values.requestsPerMinute as number | undefined;
    const rateLimit =
      maxConcurrent || requestsPerMinute
        ? {
            maxConcurrent: maxConcurrent ?? null,
            requestsPerMinute: requestsPerMinute ?? null,
          }
        : undefined;
    const base = {
      providerId: values.providerId as string,
      modelId: values.modelId as string,
      displayName: values.displayName as string,
      defaultParams: parseDefaultParams(values.defaultParams as string | undefined),
      rateLimit,
      capabilities: values.capabilities as string[],
      inputTags: values.inputTags as string[] | undefined,
      outputTags: values.outputTags as string[] | undefined,
      isActive: values.isActive as boolean | undefined,
    };
    const slug = (values.slug as string | undefined)?.trim();
    return { ...base, slug: slug || undefined };
  };

  const buildCreatePayload = (values: Record<string, unknown>) => {
    const payload = buildPayload(values);
    return {
      ...payload,
      slug: payload.slug || (values.modelId as string),
    };
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      if (mode === 'create') {
        const response = await postAdminModels(buildCreatePayload(values));
        if (!isApiSuccess(response)) {
          message.error(response.message || '创建失败');
          return;
        }
        message.success('创建成功');
      } else if (id) {
        const response = await patchAdminModelsId({ id }, buildPayload(values));
        if (!isApiSuccess(response)) {
          message.error(response.message || '更新失败');
          return;
        }
        message.success('更新成功');
      }
      navigate(listPath);
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'defaultParams 必须是合法 JSON') {
        message.error(error.message);
        return;
      }
      if (!(error as { errorFields?: unknown })?.errorFields) {
        message.error('保存失败');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer
      title={<PageContainerTitleWithBack title={PAGE_TITLE[mode]} />}
      extra={
        readOnly ? (
          <Button
            type="primary"
            icon={<EditOutlined />}
            onClick={() => navigate(`/ai_management/models/${id}/edit`)}
          >
            编辑
          </Button>
        ) : (
          <Space>
            <Button type="primary" loading={saving} onClick={handleSubmit}>
              保存
            </Button>
          </Space>
        )
      }
    >
      <Spin spinning={loading}>
        <ProForm form={form} submitter={false} layout="vertical" readonly={readOnly}>
          <ProFormSelect
            name="providerId"
            label="服务商"
            options={providerOptions}
            rules={[{ required: true, message: '请选择服务商' }]}
            showSearch
          />
          <ProFormText
            name="slug"
            label="Slug"
            extra="留空将根据显示名称自动生成"
            rules={[
              {
                validator: (_, value) => {
                  if (!value || !String(value).trim()) {
                    return Promise.resolve();
                  }
                  if (!SLUG_PATTERN.test(String(value).trim())) {
                    return Promise.reject(new Error('仅允许小写字母、数字和连字符'));
                  }
                  return Promise.resolve();
                },
              },
            ]}
          />
          <ProFormText
            name="modelId"
            label="模型 ID"
            rules={[{ required: true, message: '请输入模型 ID' }]}
          />
          <ProFormText
            name="displayName"
            label="显示名称"
            rules={[{ required: true, message: '请输入显示名称' }]}
          />
          <ProFormTextArea
            name="defaultParams"
            label="默认参数 (JSON)"
            fieldProps={{ rows: 4, placeholder: '{"temperature": 0.7, "max_tokens": 4096}' }}
          />
          <ProFormDigit
            name="maxConcurrent"
            label="最大并发数"
            min={1}
            fieldProps={{ precision: 0 }}
            extra="留空表示不限制。豆包/Seed 等突发保护严格的 Provider 建议设置（如 2）"
          />
          <ProFormDigit
            name="requestsPerMinute"
            label="每分钟最大请求数 (RPM)"
            min={1}
            fieldProps={{ precision: 0 }}
            extra="留空表示不限制。用于防止对话续接循环密集连发打穿 Provider 突发保护（如 30）"
          />
          <ProFormSelect
            name="capabilities"
            label="能力标签"
            mode="multiple"
            options={AI_CAPABILITIES}
            rules={[{ required: true, message: '请选择能力标签' }]}
          />
          <ProFormSelect name="inputTags" label="输入模态" mode="multiple" options={AI_MODALITIES} />
          <ProFormSelect name="outputTags" label="输出模态" mode="multiple" options={AI_MODALITIES} />
          {mode !== 'create' && <ProFormSwitch name="isActive" label="启用" />}
        </ProForm>
      </Spin>
    </PageContainer>
  );
};

export default ModelFormPage;
