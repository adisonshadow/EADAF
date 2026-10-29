import { FormInstance } from 'antd';

export type ResourceType = 'MENU' | 'BUTTON' | 'API';

export type ActionType = 'read' | 'create' | 'update' | 'delete';

/** 访问限制（菜单/按钮运行时可见性） */
export interface AccessRestriction {
  mode: 'none' | 'role' | 'department';
  roleIds?: string[];
  departmentIds?: string[];
}

export interface Permission {
  permission_id: string;
  code: string;
  name?: string;
  description?: string;
  resource_type: ResourceType;
  actions: ActionType[];
  parent_id?: string;
  status?: 'ACTIVE' | 'DISABLED';
  access_restriction?: AccessRestriction | null;
  three_member_duty?: 'business' | 'system_admin' | 'security_admin' | 'auditor' | null;
  created_at?: string;
  updated_at?: string;
  children?: Permission[];
  _searchText?: string;
}

export interface PermissionTableProps {
  resourceType: ResourceType;
  allowedActions: ActionType[];
  title: string;
}

export interface PermissionFormProps {
  resourceType: ResourceType;
  allowedActions: ActionType[];
  initialValues?: Partial<Permission>;
  onFinish: (values: any) => Promise<void> | Promise<boolean>;
  loading?: boolean;
  readonly?: boolean;
  form?: FormInstance;
} 