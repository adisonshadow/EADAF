import {
  BetaSchemaForm,
  PageContainer,
  type ProFormInstance,
} from '@ant-design/pro-components';
import { Button, Spin } from 'antd';
import { message } from '@/utils/antdAppApis';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageContainerTitleWithBack from '@/components/PageContainerTitleWithBack';
import {
  getApplicationsId,
  postApplications,
  putApplicationsId,
} from '@/services/EADAF/api/applications';
import { getApiData, isApiSuccess } from '@/utils/apiResponse';
import {
  applicationEditFormColumns,
  applicationCreateFormColumns,
  SYSTEM_APPLICATION_CODE,
} from './Schemas';

export type ApplicationPageMode = 'create' | 'edit';

const PAGE_TITLE: Record<ApplicationPageMode, string> = {
  create: '新建应用',
  edit: '编辑应用',
};

interface ApplicationFormPageProps {
  mode: ApplicationPageMode;
}

const ApplicationFormPage: React.FC<ApplicationFormPageProps> = ({ mode }) => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const formRef = useRef<ProFormInstance>(null);
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [applicationCode, setApplicationCode] = useState<string>();

  const listPath = '/service_provider';

  const loadDetail = useCallback(async () => {
    if (mode !== 'edit' || !id) return;

    setLoading(true);
    try {
      const response = await getApplicationsId({ id });
      if (!isApiSuccess(response)) {
        message.error('获取应用详情失败');
        navigate(listPath, { replace: true });
        return;
      }
      const data = getApiData<API.Application>(response);
      if (!data) {
        message.error('获取应用详情失败');
        navigate(listPath, { replace: true });
        return;
      }
      setApplicationCode(data.code);
      formRef.current?.setFieldsValue(data);
    } catch {
      message.error('获取应用详情失败');
      navigate(listPath, { replace: true });
    } finally {
      setLoading(false);
    }
  }, [id, listPath, mode, navigate]);

  useEffect(() => {
    if (mode === 'edit') {
      void loadDetail();
      return;
    }
    formRef.current?.resetFields();
    formRef.current?.setFieldsValue({ status: 'ACTIVE', auto_create_application_id: true });
  }, [loadDetail, mode]);

  const formColumns = useMemo(
    () => {
      const columns = mode === 'create' ? applicationCreateFormColumns : applicationEditFormColumns;
      return columns.map((col) => {
        if (col.dataIndex === 'code' && mode === 'edit') {
          return {
            ...col,
            fieldProps: {
              ...(col.fieldProps || {}),
              disabled: applicationCode === SYSTEM_APPLICATION_CODE,
            },
          };
        }
        return col;
      });
    },
    [applicationCode, mode],
  );

  const buildSubmitPayload = (
    values: Record<string, unknown>,
  ): Parameters<typeof postApplications>[0] => {
    const payload = { ...values } as API.Application & {
      auto_create_application_id?: boolean;
    };
    delete payload.auto_create_application_id;
    if (values.auto_create_application_id !== false) {
      delete payload.application_id;
    } else if (typeof payload.application_id === 'string') {
      payload.application_id = payload.application_id.trim();
    }
    return {
      ...payload,
      name: String(values.name ?? ''),
      code: String(values.code ?? ''),
    };
  };

  const handleFinish = async (values: Record<string, unknown>) => {
    try {
      setSaving(true);
      if (mode === 'create') {
        const response = await postApplications(buildSubmitPayload(values));
        if (!isApiSuccess(response)) {
          message.error(
            (response as { message?: string }).message || '创建失败',
          );
          return false;
        }
        message.success('创建成功');
      } else if (id) {
        const response = await putApplicationsId({ id }, values as API.Application);
        if (!isApiSuccess(response)) {
          message.error(response.message || '更新失败');
          return false;
        }
        message.success('更新成功');
      }
      navigate(listPath);
      return true;
    } catch {
      message.error('保存失败');
      return false;
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer
      title={<PageContainerTitleWithBack title={PAGE_TITLE[mode]} />}
      extra={
        <Button type="primary" loading={saving} onClick={() => formRef.current?.submit()}>
          保存
        </Button>
      }
    >
      <Spin spinning={loading}>
        <BetaSchemaForm
          formRef={formRef}
          layoutType="Form"
          columns={formColumns}
          submitter={false}
          onFinish={handleFinish}
          grid
          rowProps={{ gutter: [16, 16] }}
          colProps={{ span: 12 }}
        />
      </Spin>
    </PageContainer>
  );
};

export default ApplicationFormPage;
