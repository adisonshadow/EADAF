import type { AISurfaceDefinition, AISurfaceSnapshot } from '../types/aiSurface';

const surfaces = new Map<string, AISurfaceDefinition>();

/** 作用域键：domain::id，避免多页同 id 静默覆盖 */
export function surfaceRegistryKey(domain: string, id: string): string {
  return `${String(domain || 'default').trim()}::${String(id || '').trim()}`;
}

export function registerAISurface(def: AISurfaceDefinition): void {
  surfaces.set(surfaceRegistryKey(def.domain, def.id), def);
}

export function unregisterAISurface(id: string, domain?: string): void {
  if (domain) {
    surfaces.delete(surfaceRegistryKey(domain, id));
    return;
  }
  // 兼容旧调用：按 id 后缀匹配删除
  for (const key of Array.from(surfaces.keys())) {
    if (key === id || key.endsWith(`::${id}`)) {
      surfaces.delete(key);
    }
  }
}

export function getAISurface(id: string, domain?: string): AISurfaceDefinition | undefined {
  if (domain) return surfaces.get(surfaceRegistryKey(domain, id));
  for (const [key, def] of surfaces) {
    if (key === id || key.endsWith(`::${id}`) || def.id === id) return def;
  }
  return undefined;
}

export function getAllAISurfaces(): AISurfaceDefinition[] {
  return Array.from(surfaces.values());
}

export async function readAllAISurfaces(): Promise<AISurfaceSnapshot[]> {
  const defs = getAllAISurfaces();
  const snapshots = await Promise.all(
    defs.map(async (def) => ({
      id: def.id,
      domain: def.domain,
      label: def.label,
      data: await def.read(),
    })),
  );
  return snapshots;
}

/** 测试用 */
export function clearAISurfacesForTests(): void {
  surfaces.clear();
}
