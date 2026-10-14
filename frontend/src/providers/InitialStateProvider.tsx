import { useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import defaultSettings from '../../config/defaultSettings';
import { getDepartments } from '@/services/UAC/api/departments';
import { getAuthCheck } from '@/services/UAC/api/auth';
import { getSystemFeatures } from '@/services/UAC/api/system';
import { getPermissions } from '@/services/UAC/api/permissions';
import { clearAuth, clearAllSsoAuth, consumeEmbedAuthFromUrl, getAuth, parseAuthUser, type CurrentUser } from '@/utils/auth';
import { getApiData, isApiSuccess } from '@/utils/apiResponse';
import {
  applyDocumentBranding,
  fetchSystemBranding,
  resolveBrandingDisplay,
} from '@/utils/appBranding';
import {
  InitialStateContext,
  type Department,
  type DepartmentTreeOption,
  type InitialState,
  type MenuPermissionItem,
} from './initialStateContext';

export type {
  DepartmentTreeOption,
  InitialState,
  MenuPermissionItem,
} from './initialStateContext';

async function fetchUserInfo() {
  try {
    const { token } = getAuth();
    if (!token) return undefined;

    // 全局会话一律按平台密钥校验；URL 上的 app 留给 Auth 页显式传给 getAuthCheck / login
    const response = await getAuthCheck({}, { skipErrorHandler: true });
    const user = parseAuthUser(response);
    if (user) return user;
    throw new Error('获取用户信息失败');
  } catch (error: unknown) {
    const err = error as { response?: { status?: number } };
    if (err?.response?.status === 401) {
      // 全局会话用的是平台 token，验不过就是真的失效（或旧版本把应用 token 写进了
      // 这个位置），必须清掉，否则会一直 401 停在"回到登录页"的状态。
      // 应用 token 现在存在 sso_token:<app_id> 独立键里，这里顺手清一遍脏数据即可。
      clearAuth();
      clearAllSsoAuth();
    }
    return undefined;
  }
}

async function fetchDepartments() {
  try {
    const token = localStorage.getItem('token');
    if (!token) return undefined;

    const response = await getDepartments({ size: -1 });
    if (!isApiSuccess(response)) return undefined;

    const payload = getApiData<{ items?: Record<string, unknown>[] }>(response);
    if (payload?.items) {
      const departments = payload.items.map((item: Record<string, unknown>) => ({
        department_id: String(item.department_id || ''),
        name: String(item.name || ''),
        code: String(item.code || ''),
        parent_id: item.parent_id ? String(item.parent_id) : null,
        status: (item.status as Department['status']) || 'ACTIVE',
        description: String(item.description || ''),
        created_at: String(item.created_at || ''),
        updated_at: String(item.updated_at || ''),
        deleted_at: (item.deleted_at as string | null) ?? null,
      }));

      const buildTree = (parentId: string | null): DepartmentTreeOption[] =>
        departments
          .filter((dept) => (dept.parent_id || null) === parentId)
          .map((dept) => ({
            value: dept.department_id,
            label: dept.name,
            disabled: dept.status !== 'ACTIVE',
            children: buildTree(dept.department_id),
          }));

      return { departments, departmentsTreeData: buildTree(null) };
    }
    return undefined;
  } catch (error) {
    console.error('获取部门列表失败:', error);
    return undefined;
  }
}

async function fetchMenuPermissions(): Promise<MenuPermissionItem[] | undefined> {
  try {
    const token = localStorage.getItem('token');
    if (!token) return undefined;
    const res = await getPermissions({ page: 1, size: -1, resource_type: 'MENU', status: 'ACTIVE' });
    if (!isApiSuccess(res)) return undefined;
    const items = (res.data?.items || []) as unknown as MenuPermissionItem[];
    return items.filter((i) => i && i.code);
  } catch {
    return undefined;
  }
}

async function loadInitialState(): Promise<InitialState> {
  consumeEmbedAuthFromUrl();
  const [currentUser, appBranding, featuresRes] = await Promise.all([
    fetchUserInfo(),
    fetchSystemBranding(),
    getSystemFeatures().catch(() => null),
  ]);
  let departmentsResult;
  let menuPermissions: MenuPermissionItem[] | undefined;
  if (currentUser) {
    departmentsResult = await fetchDepartments();
    menuPermissions = await fetchMenuPermissions();
  }

  const brandingDisplay = resolveBrandingDisplay(appBranding);
  const systemFeatures = isApiSuccess(featuresRes)
    ? (getApiData<API.SystemFeatures>(featuresRes) ?? { metadataEnabled: false })
    : { metadataEnabled: false };

  return {
    fetchUserInfo,
    fetchDepartments,
    currentUser,
    departments: departmentsResult?.departments,
    departmentsTreeData: departmentsResult?.departmentsTreeData,
    departmentsLastUpdate: departmentsResult?.departments ? Date.now() : undefined,
    menuPermissions,
    name: currentUser?.username || '未有效登录',
    appBranding,
    systemFeatures,
    settings: {
      ...defaultSettings,
      title: brandingDisplay.name,
      logo: brandingDisplay.logo,
    },
  };
}

export function InitialStateProvider({ children }: { children: ReactNode }) {
  const [initialState, setInitialStateInner] = useState<InitialState | undefined>();
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (): Promise<InitialState> => {
    setLoading(true);
    try {
      const next = await loadInitialState();
      setInitialStateInner(next);
      return next;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (initialState?.settings) {
      applyDocumentBranding(resolveBrandingDisplay(initialState.appBranding));
    }
  }, [initialState?.appBranding, initialState?.settings?.logo, initialState?.settings?.title]);

  const setInitialState = useCallback(
    (updater: InitialState | ((prev?: InitialState) => InitialState | undefined)) => {
      setInitialStateInner((prev) =>
        typeof updater === 'function' ? updater(prev) : updater,
      );
    },
    [],
  );

  const value = useMemo(
    () => ({ initialState, setInitialState, loading, refresh }),
    [initialState, setInitialState, loading, refresh],
  );

  return <InitialStateContext.Provider value={value}>{children}</InitialStateContext.Provider>;
}

export function useInitialState() {
  const ctx = useContext(InitialStateContext);
  if (!ctx) {
    throw new Error('useInitialState must be used within InitialStateProvider');
  }
  return ctx;
}
