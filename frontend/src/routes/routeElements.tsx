import React, { lazy, type ReactNode } from 'react';
import type { AppSemanticRoute } from './semanticRegistry';

/**
 * pageKey → element 工厂（含 JSX 的派生层 B）。
 *
 * 设计（见 docs/TODOs/AIBase-语义化路由与AI决策跳转方案-v2.md 4.3.1）：
 * - 语义清单只描述「是什么页、什么 mode」；这里的 PAGE_ELEMENTS 负责把
 *   pageKey + mode 解析为真正的懒加载组件（解决 v1 用 LazyExoticComponent
 *   表达不了 FormPage mode props 的问题）；
 * - 页面条目 = ReactNode（无 mode 依赖）；表单页 = (mode) => element。
 */

const Member = lazy(() => import('@/pages/MemberOrg/Member'));
const MemberFormPage = lazy(() => import('@/pages/MemberOrg/Member/FormPage'));
const Organization = lazy(() => import('@/pages/MemberOrg/Organization'));
const OrganizationFormPage = lazy(() => import('@/pages/MemberOrg/Organization/FormPage'));
const Role = lazy(() => import('@/pages/MemberOrg/Role'));
const PermissionsMenu = lazy(() => import('@/pages/Permissions/Menu'));
const PermissionsButton = lazy(() => import('@/pages/Permissions/Button'));
const PermissionsAPI = lazy(() => import('@/pages/Permissions/BuiltinApi'));
const Applications = lazy(() => import('@/pages/ServiceProvider/Applications'));
const ApplicationFormPage = lazy(() => import('@/pages/ServiceProvider/Applications/FormPage'));
const ApplicationTopLevelSkillPage = lazy(
  () => import('@/pages/ServiceProvider/Applications/TopLevelSkillPage'),
);
const ApplicationDeletePage = lazy(
  () => import('@/pages/ServiceProvider/Applications/DeletePage'),
);
const FileStorageBuckets = lazy(() => import('@/pages/FileStorage/Buckets'));
const FileStorageBrowser = lazy(() => import('@/pages/FileStorage/Browser'));
const ModelDesigner = lazy(() => import('@/pages/BusinessData/ModelDesigner'));
const RelationsGraphPage = lazy(() => import('@/pages/BusinessData/ModelDesigner/RelationsGraph'));
const MaterializationExecute = lazy(() => import('@/pages/BusinessData/Materialization/Execute'));
const DatabaseConnections = lazy(() => import('@/pages/BusinessData/Materialization/Connections'));
const MaterializedDatabase = lazy(() => import('@/pages/BusinessData/Materialization/Database'));
const MaterializedTableSchema = lazy(
  () => import('@/pages/BusinessData/Materialization/TableBrowse/Schema'),
);
const MaterializedTableData = lazy(
  () => import('@/pages/BusinessData/Materialization/TableBrowse/Data'),
);
const MetricsList = lazy(() => import('@/pages/BusinessData/Metrics'));
const MetricsFormPage = lazy(() => import('@/pages/BusinessData/Metrics/FormPage'));
const MetricsDashboard = lazy(() => import('@/pages/BusinessData/Metrics/Dashboard'));
const CollectionPipelineList = lazy(() => import('@/pages/BusinessData/CollectionPipelines'));
const CollectionPipelineFormPage = lazy(
  () => import('@/pages/BusinessData/CollectionPipelines/FormPage'),
);
const CollectionPipelineTest = lazy(() => import('@/pages/BusinessData/CollectionPipelines/Test'));
const ApiServiceCreate = lazy(() => import('@/pages/ApiServices/Create'));
const ApiServiceList = lazy(() => import('@/pages/ApiServices/List'));
const ApiServiceEdit = lazy(() => import('@/pages/ApiServices/Edit'));
const ApiServiceTest = lazy(() => import('@/pages/ApiServices/Test'));
const ExceptionResponses = lazy(() => import('@/pages/ApiServices/ExceptionResponses'));
const OutboundWebhookList = lazy(() => import('@/pages/ApiServices/OutboundWebhooks'));
const OutboundWebhookFormPage = lazy(
  () => import('@/pages/ApiServices/OutboundWebhooks/FormPage'),
);
const OutboundWebhookTest = lazy(() => import('@/pages/ApiServices/OutboundWebhooks/Test'));
const HookListPage = lazy(() => import('@/pages/ApiServices/Hooks'));
const HookFormPage = lazy(() => import('@/pages/ApiServices/Hooks/FormPage'));
const HookRunsPage = lazy(() => import('@/pages/ApiServices/Hooks/Runs'));
const AIProviders = lazy(() => import('@/pages/AIManagement/Providers'));
const ProviderFormPage = lazy(() => import('@/pages/AIManagement/Providers/FormPage'));
const AIModels = lazy(() => import('@/pages/AIManagement/AiModels'));
const ModelFormPage = lazy(() => import('@/pages/AIManagement/AiModels/FormPage'));
const ChatDemo = lazy(() => import('@/pages/AIManagement/ChatDemo'));
const Scopes = lazy(() => import('@/pages/AIManagement/Scopes'));
const ScopeFormPage = lazy(() => import('@/pages/AIManagement/Scopes/FormPage'));
const Tools = lazy(() => import('@/pages/AIManagement/Tools'));
const ToolFormPage = lazy(() => import('@/pages/AIManagement/Tools/FormPage'));
const Skills = lazy(() => import('@/pages/AIManagement/Skills'));
const SkillFormPage = lazy(() => import('@/pages/AIManagement/Skills/FormPage'));
const RequestLogs = lazy(() => import('@/pages/AIManagement/RequestLogs'));
const SystemSettings = lazy(() => import('@/pages/System/Settings'));
const OperationLogs = lazy(() => import('@/pages/System/OperationLogs'));
const SystemHealth = lazy(() => import('@/pages/System/Health'));
const DataStandards = lazy(() => import('@/pages/BusinessData/DataStandards'));
const MetadataCatalog = lazy(() => import('@/pages/BusinessData/Metadata'));
const AppDataTransferPage = lazy(() => import('@/pages/AppDeployment/AppDataTransfer'));
const PlatformDataTransferPage = lazy(() => import('@/pages/AppDeployment/PlatformDataTransfer'));
const PublishPlatformPage = lazy(() => import('@/pages/AppDeployment/PublishPlatform'));
const PublishAppPage = lazy(() => import('@/pages/AppDeployment/PublishApp'));

