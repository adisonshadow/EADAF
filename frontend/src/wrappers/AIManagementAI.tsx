import { AIChatPageScope, useAIChatDisplayMode } from '@eadaf/ai-base';
import { Outlet, useLocation } from 'react-router-dom';
import { useMemo } from 'react';

type PageScopeConfig = {
  fallbackSkillSlugs: string[];
  headerCaption: string;
  systemPromptPrefix: string;
  welcome: { title: string; description: string };
  prompts: { key: string; description: string }[];
};

function resolvePageScope(pathname: string): PageScopeConfig {
  if (pathname.includes('/providers')) {
    return {
      fallbackSkillSlugs: ['aibase-provider-manage'],
      headerCaption: 'AI 服务商助手',
      systemPromptPrefix:
        '你是 EADAF AI 服务商管理助手。用户不懂技术：能识别服务商时自动选用内置 baseUrl，只向用户索取 API Key，禁止询问 endpoint/baseUrl/adapterType。',
      welcome: {
        title: 'AI 服务商',
        description: '点击服务商名称旁的 @ 添加引用，快捷提示会随上下文更新。',
      },
      prompts: [],
    };
  }

  if (pathname.includes('/models')) {
    return {
      fallbackSkillSlugs: ['aibase-model-manage'],
      headerCaption: 'AI 模型助手',
      systemPromptPrefix:
        '你是 EADAF AI 模型管理助手，帮助管理员注册模型、配置 capabilities 与 inputTags/outputTags 多模态能力。',
      welcome: {
        title: 'AI 模型',
        description: '点击模型名称旁的 @ 添加引用，快捷提示会随上下文更新。',
      },
      prompts: [],
    };
  }

  if (pathname.includes('/scopes')) {
    return {
      fallbackSkillSlugs: ['aibase-capability-manage'],
      headerCaption: 'AI Scope 助手',
      systemPromptPrefix:
        '你是 EADAF AI Scope 管理助手，帮助维护 aibase Scope 与 Skill / Tool 归属。',
      welcome: {
        title: 'AI Scope',
        description: '点击 Scope 名称旁的 @ 添加引用，快捷提示会随上下文更新。',
      },
      prompts: [],
    };
  }

  const isDesignPage = pathname.includes('/skills') || pathname.includes('/tools');
  if (isDesignPage) {
    return {
      fallbackSkillSlugs: ['aibase-capability-design'],
      headerCaption: '能力设计助手',
      systemPromptPrefix:
        '你是 EADAF AI 能力设计助手，帮助用户设计 Tool、Skill 结构与指令内容。业务域 Scope 指 bizdata 实体 code 前缀，用 bizdata_list_entities / eadaf_list_bizdata_scopes 查询；禁止用 aibase_create_scope 创建业务域。',
      welcome: {
        title: 'Skill / Tool 设计',
        description: '在表单页可添加 Skill 引用；列表页点击名称旁的 @ 更新快捷提示。',
      },
      prompts: [],
    };
  }

  return {
    fallbackSkillSlugs: ['aibase-capability-manage'],
    headerCaption: '能力管理助手',
    systemPromptPrefix:
      '你是 EADAF AI 能力管理助手，帮助用户查看和维护已有 Tool、Skill 配置。业务域 Scope 使用 bizdata 前缀，勿访问 aibase.scopes 管理菜单。',
    welcome: {
      title: 'Skill / Tool 管理',
      description: '列表页点击名称旁的 @ 添加引用，快捷提示会随上下文更新。',
    },
    prompts: [],
  };
}

export default function AIManagementAI() {
  useAIChatDisplayMode('sidebar');
  const location = useLocation();
  const pageScope = useMemo(() => resolvePageScope(location.pathname), [location.pathname]);

  return (
    <AIChatPageScope
      scopeSlug="ai-management"
      semanticRouteDomains={['ai_management']}
      {...pageScope}
    >
      <Outlet />
    </AIChatPageScope>
  );
}
