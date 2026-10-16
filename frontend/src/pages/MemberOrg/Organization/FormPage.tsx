import {
  BetaSchemaForm,
  PageContainer,
  type ProFormInstance,
} from '@ant-design/pro-components';
import { DeleteOutlined } from '@ant-design/icons';
import { Button, Space, Spin } from 'antd';
import { message, modal } from '@/utils/antdAppApis';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useReturnToList } from '@/hooks/useReturnToList';
import PageContainerTitleWithBack from '@/components/PageContainerTitleWithBack';
import { getApiData, getApiErrorMessage, isApiSuccess } from '@/utils/apiResponse';
import { useRoleOptions } from '@/hooks/useRoleOptions';
import {
  getDepartmentsTree,
  getDepartmentsDepartmentId,
  postDepartments,
  putDepartmentsDepartmentId,
  putDepartmentsDepartmentIdRoles,
  deleteDepartmentsDepartmentId,
} from '@/services/EADAF/api/departments';
import { departmentEditFormColumns } from './Schemas';

export type OrganizationPageMode = 'create' | 'edit';

const PAGE_TITLE: Record<OrganizationPageMode, string> = {
  create: '新建部门',
  edit: '编辑部门',
};

const LIST_PATH = '/member_org/organization';

interface OrganizationFormPageProps {
  mode: OrganizationPageMode;
}

const OrganizationFormPage: React.FC<OrganizationFormPageProps> = ({ mode }) => {
  const navigate = useNavigate();
  const navigateToList = useReturnToList();
  const { id } = useParams<{ id: string }>();
  const formRef = useRef<ProFormInstance>(null);
  const { roleOptions } = useRoleOptions();
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [departmentTree, setDepartmentTree] = useState<any[]>([]);

  const loadDepartmentTree = useCallback(async () => {
    try {
      const response = await getDepartmentsTree();
      if (!isApiSuccess(response)) {
        message.error(getApiErrorMessage(response, '获取部门树失败'));
        return;
      }
      const data = getApiData<{ items?: any[] }>(response);
      if (data?.items) {
        setDepartmentTree(data.items);
      }
    } catch (error) {
      message.error(getApiErrorMessage(error, '获取部门树失败'));
    }
  }, []);

  const injectFormOptions = useCallback(
    (columns: typeof departmentEditFormColumns) =>
      columns.map((column) => {
        if (column.dataIndex === 'parent_id') {
          return {
            ...column,
            fieldProps: {
              ...column.fieldProps,
              treeData: departmentTree,
            },
          };
        }
        if (column.dataIndex === 'role_ids') {
          return {
            ...column,
            fieldProps: {
              ...column.fieldProps,
              options: roleOptions,
            },
          };
        }
        return column;
      }),
    [departmentTree, roleOptions],
  );

  const formColumns = useMemo(() => {
    if (mode === 'create') {
      return injectFormOptions(departmentEditFormColumns);
    }
    return injectFormOptions([
      {
        title: '部门ID',
        dataIndex: 'department_id',
        valueType: 'text' as const,
        readonly: true,
        colProps: { span: 12 },
      },
      ...departmentEditFormColumns,
    ]);
  }, [injectFormOptions, mode]);

  const loadDetail = useCallback(async () => {
    if (mode !== 'edit' || !id) return;

    setLoading(true);
    try {
      const response = await getDepartmentsDepartmentId({ department_id: id });
      if (response.code !== 200 || !response.data) {
        message.error('获取部门详情失败');
        navigateToList(LIST_PATH, { replace: true });
        return;
      }
      const detail = response.data as API.Department;
      const processedData = {
        ...detail,
        role_ids:
          detail.role_ids ||
          detail.roles?.map((r) => r.role_id).filter(Boolean) ||
          [],
      };
      formRef.current?.setFieldsValue(processedData);
    } catch {
      message.error('获取部门详情失败');
      navigateToList(LIST_PATH, { replace: true });
    } finally {
      setLoading(false);
    }
  }, [id, mode, navigate]);

  useEffect(() => {
    void loadDepartmentTree();
  }, [loadDepartmentTree]);

  useEffect(() => {
    if (mode === 'edit') {
      void loadDetail();
      return;
    }
    formRef.current?.resetFields();
  }, [loadDetail, mode]);

  const handleFinish = async (value: Record<string, unknown>) => {
    try {
      setSaving(true);
      if (mode === 'create') {
        const response = await postDepartments({
          name: String(value.name || ''),
          parent_id: (value.parent_id as string) || undefined,
        });

        if (!response.code || response.code < 200 || response.code >= 300) {
          message.error(response.message || '创建失败');
          return false;
        }

        const roleIds = Array.isArray(value.role_ids) ? value.role_ids : [];
        const departmentId = response.data?.department_id;
        if (departmentId && roleIds.length) {
          await putDepartmentsDepartmentIdRoles(
            { department_id: departmentId },
            { role_ids: roleIds },
          );
        }

        message.success('创建成功');
        navigateToList(LIST_PATH, { extraSearch: `highlight=${departmentId || ''}` });
        return true;
      }

      if (!id) return false;

      const response = await putDepartmentsDepartmentId(
        { department_id: id },
        {
          name: String(value.name || ''),
          parent_id: (value.parent_id as string) || undefined,
        },
      );

      if (!response.code || response.code < 200 || response.code >= 300) {
        message.error(response.message || '更新失败');
        return false;
      }

      const roleIds = Array.isArray(value.role_ids) ? value.role_ids : [];
      await putDepartmentsDepartmentIdRoles({ department_id: id }, { role_ids: roleIds });

      message.success('更新成功');
      navigateToList(LIST_PATH);
      return true;
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : '保存失败';
      message.error(errMsg);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!id) return;
    modal.confirm({
      title: '确认删除',
      content: '确定要删除该部门吗？',
      onOk: async () => {
        try {
          setDeleteLoading(true);
          const response = await deleteDepartmentsDepartmentId({ department_id: id });
          if (response.code && response.code >= 200 && response.code < 300) {
            message.success('删除成功');
            navigateToList(LIST_PATH);
          } else {
            message.error(response.message || '删除失败');
          }
        } catch (error: unknown) {
          const errMsg =
            (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
            '删除失败';
          message.error(errMsg);
        } finally {
          setDeleteLoading(false);
        }
      },
    });
  };

  return (
    <>
      <PageContainer
        title={<PageContainerTitleWithBack title={PAGE_TITLE[mode]} backTo={LIST_PATH} />}
        extra={
          <Space>
            {mode === 'edit' && (
              <Button
                danger
                ghost
                icon={<DeleteOutlined />}
                loading={deleteLoading}
                onClick={handleDelete}
              >
                删除
              </Button>
            )}
            <Button type="primary" loading={saving} onClick={() => formRef.current?.submit()}>
              保存
            </Button>
          </Space>
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
    </>
  );
};

export default OrganizationFormPage;
