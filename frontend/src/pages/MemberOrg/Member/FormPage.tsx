import {
  BetaSchemaForm,
  PageContainer,
  type ProFormInstance,
} from '@ant-design/pro-components';
import { CopyOutlined, DeleteOutlined } from '@ant-design/icons';
import { Button, Input, Modal, Space, Spin } from 'antd';
import { message, modal } from '@/utils/antdAppApis';
import { copyTextToClipboard } from '@/utils/clipboard';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useReturnToList } from '@/hooks/useReturnToList';
import PageContainerTitleWithBack from '@/components/PageContainerTitleWithBack';
import { useInitialState } from '@/providers/InitialStateProvider';
import { getDepartmentPathFromTree } from '@/utils/department';
import {
  getUsersUserId,
  postUsers,
  putUsersUserId,
  putUsersUserIdRoles,
  deleteUsersUserId,
} from '@/services/EADAF/api/users';
import { useRoleOptions } from '@/hooks/useRoleOptions';
import api from '@/services/EADAF/api';
import { history } from '@/utils/navigation';
import {
  userCreateFormColumns,
  userEditFormColumns,
  useDepartmentOptions,
} from './Schemas';

export type MemberPageMode = 'create' | 'edit';

const PAGE_TITLE: Record<MemberPageMode, string> = {
  create: '新建成员',
  edit: '编辑成员',
};

const LIST_PATH = '/member_org/member';

const generateRandomPassword = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

interface MemberFormPageProps {
  mode: MemberPageMode;
}