/**
 * pageKey → 无 mode 的页面，或 (mode) => element。
 * 表单页必须通过工厂传入 mode（create/edit/view），与语义清单 mode 对齐。
 */
export const PAGE_ELEMENTS: Record<string, ReactNode | ((mode: string) => ReactNode)> = {
  /* member_org */
  member: <Member />,
  memberForm: (mode) => <MemberFormPage mode={mode as 'create' | 'edit'} />,
  organization: <Organization />,
  organizationForm: (mode) => <OrganizationFormPage mode={mode as 'create' | 'edit'} />,
  role: <Role />,
  permissionsMenu: <PermissionsMenu />,
  permissionsButton: <PermissionsButton />,
  permissionsApi: <PermissionsAPI />,

  /* service_provider */
  applications: <Applications />,
  applicationForm: (mode) => <ApplicationFormPage mode={mode as 'create' | 'edit'} />,
  applicationTopLevelSkill: <ApplicationTopLevelSkillPage />,
  applicationDelete: <ApplicationDeletePage />,

  /* file_storage */
  fileStorageBuckets: <FileStorageBuckets />,
  fileStorageBrowser: <FileStorageBrowser />,

  /* bizdata_design */
  modelDesigner: <ModelDesigner />,
  relationsGraph: <RelationsGraphPage />,

  /* bizdata_materialize */
  materializationExecute: <MaterializationExecute />,
  databaseConnections: <DatabaseConnections />,
  materializedDatabase: <MaterializedDatabase />,
  materializedTableSchema: <MaterializedTableSchema />,
  materializedTableData: <MaterializedTableData />,
  metricsList: <MetricsList />,
  metricsForm: (mode) => <MetricsFormPage mode={mode as 'create' | 'edit'} />,
  metricsDashboard: <MetricsDashboard />,

  /* bizdata_metadata */
  dataStandards: <DataStandards />,
  metadataCatalog: <MetadataCatalog />,

  /* system */
  systemSettings: <SystemSettings />,
  operationLogs: <OperationLogs />,
  systemHealth: <SystemHealth />,

  /* app_deployment */
  appDataTransfer: <AppDataTransferPage />,
  platformDataTransfer: <PlatformDataTransferPage />,
  publishPlatform: <PublishPlatformPage />,
  publishApp: <PublishAppPage />,

  /* api_services */
  apiServiceCreate: <ApiServiceCreate />,
  apiServiceList: <ApiServiceList />,
  apiServiceEdit: <ApiServiceEdit />,
  apiServiceTest: <ApiServiceTest />,
  exceptionResponses: <ExceptionResponses />,
  outboundWebhooks: <OutboundWebhookList />,
  outboundWebhookForm: (mode) => (
    <OutboundWebhookFormPage mode={mode as 'create' | 'edit'} />
  ),
  outboundWebhookTest: <OutboundWebhookTest />,
  hooksList: <HookListPage />,
  hooksForm: (mode) => <HookFormPage mode={mode as 'create' | 'edit'} />,
  hooksRuns: <HookRunsPage />,
  collectionPipelines: <CollectionPipelineList />,
  collectionPipelineForm: (mode) => (
    <CollectionPipelineFormPage mode={mode as 'create' | 'edit'} />
  ),
  collectionPipelineTest: <CollectionPipelineTest />,

  /* ai_management */
  aiProviders: <AIProviders />,
  providerForm: (mode) => <ProviderFormPage mode={mode as 'create' | 'edit' | 'view'} />,
  aiModels: <AIModels />,
  modelForm: (mode) => <ModelFormPage mode={mode as 'create' | 'edit' | 'view'} />,
  chatDemo: <ChatDemo />,
  aiScopes: <Scopes />,
  scopeForm: (mode) => <ScopeFormPage mode={mode as 'create' | 'edit' | 'view'} />,
  aiTools: <Tools />,
  toolForm: (mode) => <ToolFormPage mode={mode as 'create' | 'edit' | 'view'} />,
  aiSkills: <Skills />,
  skillForm: (mode) => <SkillFormPage mode={mode as 'create' | 'edit' | 'view'} />,
  requestLogs: <RequestLogs />,
};

/** 语义条目 → element；缺失映射或 mode 缺失时抛错（verify 会强制覆盖） */
export function resolveRouteElement(route: AppSemanticRoute): ReactNode {
  const factory = PAGE_ELEMENTS[route.pageKey];
  if (!factory) {
    throw new Error(`Missing PAGE_ELEMENTS[${route.pageKey}]（path: ${route.path}）`);
  }
  if (typeof factory === 'function') {
    if (!route.mode) {
      throw new Error(`${route.path} needs mode（pageKey: ${route.pageKey}）`);
    }
    return factory(route.mode);
  }
  return factory;
}
