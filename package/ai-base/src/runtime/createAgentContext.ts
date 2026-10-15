import { Context, type ForkScope } from '@cordisjs/core';
import { ToolsService } from './toolsService';
import { SurfacesService } from './surfacesService';
import type { AgentPlugin } from './types';
import './types';

export interface CreateAgentContextOptions {
  /** 宿主 / 业务插件包（在 ToolsService / SurfacesService 就绪后挂载） */
  plugins?: AgentPlugin[];
}

export interface AgentContextHandle {
  ctx: Context;
  /** 卸载全部插件并撤销 effect 注册 */
  dispose: () => void;
}

/**
 * 启动 Agent 能力平面（Cordis Context）。
 * 不替代 React UI；只负责 Tool / Surfaces 等能力的可组合注册与生命周期。
 */
export function createAgentContext(options: CreateAgentContextOptions = {}): AgentContextHandle {
  const root = new Context();
  root.plugin(ToolsService);
  root.plugin(SurfacesService);

  const forks: ForkScope[] = [];
  for (const plugin of options.plugins || []) {
    // Cordis Plugin 联合类型在部分 TS 配置下无法匹配 overload，运行时合法
    forks.push(root.plugin(plugin as never));
  }

  return {
    ctx: root,
    dispose: () => {
      for (let i = forks.length - 1; i >= 0; i -= 1) {
        try {
          forks[i].dispose();
        } catch {
          // 忽略单插件卸载异常，继续清理其余
        }
      }
      try {
        void root.stop();
      } catch {
          // ignore
      }
    },
  };
}