const MemberFormPage: React.FC<MemberFormPageProps> = ({ mode }) => {
  const navigate = useNavigate();
  const navigateToList = useReturnToList();
  const { id } = useParams<{ id: string }>();
  const formRef = useRef<ProFormInstance>(null);
  const { initialState } = useInitialState();
  const departmentOptions = useDepartmentOptions();
  const { roleOptions } = useRoleOptions();
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [detailData, setDetailData] = useState<Record<string, unknown> | null>(null);

  const applyDetailToForm = useCallback(
    (data: Record<string, unknown>) => {
      const departmentId = String(data.department_id || '');
      const departmentPath = departmentId
        ? getDepartmentPathFromTree(departmentId, departmentOptions)
        : [];
      formRef.current?.setFieldsValue({
        ...data,
        department_id: departmentPath.length ? departmentPath : data.department_id,
      });
    },
    [departmentOptions],
  );

  const injectFormOptions = useCallback(
    (columns: typeof userEditFormColumns) =>
      columns.map((column) => {
        if (column.dataIndex === 'department_id') {
          return {
            ...column,
            fieldProps: {
              ...column.fieldProps,
              options: departmentOptions,
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
    [departmentOptions, roleOptions],
  );

  const formColumns = useMemo(() => {
    if (mode === 'create') {
      return injectFormOptions(userCreateFormColumns as typeof userEditFormColumns);
    }
    return injectFormOptions([
      {
        title: '用户ID',
        dataIndex: 'user_id',
        valueType: 'text' as const,
        readonly: true,
        colProps: { span: 12 },
      },
      ...userEditFormColumns,
    ]);
  }, [injectFormOptions, mode]);

  const loadDetail = useCallback(async () => {
    if (mode !== 'edit' || !id) return;

    setLoading(true);
    try {
      const response = await getUsersUserId({ user_id: id });
      if (response.code !== 200 || !response.data) {
        message.error('获取成员详情失败');
        navigateToList(LIST_PATH, { replace: true });
        return;
      }
      const processedData: Record<string, unknown> = {
        ...response.data,
        role_ids:
          response.data.role_ids ??
          response.data.roles?.map((r) => r.role_id).filter((v): v is string => v != null) ??
          [],
      };
      setDetailData(processedData);
      applyDetailToForm(processedData);
    } catch {
      message.error('获取成员详情失败');
      navigateToList(LIST_PATH, { replace: true });
    } finally {
      setLoading(false);
    }
  }, [applyDetailToForm, id, mode, navigate]);

  useEffect(() => {
    if (mode === 'edit' && detailData && departmentOptions.length > 0) {
      applyDetailToForm(detailData);
    }
  }, [applyDetailToForm, departmentOptions, detailData, mode]);

  useEffect(() => {
    if (mode === 'edit') {
      void loadDetail();
      return;
    }
    formRef.current?.resetFields();
    setDetailData(null);
    formRef.current?.setFieldsValue({
      status: 'ACTIVE',
      auto_create_user_id: true,
    });
  }, [loadDetail, mode]);

  const handleFinish = async (value: Record<string, unknown>) => {
    try {
      setSaving(true);
      if (mode === 'create') {
        const password = generateRandomPassword();
        const processedValue = Object.entries(value).reduce(
          (acc, [key, val]) => {
            if (typeof val === 'string') {
              acc[key] = val.trim();
            } else if (key === 'department_id' && Array.isArray(val)) {
              acc[key] = val[val.length - 1];
            } else {
              acc[key] = val;
            }
            return acc;
          },
          {} as Record<string, unknown>,
        );

        const userData: Parameters<typeof postUsers>[0] = {
          username: String(processedValue.username || ''),
          password,
          name: String(processedValue.name || ''),
          avatar: processedValue.avatar as string | undefined,
          email: processedValue.email as string | undefined,
          phone: processedValue.phone as string | undefined,
          gender: processedValue.gender as 'MALE' | 'FEMALE' | 'OTHER' | undefined,
          department_id: processedValue.department_id as string | undefined,
          role_ids: processedValue.role_ids as string[] | undefined,
        };

        if (processedValue.auto_create_user_id === false && processedValue.user_id) {
          userData.user_id = String(processedValue.user_id).trim();
        }

        const response = await postUsers(userData);
        if (response.code !== 200) {
          message.error(response.message || '创建失败');
          return false;
        }

        setGeneratedPassword(password);
        setPasswordModalOpen(true);
        return true;
      }

      if (!id) return false;

      const updateData: Parameters<typeof putUsersUserId>[1] = {
        name: typeof value.name === 'string' ? value.name : undefined,
        email: typeof value.email === 'string' ? value.email : undefined,
        avatar: typeof value.avatar === 'string' ? value.avatar : undefined,
        gender:
          value.gender === 'MALE' || value.gender === 'FEMALE' || value.gender === 'OTHER'
            ? value.gender
            : undefined,
        phone: typeof value.phone === 'string' ? value.phone : undefined,
        status:
          value.status === 'ACTIVE' || value.status === 'DISABLED' || value.status === 'ARCHIVED'
            ? value.status
            : undefined,
        department_id: Array.isArray(value.department_id)
          ? String(value.department_id[value.department_id.length - 1])
          : typeof value.department_id === 'string'
            ? value.department_id
            : undefined,
      };

      const response = await putUsersUserId({ user_id: id }, updateData);
      if (response.code !== 200) {
        message.error(response.message || '更新失败');
        return false;
      }

      const roleIds = Array.isArray(value.role_ids) ? value.role_ids : [];
      await putUsersUserIdRoles({ user_id: id }, { role_ids: roleIds });

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

  const isSelfAccount =
    mode === 'edit' && id && id === initialState?.currentUser?.user_id;

  const closePasswordModal = async () => {
    setPasswordModalOpen(false);
    if (isSelfAccount) {
      message.warning('您已重置自己的登录密码，请使用弹窗中的新密码重新登录');
      try {
        const refresh_token = localStorage.getItem('refresh_token');
        if (refresh_token) {
          await api.auth.postAuthLogout({ refresh_token });
        }
      } catch {
        // 忽略登出接口错误
      }
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      history.push('/auth/login');
      return;
    }
    if (mode === 'create') {
      navigateToList(LIST_PATH);
    }
  };

  const handleResetPassword = async () => {
    if (!id) return;
    try {
      setResetPasswordLoading(true);
      const newPassword = generateRandomPassword();
      const response = await putUsersUserId(
        { user_id: id },
        { password: newPassword } as Parameters<typeof putUsersUserId>[1],
      );
      if (response.code !== 200) {
        message.error(response.message || '密码重置失败');
        return;
      }
      setGeneratedPassword(newPassword);
      setPasswordModalOpen(true);
      message.success('密码重置成功');
    } catch {
      message.error('密码重置失败');
    } finally {
      setResetPasswordLoading(false);
    }
  };

  const handleDelete = () => {
    if (!id) return;
    modal.confirm({
      title: '确认删除',
      content: '确定要删除该成员吗？',
      onOk: async () => {
        try {
          setDeleteLoading(true);
          await deleteUsersUserId({ user_id: id });
          message.success('删除成功');
          navigateToList(LIST_PATH);
        } catch {
          message.error('删除失败');
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
              <>
                <Button
                  danger
                  ghost
                  loading={resetPasswordLoading}
                  onClick={() => void handleResetPassword()}
                >
                  重置密码
                </Button>
                <Button
                  danger
                  ghost
                  icon={<DeleteOutlined />}
                  loading={deleteLoading}
                  onClick={handleDelete}
                >
                  删除
                </Button>
              </>
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
            initialValues={mode === 'edit' ? detailData ?? undefined : undefined}
            submitter={false}
            onFinish={handleFinish}
            grid
            rowProps={{ gutter: [16, 16] }}
            colProps={{ span: 12 }}
          />
        </Spin>
      </PageContainer>

      <Modal
        title={mode === 'create' ? '用户创建成功' : '密码重置成功'}
        open={passwordModalOpen}
        onCancel={() => void closePasswordModal()}
        footer={[
          <Button key="close" onClick={() => void closePasswordModal()}>
            关闭
          </Button>,
        ]}
      >
        <p>
          {mode === 'create'
            ? '用户创建成功！请记录以下初始密码：'
            : isSelfAccount
              ? '您重置的是当前登录账号！请记录以下新密码，关闭后将退出登录，需用新密码重新登录：'
              : '密码重置成功！请记录以下新密码：'}
        </p>
        <Space>
          <Input.Password value={generatedPassword} readOnly style={{ width: 200 }} />
          <Button
            icon={<CopyOutlined />}
            onClick={async () => {
              const ok = await copyTextToClipboard(generatedPassword);
              if (ok) message.success('密码已复制到剪贴板');
              else message.error('复制失败，请手动选择密码复制');
            }}
          >
            复制
          </Button>
        </Space>
        <p style={{ marginTop: 16, color: '#ff4d4f' }}>
          注意：请妥善保管此密码，建议用户首次登录后立即修改密码。
        </p>
      </Modal>
    </>
  );
};

export default MemberFormPage;
