import type { AIBaseClient } from '../sdk/client';
import type { AIBaseSkill } from '../types';

export type SkillBodyPayload = {
  slug: string;
  name: string;
  description?: string;
  contentMarkdown: string;
  /** 完整 Skill（含 tools），用于激活后扩展可见 Tool 池 */
  skill?: AIBaseSkill;
};

type SkillBodyLoader = (slug: string) => Promise<SkillBodyPayload | null>;
type SkillActivatedListener = (skill: AIBaseSkill) => void;

let loader: SkillBodyLoader | null = null;
let activatedListener: SkillActivatedListener | null = null;

/** 由 AIChatProvider / useAIBaseChat 注入，使 harness `skill` 工具可按需拉正文 */
export function registerSkillBodyLoader(next: SkillBodyLoader | null): void {
  loader = next;
}

/** 会话层监听：`skill` 工具成功加载后合并进激活 Skill，扩展 Tool schema */
export function registerSkillActivatedListener(next: SkillActivatedListener | null): void {
  activatedListener = next;
}

export function notifySkillActivated(skill: AIBaseSkill): void {
  activatedListener?.(skill);
}

export async function loadSkillBodyBySlug(slug: string) {
  const key = String(slug || '').trim();
  if (!key) return null;
  if (!loader) {
    throw new Error('skill 正文加载器未注册（需在 AIChatProvider 会话内调用）');
  }
  const body = await loader(key);
  if (body?.skill) {
    notifySkillActivated(body.skill);
  }
  return body;
}

/** 便捷：用 AIBaseClient 构造加载器 */
export function createClientSkillBodyLoader(client: AIBaseClient): SkillBodyLoader {
  return async (slug) => {
    try {
      const skill = await client.loadSkill(slug);
      if (!skill) return null;
      return {
        slug: skill.slug,
        name: skill.name,
        description: skill.description,
        contentMarkdown: skill.contentMarkdown || '',
        skill,
      };
    } catch {
      return null;
    }
  };
}
