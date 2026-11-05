import { EditOutlined } from '@ant-design/icons';
import {
  PageContainer,
  ProForm,
  ProFormSelect,
  ProFormSwitch,
  ProFormText,
} from '@ant-design/pro-components';
import { Button, Form, Space, Spin } from 'antd';
import {
  clearBrowserProviderApiKey,
  readBrowserProviderApiKey,
  writeBrowserProviderApiKey,
} from '@eadaf/ai-base';
import { message } from '@/utils/antdAppApis';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageContainerTitleWithBack from '@/components/PageContainerTitleWithBack';
import { useAIFormSurface } from '@/ai/useAIFormSurface';
import {
  getAdminProvidersId,
  patchAdminProvidersId,
  postAdminProviders,
} from '@/services/EADAF/api/adminProviders';
import { getApiData, isApiSuccess } from '@/utils/apiResponse';
import { ADAPTER_TYPE_OPTIONS, SLUG_PATTERN } from '../constants';
import { useInitialState } from '@/providers/InitialStateProvider';

export type ProviderPageMode = 'create' | 'view' | 'edit';

const PAGE_TITLE: Record<ProviderPageMode, string> = {
  create: '新建 AI 服务商',
  view: 'AI 服务商详情',
  edit: '编辑 AI 服务商',
};

interface ProviderFormPageProps {
  mode: ProviderPageMode;
}

const ProviderFormPage: React.FC<ProviderFormPageProps> = ({ mode }) => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(mode !== 'create');
  const [saving, setSaving] = useState(false);
  const [storedInBrowser, setStoredInBrowser] = useState(false);
  const { initialState } = useInitialState();
  const allowBrowserApiKey = Boolean(initialState?.systemFeatures?.allowBrowserApiKey);
  const apiKeyBrowserOnly = Form.useWatch('apiKeyBrowserOnly', form);
  const showBrowserOption = allowBrowserApiKey || storedInBrowser || Boolean(apiKeyBrowserOnly);

  const readOnly = mode === 'view';
  const listPath = '/ai_management/providers';

  const loadDetail = useCallback(async () => {
    if (mode === 'create' || !id) return;

    setLoading(true);
    try {
      const response = await getAdminProvidersId({ id });
      if (!isApiSuccess(response)) {
        message.error('获取服务商详情失败');
        navigate(listPath, { replace: true });
        return;
      }
      const data = getApiData<API.AdminProvider>(response);
      if (!data) {
        message.error('获取服务商详情失败');
        navigate(listPath, { replace: true });
        return;
      }
      const browserOnly = data.apiKeyStorage === 'browser';
      setStoredInBrowser(browserOnly);
      form.setFieldsValue({
        ...data,
        apiKey: browserOnly ? (readBrowserProviderApiKey(data.id) || undefined) : undefined,
        apiKeyBrowserOnly: browserOnly,
      });
    } catch {
      message.error('获取服务商详情失败');
      navigate(listPath, { replace: true });
    } finally {
      setLoading(false);
    }
  }, [form, id, listPath, mode, navigate]);

  useAIFormSurface({
    resourceType: 'provider',
    resourceId: mode !== 'create' ? id : undefined,
    form,
    reloadDetail: loadDetail,
  });

  useEffect(() => {
    if (mode === 'create') {
      form.resetFields();
      form.setFieldsValue({ adapterType: 'openai_compatible', isActive: true, apiKeyBrowserOnly: false });
      setStoredInBrowser(false);
      setLoading(false);
      return;
    }

    if (!id) {
      navigate(listPath, { replace: true });
      return;
    }

    void loadDetail();
  }, [form, id, listPath, loadDetail, mode, navigate]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const browserOnly = Boolean(values.apiKeyBrowserOnly);

      if (mode === 'create') {
        const response = await postAdminProviders({
          name: values.name,
          slug: values.slug?.trim() || undefined,
          baseUrl: values.baseUrl,
          apiKey: browserOnly ? undefined : values.apiKey,
          apiKeyStorage: browserOnly ? 'browser' : 'database',
          adapterType: values.adapterType,
        });
        if (!isApiSuccess(response)) {
          message.error(response.message || '创建失败');
          return;
        }
        const created = getApiData<API.AdminProvider>(response);
        if (browserOnly && created?.id && values.apiKey) {
          writeBrowserProviderApiKey(created.id, values.apiKey);
        }
        message.success(browserOnly ? '创建成功，API Key 只保存在本浏览器' : '创建成功');
      } else if (id) {
        const payload: Record<string, unknown> = {
          name: values.name,
          slug: values.slug,
          baseUrl: values.baseUrl,
          adapterType: values.adapterType,
          isActive: values.isActive,
          apiKeyStorage: browserOnly ? 'browser' : 'database',
        };
        if (!browserOnly && values.apiKey) {
          payload.apiKey = values.apiKey;
        }
        const response = await patchAdminProvidersId({ id }, payload);
        if (!isApiSuccess(response)) {
          message.error(response.message || '更新失败');
          return;
        }
        if (browserOnly) {
          if (values.apiKey) writeBrowserProviderApiKey(id, values.apiKey);
        } else {
          clearBrowserProviderApiKey(id);
        }
        message.success(browserOnly ? '已更新，API Key 只保存在本浏览器' : '更新成功');
      }
      navigate(listPath);
    } catch (error: unknown) {
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
            onClick={() => navigate(`/ai_management/providers/${id}/edit`)}
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
          <ProFormText name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]} />
          <ProFormText
            name="slug"
            label="Slug"
            extra="留空将根据名称自动生成"
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
            name="baseUrl"
            label="Base URL"
            rules={[{ required: true, message: '请输入 Base URL' }]}
          />
          {showBrowserOption ? (
            <ProFormSwitch
              name="apiKeyBrowserOnly"
              label="只存储API Key在浏览器"
              extra="开启后密钥只留在本浏览器，不写入数据库。换浏览器或清除站点数据后需要重新填写"
            />
          ) : null}
          <ProFormText.Password
            name="apiKey"
            label="API Key"
            rules={[
              {
                validator: (_, value) => {
                  const browserOnly = Boolean(form.getFieldValue('apiKeyBrowserOnly'));
                  if (mode === 'create' && !value) {
                    return Promise.reject(new Error('请输入 API Key'));
                  }
                  if (mode === 'edit' && browserOnly && !storedInBrowser && !value) {
                    return Promise.reject(new Error('改为只存在浏览器时需要重新输入 API Key'));
                  }
                  if (mode === 'edit' && !browserOnly && storedInBrowser && !value) {
                    return Promise.reject(new Error('改为保存到数据库时需要输入 API Key'));
                  }
                  return Promise.resolve();
                },
              },
            ]}
            fieldProps={{ visibilityToggle: !readOnly }}
            extra={
              apiKeyBrowserOnly
                ? (mode === 'edit'
                  ? '留空表示不修改本机保存的密钥；不会写入数据库'
                  : '不会提交到服务器，只写入本浏览器')
                : mode === 'edit'
                  ? '留空表示不修改'
                  : undefined
            }
          />
          <ProFormSelect
            name="adapterType"
            label="适配器类型"
            options={ADAPTER_TYPE_OPTIONS}
            rules={[{ required: true, message: '请选择适配器类型' }]}
          />
          {mode !== 'create' && <ProFormSwitch name="isActive" label="启用" />}
        </ProForm>
      </Spin>
    </PageContainer>
  );
};

export default ProviderFormPage;
