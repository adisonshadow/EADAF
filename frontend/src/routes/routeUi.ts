/**
 * 路由 UI 补充表（菜单/布局元数据）—— 语义清单之外的展示层信息。
 *
 * 设计（见 docs/TODOs/AIBase-语义化路由与AI决策跳转方案-v2.md 4.2）：
 * - `appRouteMeta` 不再手写全表，由语义清单（semanticRegistry）+ 本表派生；
 * - 语义清单提供 path / title（→ name），本表补充 icon / hideInMenu / hideMenu /
 *   layout / noContentPadding / requiresFeature / 菜单分组根 name；
 * - 未列出的字段用默认值。
 */

export interface AppRouteMeta {
  path: string;
  name?: string;
  icon?: string;
  hideInMenu?: boolean;
  hideMenu?: boolean;
  layout?: false;
  /** 主内容区无内边距（用于全屏编辑类页面） */
  noContentPadding?: boolean;
  redirect?: string;
  /** 依赖系统功能开关，未开启时不展示菜单 */
  requiresFeature?: 'metadataEnabled';
}

/** path → 菜单/布局补充；未列出的字段用默认 */
export const ROUTE_UI_BY_PATH: Record<string, Partial<AppRouteMeta>> = {
  /* 菜单分组根（redirect 条目，UI 表给 name 才进菜单元数据） */
  '/member_org': { name: '成员与组织', icon: 'TeamOutlined' },
  '/permissions': { name: '权限', icon: 'AuditOutlined' },
  '/service_provider': { name: '应用', icon: 'PartitionOutlined' },
  '/file_storage': { name: '文件', icon: 'FolderOutlined' },
  '/business_data': { name: '业务数据', icon: 'DatabaseOutlined' },
  '/api_services': { name: 'API', icon: 'ApiOutlined' },
  '/app_deployment': { name: '应用部署', icon: 'DeploymentUnitOutlined' },
  '/ai_management': { name: 'AI管理', icon: 'RobotOutlined' },
  '/system': { name: '系统', icon: 'SettingOutlined', hideInMenu: true },

  /* 页面补充（对照原 config.ts appRouteMeta 全量迁移） */
  '/business_data/model-design': { name: '数据模型', noContentPadding: true },
  '/business_data/model-design/relations-graph': {
    name: '关系图谱',
    hideInMenu: true,
    noContentPadding: true,
  },
  '/business_data/materialization/execute': { noContentPadding: true },
  '/business_data/metrics': { noContentPadding: true },
  '/business_data/metrics/dashboard': { noContentPadding: true },
  '/business_data/metrics/create': { hideInMenu: true },
  '/business_data/metrics/:id/edit': { hideInMenu: true },
  '/business_data/data-standards': { requiresFeature: 'metadataEnabled' },
  '/business_data/metadata': { requiresFeature: 'metadataEnabled', noContentPadding: true },
  '/business_data/database': { noContentPadding: true },

  /* service_provider 子页不在菜单（与现网 appRouteMeta 一致） */
  '/service_provider/create': { hideInMenu: true },
  '/service_provider/:id/edit': { hideInMenu: true },
  '/service_provider/:id/top-level-skill': { hideInMenu: true },
  '/service_provider/:id/delete': { hideInMenu: true },

  '/api_services/create': { hideInMenu: true, noContentPadding: true },
  '/api_services/list': { noContentPadding: true },
  '/api_services/collection-pipelines': { noContentPadding: true },
  '/api_services/outbound-webhooks': { name: '提交外部API' },
  '/api_services/outbound-webhooks/create': { hideInMenu: true, noContentPadding: true },
  '/api_services/outbound-webhooks/:id/edit': { hideInMenu: true, noContentPadding: true },
  '/api_services/outbound-webhooks/:id/test': { hideInMenu: true, noContentPadding: true },
  '/api_services/exception-responses': { hideInMenu: true },
  '/api_services/hooks': { name: '钩子管理' },
  '/api_services/hooks/create': { hideInMenu: true, noContentPadding: true },
  '/api_services/hooks/:id/edit': { hideInMenu: true, noContentPadding: true },
  '/api_services/hooks/:id/runs': { hideInMenu: true, noContentPadding: true },
  '/api_services/collection-pipelines/create': { hideInMenu: true, noContentPadding: true },
  '/api_services/collection-pipelines/:id/edit': { hideInMenu: true, noContentPadding: true },
  '/api_services/collection-pipelines/:id/test': { hideInMenu: true, noContentPadding: true },
  '/api_services/:id/edit': { hideInMenu: true, noContentPadding: true },
  '/api_services/:id/test': { hideInMenu: true, noContentPadding: true },

  '/ai_management/scopes': { hideInMenu: true },
  '/ai_management/scopes/create': { hideInMenu: true },
  '/ai_management/scopes/:id/edit': { hideInMenu: true },
  '/ai_management/scopes/:id': { hideInMenu: true },
  '/system/operation-logs': { name: '操作日志', icon: 'AuditOutlined', hideInMenu: true },
  '/system/settings': { hideInMenu: true },
};

/**
 * 不进语义清单的手写路由元数据（非目标：个人中心等）。
 * 走主布局，顶栏与系统设置相同；不进主导航，只从头像菜单进入。
 */
export const EXTRA_ROUTE_META: AppRouteMeta[] = [
  {
    path: '/account/center',
    name: '个人中心',
    icon: 'UserOutlined',
    hideInMenu: true,
  },
  {
    path: '/account/sessions',
    name: '我的登录信息',
    icon: 'DesktopOutlined',
    hideInMenu: true,
  },
];
