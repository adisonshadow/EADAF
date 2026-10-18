/**
 * Tool → 「授予它的 Skill」反查表。
 *
 * 数据来源：`GET /v1/ai/capabilities` 的 `skills[].grantedTools`（后端 skill_tools 关联），
 * 以及运行期 `skill({slug})` 加载成功后的 `data.grantedTools`。
 *
 * 用途：模型的 Tool 可见集 = 本回合已激活 Skill 的授权集。当它想用一个**本回合没授权**的
 * Tool（例如在业务页想用 AI 管理专属的 `aibase_list_skills`）时，报错信息可以直接告诉它
 * 「这个 Tool 由 Skill X 授予，先 skill({slug:'X'}) 加载」——而不是让它反复用 run_code 猜名字。
 */

export interface SkillGrant {
  slug: string;
  name?: string;
}

const toolToSkills = new Map<string, SkillGrant[]>();

function normalizeToolName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** 覆盖式写入（capabilities 目录刷新时调用） */
export function setSkillGrantedTools(
  entries: Array<{ slug?: string; name?: string; grantedTools?: string[] }>,
): void {
  toolToSkills.clear();
  for (const entry of entries || []) {
    const slug = normalizeToolName(entry?.slug);
    if (!slug) continue;
    mergeSkillGrantedTools(slug, entry?.name, entry?.grantedTools);
  }
}

/** 增量写入（skill 运行期加载成功后补充，幂等） */
export function mergeSkillGrantedTools(
  slug: string,
  name?: string,
  grantedTools?: string[],
): void {
  const safeSlug = normalizeToolName(slug);
  if (!safeSlug || !Array.isArray(grantedTools)) return;
  for (const raw of grantedTools) {
    const tool = normalizeToolName(raw);
    if (!tool) continue;
    const list = toolToSkills.get(tool) || [];
    const hit = list.find((item) => item.slug === safeSlug);
    if (hit) {
      if (!hit.name && name) hit.name = name;
      continue;
    }
    list.push({ slug: safeSlug, ...(name ? { name } : {}) });
    toolToSkills.set(tool, list);
  }
}

/** 查询哪个 / 哪些 Skill 授予该 Tool；无记录返回空数组 */
export function findSkillsGrantingTool(toolName: string): SkillGrant[] {
  const key = normalizeToolName(toolName);
  if (!key) return [];
  return (toolToSkills.get(key) || []).map((item) => ({ ...item }));
}

/** 反查表里是否有任何数据（便于报错文案区分「没有归属信息」） */
export function hasSkillGrantIndex(): boolean {
  return toolToSkills.size > 0;
}

export function clearSkillGrantedTools(): void {
  toolToSkills.clear();
}

/** 测试用：把 slug 列表渲染成 `\`a\` / \`b\`` 形态 */
export function formatSkillGrantList(grants: SkillGrant[]): string {
  return grants.map((item) => `\`${item.slug}\``).join(' / ');
}
