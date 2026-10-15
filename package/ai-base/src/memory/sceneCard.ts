import { readAllAISurfaces } from '../registry/aiSurfaceRegistry';
import type { ChatReferenceItem } from '../provider/ChatReferenceContext';
import { buildSceneCard, collectFocusIdsFromSurfaces } from './projectWorkingMemory';

/** 读取当前 Surface 并生成 L2 场景卡（失败时返回空串） */
export async function buildCurrentSceneCard(options?: {
  route?: string;
  pinnedRefs?: ChatReferenceItem[];
  domain?: string;
}): Promise<{ sceneCard: string; focusIds: Set<string> }> {
  try {
    let surfaces = await readAllAISurfaces();
    if (options?.domain) {
      surfaces = surfaces.filter((s) => s.domain === options.domain);
    }
    const sceneCard = buildSceneCard({
      route: options?.route,
      surfaces,
      pinnedRefs: options?.pinnedRefs,
    });
    return { sceneCard, focusIds: collectFocusIdsFromSurfaces(surfaces) };
  } catch {
    return { sceneCard: '', focusIds: new Set() };
  }
}
