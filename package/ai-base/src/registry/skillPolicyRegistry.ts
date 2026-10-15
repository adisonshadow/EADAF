import type { AIBaseSkill, SkillCompletionStrategy } from '../types';

/**
 * 业务方覆盖通道：按 Skill slug 注册完成策略覆盖。
 *
 * 设计：Skill 的 completionStrategy 可由后端元数据（completion_strategy 字段）下发，
 * 也可由前端在此注册表覆盖（覆盖优先级高于后端声明）。两者都为空时该 Skill 无策略。
 *
 * 把"是否需要强制续调 Tool / 什么文本算任务完成"这类业务判定从 SDK 内部正则
 * 下沉为业务方显式声明，SDK 保持零业务知识。
 */
const overrides = new Map<string, SkillCompletionStrategy>();

export type SkillCompletionPolicyOverride = Partial<SkillCompletionStrategy>;

/** 注册（或覆盖）某 Skill slug 的完成策略。覆盖会与后端声明合并，覆盖优先。 */
export function registerSkillCompletionPolicy(
  slug: string,
  override: SkillCompletionPolicyOverride,
): void {
  if (!slug) return;
  overrides.set(slug, { ...override });
}

/** 注销某 Skill slug 的策略覆盖（回退到后端声明） */
export function unregisterSkillCompletionPolicy(slug: string): void {
  overrides.delete(slug);
}

/** 清空所有已注册的策略覆盖（测试/卸载场景） */
export function clearSkillCompletionPolicies(): void {
  overrides.clear();
}

/**
 * 取某 Skill 生效的完成策略：前端注册表覆盖优先于后端 skill.completionStrategy 声明。
 * 两者都为空返回 undefined。
 */
export function getSkillCompletionStrategy(
  skill: AIBaseSkill,
): SkillCompletionStrategy | undefined {
  const override = overrides.get(skill.slug);
  if (override) {
    return { ...skill.completionStrategy, ...override };
  }
  return skill.completionStrategy;
}

/** 全局框架 Skill：只提供协议，不参与写操作验收清单 */
const FRAMEWORK_SKILL_SLUG = 'aibase-chat-framework';

/**
 * 解析用于 task_complete / 结构化终止的完成策略。
 *
 * 不得把多个无关 Skill 的 requiredTools / successCriteria 做并集——
 * 否则查询页（如 uac-access-control）会被建模/物化/API 等写操作清单误伤，
 * 出现「task_complete 失败：关键 Tool 未调用：bizdata_validate_model…」。
 *
 * 选取规则：
 * 1. 优先页面 fallbackSkillSlugs 中第一个有策略的 Skill
 * 2. 否则优先非框架 Skill（排除 aibase-chat-framework）
 * 3. 否则取第一个有策略的 Skill
 * 4. 只返回该主 Skill 的策略（不合并 requiredTools / successCriteria）
 */
export function resolveTerminationCompletionStrategy(
  skills: AIBaseSkill[],
  preferredSlugs?: string[],
): (SkillCompletionStrategy & { sourceSlug?: string }) | undefined {
  if (!skills.length) return undefined;

  const entries = skills
    .map((skill) => ({ skill, strategy: getSkillCompletionStrategy(skill) }))
    .filter(
      (item): item is { skill: AIBaseSkill; strategy: SkillCompletionStrategy } =>
        Boolean(item.strategy),
    );
  if (!entries.length) return undefined;

  const preferred = (preferredSlugs || []).filter(Boolean);
  // 激活页 Skill：fallbackSkillSlugs 按顺序优先（第一个有策略的激活 Skill）
  let primary: { skill: AIBaseSkill; strategy: SkillCompletionStrategy } | undefined;
  if (preferred.length > 0) {
    for (const slug of preferred) {
      const hit = entries.find((item) => item.skill.slug === slug);
      if (hit) {
        primary = hit;
        break;
      }
    }
  }
  if (!primary) {
    primary =
      entries.find((item) => item.skill.slug !== FRAMEWORK_SKILL_SLUG) || entries[0];
  }

  return { ...primary.strategy, sourceSlug: primary.skill.slug };
}
