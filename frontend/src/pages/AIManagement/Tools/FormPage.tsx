import { EditOutlined } from '@ant-design/icons';
import { invalidateSkillCache } from '@eadaf/ai-base';
import { PageContainer, ProForm, ProFormSelect, ProFormSwitch, ProFormText, ProFormTextArea } from '@ant-design/pro-components';
import { Button, Form, Space, Spin } from 'antd';
import { message } from '@/utils/antdAppApis';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAIFormSurface } from '@/ai/useAIFormSurface';
import MilkdownCrepeEditor from '@/components/MilkdownCrepeEditor';
import PageContainerTitleWithBack from '@/components/PageContainerTitleWithBack';
import { getAdminScopes } from '@/services/EADAF/api/adminScopes';
import {
  getAdminToolsId,
  patchAdminToolsId,
  postAdminTools,
} from '@/services/EADAF/api/adminTools';
import { getApiData, isApiSuccess } from '@/utils/apiResponse';
import { EXECUTION_TYPE_OPTIONS } from '../constants';

export type ToolPageMode = 'create' | 'view' | 'edit';

const PAGE_TITLE: Record<ToolPageMode, string> = {
  create: '新建 Tool',
  view: 'Tool 详情',
  edit: '编辑 Tool',
};

interface ToolFormPageProps {
  mode: ToolPageMode;
}

const ToolFormPage: React.FC<ToolFormPageProps> = ({ mode }) => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(mode !== 'create');
  const [saving, setSaving] = useState(false);
  const [scopeOptions, setScopeOptions] = useState<{ label: string; value: string }[]>([]);
  const [editorKey, setEditorKey] = useState(0);

  const readOnly = mode === 'view';
  const listPath = '/ai_management/tools';

  useEffect(() => {
    getAdminScopes({ page: 1, size: 100, isActive: true }).then((response) => {
      if (isApiSuccess(response)) {
        const data = getApiData<{ items: Record<string, any>[] }>(response);
        setScopeOptions(
          (data?.items || []).map((item) => ({
            label: `${item.name} (${item.slug})`,
            value: item.id,
          })),
        );
      }
    });
  }, []);

  const loadDetail = useCallback(async () => {
    if (mode === 'create' || !id) return;

    setLoading(true);
    try {
      const response = await getAdminToolsId({ id });
      if (!isApiSuccess(response)) {
        message.error('获取 Tool 详情失败');
        navigate(listPath, { replace: true });
        return;
      }
      const data = getApiData<Record<string, any>>(response);
      if (!data) {
        message.error('获取 Tool 详情失败');
        navigate(listPath, { replace: true });
        return;
      }
      form.setFieldsValue({
        ...data,
        scopeId: data.scopeId,
        parametersSchemaText: JSON.stringify(data.parametersSchema || {}, null, 2),
        serverConfigText: data.serverConfig ? JSON.stringify(data.serverConfig, null, 2) : '',
      });
      setEditorKey(Date.now());
    } catch {
      message.error('获取 Tool 详情失败');
      navigate(listPath, { replace: true });
    } finally {
      setLoading(false);
    }
  }, [form, id, listPath, mode, navigate]);

  useAIFormSurface({
    resourceType: 'tool',
    resourceId: mode !== 'create' ? id : undefined,
    form,
    reloadDetail: loadDetail,
  });

  useEffect(() => {
    if (mode === 'create') {
      form.resetFields();
      form.setFieldsValue({
        executionType: 'client',
        parametersSchemaText: '{\n  "type": "object",\n  "properties": {}\n}',
        isActive: true,
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

  const parseJsonField = (text: string | undefined, fieldName: string) => {
    if (!text?.trim()) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`${fieldName} 不是合法 JSON`);
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const parametersSchema = parseJsonField(values.parametersSchemaText, 'Parameters Schema');
      const serverConfig = parseJsonField(values.serverConfigText, 'Server Config');
      setSaving(true);

      const payload = {
        scopeId: values.scopeId,
        name: values.name,
        functionName: values.functionName,
        description: values.description,
        executionType: values.executionType,
        parametersSchema,
        reviewMarkdown: values.reviewMarkdown,
        serverConfig,
        isActive: values.isActive,
      };

      if (mode === 'create') {
        const response = await postAdminTools(payload);
        if (!isApiSuccess(response)) {
          message.error('创建 Tool 失败');
          return;
        }
        message.success('创建成功');
      } else if (id) {
        const response = await patchAdminToolsId({ id }, payload);
        if (!isApiSuccess(response)) {
          message.error('更新 Tool 失败');
          return;
        }
        message.success('更新成功');
      }
      invalidateSkillCache();
      navigate(listPath);
    } catch (error) {
      if (error instanceof Error) {
        message.error(error.message);
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
            onClick={() => navigate(`/ai_management/tools/${id}/edit`)}
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
          <ProFormSelect name="scopeId" label="Scope" options={scopeOptions} rules={[{ required: true }]} />
          <ProFormText name="name" label="名称" rules={[{ required: true }]} />
          <ProFormText name="functionName" label="Function Name" rules={[{ required: true }]} />
          <ProFormSelect
            name="executionType"
            label="执行类型"
            options={EXECUTION_TYPE_OPTIONS}
            rules={[{ required: true }]}
          />
          <ProFormTextArea name="description" label="描述" />
          <ProFormTextArea
            name="parametersSchemaText"
            label="Parameters Schema (JSON)"
            fieldProps={{ rows: 6, style: { fontFamily: 'monospace' } }}
          />
          <Form.Item name="reviewMarkdown" label="Review 内容">
            <MilkdownCrepeEditor
              editorKey={editorKey}
              readonly={readOnly}
              placeholder="Tool 调用后的 Review 说明..."
              minHeight={200}
            />
          </Form.Item>
          <ProFormTextArea
            name="serverConfigText"
            label="Server Config (JSON)"
            fieldProps={{ rows: 4, style: { fontFamily: 'monospace' } }}
          />
          {mode !== 'create' && <ProFormSwitch name="isActive" label="启用" />}
        </ProForm>
      </Spin>
    </PageContainer>
  );
};

export default ToolFormPage;
