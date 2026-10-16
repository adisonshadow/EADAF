import { lazy, Fragment, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { notifyPathnameChange } from '@eadaf/ai-base';
import AppLayout from '@/layouts/AppLayout';
import SecurityLayout from '@/layouts/SecurityLayout';
import AIChatHidden from '@/wrappers/AIChatHidden';
import BusinessDataDesignAI from '@/wrappers/BusinessDataDesignAI';
import BusinessDataMaterializeAI from '@/wrappers/BusinessDataMaterializeAI';
import AIManagementAI from '@/wrappers/AIManagementAI';
import ApiServicesAI from '@/wrappers/ApiServicesAI';
import MemberOrgAI from '@/wrappers/MemberOrgAI';
import {
  EADAF_SEMANTIC_ROUTES,
  isSemanticRedirect,
  type AppSemanticEntry,
  type RouteScopeGroup,
} from './semanticRegistry';
import { resolveRouteElement } from './routeElements';
import type { ComponentType, ReactNode } from 'react';
import { setNavigate } from '@/utils/navigation';

/* ------------------------- 特殊路由（手写，不进语义清单） ------------------------- */

const Auth = lazy(() => import('@/pages/Auth'));
const Logout = lazy(() => import('@/pages/Auth/Logout'));
const ResetPSWD = lazy(() => import('@/pages/ResetPSWD'));
const ApplicationPublicApiCatalog = lazy(() => import('@/pages/ServiceProvider/Applications/PublicApiCatalog'));
const ApplicationExceptionResponses = lazy(() => import('@/pages/ServiceProvider/Applications/PublicApiCatalog/ExceptionResponsesPage'));
const ApplicationOutboundWebhooksDocs = lazy(() => import('@/pages/ServiceProvider/Applications/PublicApiCatalog/OutboundWebhooksPage'));
const ApplicationApiSkill = lazy(() => import('@/pages/ServiceProvider/Applications/PublicApiCatalog/ApiSkillPage'));
const BusinessDataMetadataAI = lazy(() => import('@/wrappers/BusinessDataMetadataAI'));
const AccountCenter = lazy(() => import('@/pages/account/center'));
const Page404 = lazy(() => import('@/pages/404'));
const Page403 = lazy(() => import('@/pages/403'));
const Page401 = lazy(() => import('@/pages/401'));
const Page500 = lazy(() => import('@/pages/500'));

function NavigationBinder() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    setNavigate(navigate);
  }, [navigate]);
  // 显式通知 AI Chat displayMode，替代 history.pushState monkey-patch
  useEffect(() => {
    notifyPathnameChange();
  }, [location.pathname, location.search]);
  return null;
}

/* ----------------------------- 业务路由派生层 ----------------------------- */

/**
 * scopeGroup → AIChatPageScope wrapper。
 * - 非 null：同组页面包在同一 layout <Route> 下（与现 index 等价）；
 * - null：平铺（无页面专属 wrapper）。
 * BusinessDataMetadataAI 现状为 lazy，派生时统一处理（lazy 组件可直接作为 element）。
 */
const SCOPE_WRAPPERS: Record<
  RouteScopeGroup,
  ComponentType<{ children?: ReactNode }> | null
> = {
  member_org: MemberOrgAI,
  bizdata_design: BusinessDataDesignAI,
  bizdata_materialize: BusinessDataMaterializeAI,
  bizdata_metadata: BusinessDataMetadataAI,
  api_services: ApiServicesAI,
  ai_management: AIManagementAI,
  service_provider: null,
  file_storage: null,
  app_deployment: null,
  system: null,
};

/**
 * 由语义清单生成与现 index 等价的业务 <Route> 树（含 Navigate redirect）。
 * 同 scopeGroup 页面包在同一 wrapper 下；redirect → <Navigate to replace />。
 */
export function buildBusinessRoutes(
  entries: AppSemanticEntry[] = EADAF_SEMANTIC_ROUTES,
): ReactNode {
  const groups = new Map<RouteScopeGroup, AppSemanticEntry[]>();
  for (const entry of entries) {
    const list = groups.get(entry.scopeGroup) ?? [];
    list.push(entry);
    groups.set(entry.scopeGroup, list);
  }

  return (
    <>
      {Array.from(groups.entries()).map(([group, groupEntries]) => {
        const Wrapper = SCOPE_WRAPPERS[group];
        const children = groupEntries.map((entry) => {
          if (isSemanticRedirect(entry)) {
            return (
              <Route
                key={entry.path}
                path={entry.path}
                element={<Navigate to={entry.to} replace />}
              />
            );
          }
          return (
            <Route
              key={entry.path}
              path={entry.path}
              element={resolveRouteElement(entry)}
            />
          );
        });

        if (Wrapper) {
          return (
            <Route key={`group-${group}`} element={<Wrapper />}>
              {children}
            </Route>
          );
        }
        return <Fragment key={`group-${group}`}>{children}</Fragment>;
      })}
    </>
  );
}

export default function AppRoutes() {
  return (
    <>
      <NavigationBinder />
      <Routes>
        <Route path="/" element={<Navigate to="/member_org" replace />} />

        {/* 公开 API 文档：独立路由，避免 AnimatedOutlet 切换动画 */}
        <Route path="/public/applications/:code/api-docs" element={<ApplicationPublicApiCatalog />} />
        {/* 异常响应明细页（所有 API 共享，需在通配路由前匹配） */}
        <Route path="/public/applications/:code/api-docs/exception-responses" element={<ApplicationExceptionResponses />} />
        <Route path="/public/applications/:code/api-docs/outbound-webhooks" element={<ApplicationOutboundWebhooksDocs />} />
        <Route path="/public/applications/:code/api-docs/api-skill" element={<ApplicationApiSkill />} />
        <Route path="/public/applications/:code/api-docs/*" element={<ApplicationPublicApiCatalog />} />

        <Route element={<AIChatHidden />}>
          <Route path="/auth/login" element={<Auth />} />
          <Route path="/auth/logout" element={<Logout />} />
          <Route path="/auth/reset-password" element={<ResetPSWD />} />
        </Route>

        <Route element={<SecurityLayout />}>
          <Route element={<AppLayout />}>{buildBusinessRoutes()}</Route>

          <Route element={<AIChatHidden />}>
            <Route path="/account/center" element={<AccountCenter />} />
          </Route>
        </Route>

        <Route path="/403" element={<Page403 />} />
        <Route path="/401" element={<Page401 />} />
        <Route path="/500" element={<Page500 />} />
        <Route path="*" element={<Page404 />} />
      </Routes>
    </>
  );
}
