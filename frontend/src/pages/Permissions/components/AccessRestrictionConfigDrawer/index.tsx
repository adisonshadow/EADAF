import React, { useEffect, useState } from 'react';
import { Drawer, Form, Radio, Space, Button, Tag, Tooltip, Typography } from 'antd';
import { message } from '@/utils/antdAppApis';
import { ProFormSelect } from '@ant-design/pro-components';
import { getRoles } from '@/services/EADAF/api/roles';
import { putPermissionsPermissionId } from '@/services/EADAF/api/permissions';
import DepartmentLookup from '@/pages/ApiServices/components/DepartmentLookup';
import { isApiSuccess } from '@/utils/apiResponse';
import type { Permission, AccessRestriction } from '../../types';

const { Text } = Typography;

/** 超级管理员角色 code —— 默认拥有全部权限，配置限制时从角色列表中排除 */
const SUPER_ADMIN_ROLE_CODE = 'SUPER_ADMIN';

interface AccessRestrictionConfigDrawerProps {
  open: boolean;
  permission: Permission | null;
  onClose: () => void;
  onSuccess?: () => void;
}

function renderRestrictionTag(r?: AccessRestriction | null) {
  if (!r || r.mode === 'none') return <Tag color="green">无限制</Tag>;
  if (r.mode === 'role') return <Tag color="purple">限制角色</Tag>;
  if (r.mode === 'department') return <Tag color="geekblue">限制组织</Tag>;
  return <Tag color="default">无限制</Tag>;
}

/**
 * 菜单/按钮权限的访问限制配置抽屉。
 * 复用与内置 API 一致的访问策略：无限制 / 限制用户角色 / 限制用户组织。
 */
const AccessRestrictionConfigDrawer: React.FC<AccessRestrictionConfigDrawerProps> = ({
  open,
  permission,
  onClose,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const mode = Form.useWatch('mode', form);
  const [saving, setSaving] = useState(false);
  const [roleOptions, setRoleOptions] = useState<{ label: string; value: string }[]>([]);
  const [roleOptionsLoading, setRoleOptionsLoading] = useState(false);

  /** 加载角色选项，排除超级管理员（默认拥有全部权限） */
  const loadRoles = async () => {
    setRoleOptionsLoading(true);
    try {
      const res = await getRoles({ page: 1, size: -1, status: 'ACTIVE' });
      const items = (res.data?.items || []).filter((r) => r.code !== SUPER_ADMIN_ROLE_CODE);
      setRoleOptions(
        items.map((role) => ({
          label: `${role.role_name} (${role.code})`,
          value: role.role_id!,
        })),
      );
    } catch {
      setRoleOptions([]);
    } finally {
      setRoleOptionsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void loadRoles();
      const r = permission?.access_restriction;
      form.setFieldsValue({
        mode: r?.mode || 'none',
        roleIds: r?.mode === 'role' ? r.roleIds || [] : [],
        departmentIds: r?.mode === 'department' ? r.departmentIds || [] : [],
      });
    }
  }, [open, permission]);

  const handleSave = async () => {
    if (!permission) return;
    try {
      const values = await form.validateFields();
      const payload: AccessRestriction = { mode: values.mode };
      if (values.mode === 'role') payload.roleIds = values.roleIds || [];
      if (values.mode === 'department') payload.departmentIds = values.departmentIds || [];

      setSaving(true);
      const res = await putPermissionsPermissionId(
        { permission_id: permission.permission_id },
        { access_restriction: payload },
      );
      if (isApiSuccess(res)) {
        message.success('保存成功');
        onSuccess?.();
        onClose();
      } else {
        message.error(res.message || '保存失败');
      }
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      title="配置访问限制"
      width={480}
      open={open}
      onClose={onClose}
      destroyOnHidden
    >
      {permission ? (
        <>
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary">{permission.resource_type === 'MENU' ? '菜单' : '按钮'}权限</Text>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{permission.description || permission.code}</div>
            <Text code>{permission.code}</Text>
            <div style={{ marginTop: 6 }}>
              当前：{renderRestrictionTag(permission.access_restriction)}
            </div>
          </div>
          <Form form={form} layout="vertical" initialValues={{ mode: 'none' }}>
            <Form.Item
              name="mode"
              label="访问策略"
              rules={[{ required: true, message: '请选择访问策略' }]}
            >
              <Radio.Group>
                <Radio value="none">无限制</Radio>
                <Radio value="role">限制用户角色</Radio>
                <Radio value="department">限制用户组织</Radio>
              </Radio.Group>
            </Form.Item>
            {mode === 'role' ? (
              <Form.Item
                name="roleIds"
                label="允许的角色"
                rules={[{ required: true, message: '请选择至少一个角色' }]}
                extra="超级管理员默认拥有全部权限，无需在此选择"
              >
                <ProFormSelect
                  mode="multiple"
                  options={roleOptions}
                  fieldProps={{ loading: roleOptionsLoading, placeholder: '选择可访问该菜单/按钮的角色' }}
                />
              </Form.Item>
            ) : null}
            {mode === 'department' ? (
              <Form.Item
                name="departmentIds"
                label="允许的组织"
                rules={[{ required: true, message: '请选择至少一个组织' }]}
              >
                <DepartmentLookup />
              </Form.Item>
            ) : null}
          </Form>
          <div style={{ marginTop: 8 }}>
            <Tooltip title="该限制控制菜单/按钮对登录用户的可见性；超级管理员始终可见">
              <Text type="secondary" style={{ fontSize: 12 }}>
                说明：控制该{permission.resource_type === 'MENU' ? '菜单' : '按钮'}对登录用户的可见性；超级管理员始终可见全部菜单/按钮。
              </Text>
            </Tooltip>
          </div>
          <div style={{ marginTop: 24, textAlign: 'right' }}>
            <Space>
              <Button onClick={onClose}>取消</Button>
              <Button type="primary" loading={saving} onClick={handleSave}>保存</Button>
            </Space>
          </div>
        </>
      ) : null}
    </Drawer>
  );
};

export default AccessRestrictionConfigDrawer;
