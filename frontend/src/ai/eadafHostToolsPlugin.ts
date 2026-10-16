import type { AgentPlugin } from '@eadaf/ai-base';
import { registerEadafTools, unregisterEadafTools } from '@/pages/MemberOrg/ai/registerEadafTools';
import {
  registerAibaseAdminTools,
  unregisterAibaseAdminTools,
} from '@/pages/AIManagement/ai/registerAibaseAdminTools';
import {
  registerProviderModelTools,
  unregisterProviderModelTools,
} from '@/pages/AIManagement/ai/registerProviderModelTools';
import {
  registerApiServiceTools,
  unregisterApiServiceTools,
} from '@/pages/ApiServices/ai/registerApiServiceTools';
import {
  registerOutboundWebhookTools,
  unregisterOutboundWebhookTools,
} from '@/pages/ApiServices/ai/registerOutboundWebhookTools';
import {
  registerHookTools,
  unregisterHookTools,
} from '@/pages/ApiServices/Hooks/ai/registerHookTools';
import {
  registerBizDataTools,
  unregisterBizDataTools,
} from '@/pages/BusinessData/ai/registerBizDataTools';
import {
  registerCollectionPipelineTools,
  unregisterCollectionPipelineTools,
} from '@/pages/BusinessData/ai/registerCollectionPipelineTools';
import {
  registerMetricsTools,
  unregisterMetricsTools,
} from '@/pages/BusinessData/ai/registerMetricsTools';
import {
  registerMaterializationTools,
  unregisterMaterializationTools,
} from '@/pages/BusinessData/ai/registerMaterializationTools';
import {
  registerMetadataTools,
  unregisterMetadataTools,
} from '@/pages/BusinessData/ai/registerMetadataTools';
import { registerEadafSkillCompletionPolicies } from '@/ai/skillCompletionPolicies';

/**
 * EADAF 宿主 Tool / Skill 策略插件包。
 * 挂到 AIChatProvider `plugins`；Context dispose 时注销 client Tool。
 *
 * 当前仍走既有 register*Tools → functionRegistry；
 * 内核 ToolsService 已提供 ctx.tools，后续可逐步改为 ctx.tools.register。
 */
export const eadafHostToolsPlugin: AgentPlugin = {
  name: 'eadaf-host-tools',
  inject: ['tools'],
  apply(ctx) {
    registerAibaseAdminTools();
    registerProviderModelTools();
    registerBizDataTools();
    registerMaterializationTools();
    registerMetadataTools();
    registerCollectionPipelineTools();
    registerMetricsTools();
    registerApiServiceTools();
    registerOutboundWebhookTools();
    registerHookTools();
    registerEadafTools();
    registerEadafSkillCompletionPolicies();

    ctx.effect(() => () => {
      unregisterAibaseAdminTools();
      unregisterProviderModelTools();
      unregisterBizDataTools();
      unregisterMaterializationTools();
      unregisterMetadataTools();
      unregisterCollectionPipelineTools();
      unregisterMetricsTools();
      unregisterApiServiceTools();
      unregisterOutboundWebhookTools();
      unregisterHookTools();
      unregisterEadafTools();
    });
  },
};
