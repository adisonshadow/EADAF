import { useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import defaultSettings from '../../config/defaultSettings';
import { getDepartments } from '@/services/EADAF/api/departments';
import { getAuthCheck } from '@/services/EADAF/api/auth';
import { getSystemFeatures } from '@/services/EADAF/api/system';
import { getPermissions } from '@/services/EADAF/api/permissions';
import {
  clearAuth,
  clearSsoAuth,
  consumeEmbedAuthFromUrl,
  getAuth,
  getSsoAuth,
  parseAuthUser,
  restorePlatformSessionFromSso,
  type CurrentUser,
} from '@/utils/auth';
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

function pageAppId(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('app');
}

async function fetchUserInfo() {
  const appId = pageAppId();
  try {
    // 嵌入页用应用令牌；没有 app 时才读管理台会话。管理台会话空着时，用已登录的应用补一份。
    let token = appId ? getSsoAuth(appId).token : getAuth().token;
    if (!token && !appId && (await restorePlatformSessionFromSso())) {
      token = getAuth().token;
    }
    if (!token) return undefined;

    const response = await getAuthCheck(appId ? { app: appId } : {}, { skipErrorHandler: true });
    const user = parseAuthUser(response);
    if (user) return user;
    throw new Error('获取用户信息失败');
  } catch (error: unknown) {
    const err = error as { response?: { status?: number } };
    if (err?.response?.status === 401) {
      // 嵌入页 401 只清这个应用的令牌。管理台会话验不过才清平台 token。
      // 不要 clearAllSsoAuth()：管理台一次 401 不该把别的应用登录态一起抹掉。
      if (appId) clearSsoAuth(appId);
      else clearAuth();
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
  // 嵌入页只需要当前用户。部门/菜单是管理台数据，用应用令牌去拉会 401，不能因此把个人中心打回登录页。
  if (currentUser && !pageAppId()) {
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
