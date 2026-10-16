import { EditOutlined } from '@ant-design/icons';
import {
  PageContainer,
  ProForm,
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
  getAdminScopesId,
  patchAdminScopesId,
  postAdminScopes,
} from '@/services/EADAF/api/adminScopes';
import { getApiData, isApiSuccess } from '@/utils/apiResponse';
import { SLUG_PATTERN } from '../constants';

export type ScopePageMode = 'create' | 'view' | 'edit';

const PAGE_TITLE: Record<ScopePageMode, string> = {
  create: '新建 Scope',
  view: 'Scope 详情',
  edit: '编辑 Scope',
};

interface ScopeFormPageProps {
  mode: ScopePageMode;
}

const ScopeFormPage: React.FC<ScopeFormPageProps> = ({ mode }) => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(mode !== 'create');
  const [saving, setSaving] = useState(false);

  const readOnly = mode === 'view';
  const listPath = '/ai_management/scopes';

  const loadDetail = useCallback(async () => {
    if (mode === 'create' || !id) return;

    setLoading(true);
    try {
      const response = await getAdminScopesId({ id });
      if (!isApiSuccess(response)) {
        message.error('获取 Scope 详情失败');
        navigate(listPath, { replace: true });
        return;
      }
      const data = getApiData<Record<string, unknown>>(response);
      if (!data) {
        message.error('获取 Scope 详情失败');
        navigate(listPath, { replace: true });
        return;
      }
      form.setFieldsValue(data);
    } catch {
      message.error('获取 Scope 详情失败');
      navigate(listPath, { replace: true });
    } finally {
      setLoading(false);
    }
  }, [form, id, listPath, mode, navigate]);

  useAIFormSurface({
    resourceType: 'scope',
    resourceId: mode !== 'create' ? id : undefined,
    form,
    reloadDetail: loadDetail,
  });

  useEffect(() => {
    if (mode === 'create') {
      form.resetFields();
      form.setFieldsValue({ isActive: true });
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

      if (mode === 'create') {
        const response = await postAdminScopes({
          name: values.name,
          slug: values.slug?.trim(),
          description: values.description,
        });
        if (!isApiSuccess(response)) {
          message.error('创建 Scope 失败');
          return;
        }
        message.success('创建成功');
      } else if (id) {
        const response = await patchAdminScopesId({ id }, values);
        if (!isApiSuccess(response)) {
          message.error('更新 Scope 失败');
          return;
        }
        message.success('更新成功');
      }
      navigate(listPath);
    } catch {
      // validation
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
            onClick={() => navigate(`/ai_management/scopes/${id}/edit`)}
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
        <ProForm form={form} submitter={false} readonly={readOnly} layout="vertical">
          <ProFormText name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]} />
          <ProFormText
            name="slug"
            label="Scope ID"
            tooltip="唯一标识，创建后请谨慎修改"
            rules={[
              { required: true, message: '请输入 Scope ID' },
              { pattern: SLUG_PATTERN, message: '仅支持小写字母、数字与连字符' },
            ]}
          />
          <ProFormTextArea name="description" label="描述" />
          {mode !== 'create' && <ProFormSwitch name="isActive" label="启用" />}
        </ProForm>
      </Spin>
    </PageContainer>
  );
};

export default ScopeFormPage;
