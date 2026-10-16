import { AIChatPageScope, useAIChatDisplayMode } from '@eadaf/ai-base';
import { Outlet, useLocation } from 'react-router-dom';
import { useMemo } from 'react';

type PageScopeConfig = {
  headerCaption: string;
  systemPromptPrefix: string;
  welcome: { title: string; description: string };
  prompts: { key: string; description: string }[];
};

function resolvePageScope(pathname: string): PageScopeConfig {
  if (pathname.includes('/permissions')) {
    return {
      headerCaption: '权限助手',
      systemPromptPrefix:
        '你是 EADAF 权限管理助手，帮助维护 MENU/BUTTON/API 权限项。',
      welcome: {
        title: '权限管理',
        description: '点击权限编码旁的 @ 添加引用，快捷提示会随上下文更新。',
      },
      prompts: [],
    };
  }

  if (pathname.includes('/organization')) {
    return {
      headerCaption: '组织架构助手',
      systemPromptPrefix:
        '你是 EADAF 组织架构管理助手，帮助管理员维护部门树、部门角色绑定。',
      welcome: {
        title: '组织架构',
        description: '点击部门名称旁的 @ 添加引用，快捷提示会随上下文更新。',
      },
      prompts: [],
    };
  }

  if (pathname.includes('/role')) {
    return {
      headerCaption: '角色与权限助手',
      systemPromptPrefix:
        '你是 EADAF 角色与权限管理助手。业务域 Scope 指 bizdata code 前缀（如 equipment），用 eadaf_list_bizdata_scopes 查询；禁止管理 aibase.scopes。',
      welcome: {
        title: '角色管理',
        description: '点击角色名称旁的 @ 添加引用，快捷提示会随上下文更新。',
      },
      prompts: [],
    };
  }

  return {
    headerCaption: '成员管理助手',
    systemPromptPrefix:
      '你是 EADAF 成员管理助手。创建用户时 departmentId 必填；受限用户需绑定合适角色与 bizdata_scope 数据规则。',
    welcome: {
      title: '成员管理',
      description: '点击成员姓名旁的 @ 添加引用，快捷提示会随上下文更新。',
    },
    prompts: [],
  };
}

export default function MemberOrgAI() {
  useAIChatDisplayMode('sidebar');
  const location = useLocation();
  const pageScope = useMemo(() => resolvePageScope(location.pathname), [location.pathname]);

  return (
    <AIChatPageScope
      scopeSlug="member-org"
      fallbackSkillSlugs={['eadaf-access-control']}
      semanticRouteDomains={['member_org']}
      {...pageScope}
    >
      <Outlet />
    </AIChatPageScope>
  );
}
