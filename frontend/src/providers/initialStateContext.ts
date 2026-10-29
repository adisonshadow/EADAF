/**
 * 单独存放 Context 对象，避免 Vite HMR 更新 Provider 实现时
 * 重新执行 createContext，导致「must be used within Provider」。
 */
import { createContext } from 'react';
import type defaultSettings from '../../config/defaultSettings';
import type { CurrentUser } from '@/utils/auth';
import type { AppBranding } from '@/utils/appBranding';

export interface DepartmentTreeOption {
  value: string;
  label: string;
  children?: DepartmentTreeOption[];
  disabled?: boolean;
}

export interface Department {
  department_id: string;
  name: string;
  code: string;
  parent_id: string | null;
  status: 'ACTIVE' | 'DISABLED' | 'ARCHIVED';
  description: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface MenuPermissionItem {
  permission_id: string;
  code: string;
  access_restriction?: {
    mode: 'none' | 'role' | 'department';
    roleIds?: string[];
    departmentIds?: string[];
  } | null;
  three_member_duty?: string | null;
}

export interface InitialState {
  fetchUserInfo: () => Promise<CurrentUser | undefined>;
  fetchDepartments: () => Promise<
    | {
        departments: Department[];
        departmentsTreeData: DepartmentTreeOption[];
      }
    | undefined
  >;
  currentUser?: CurrentUser;
  departments?: Department[];
  departmentsTreeData?: DepartmentTreeOption[];
  departmentsLastUpdate?: number;
  /** 菜单权限（含 access_restriction），用于运行时过滤菜单可见性 */
  menuPermissions?: MenuPermissionItem[];
  name: string;
  settings: typeof defaultSettings;
  appBranding?: AppBranding;
  systemFeatures?: API.SystemFeatures;
}

export interface InitialStateContextValue {
  initialState?: InitialState;
  setInitialState: (
    updater: InitialState | ((prev?: InitialState) => InitialState | undefined),
  ) => void;
  loading: boolean;
  refresh: () => Promise<InitialState>;
}

export const InitialStateContext = createContext<InitialStateContextValue | null>(null);
