import { patchBusinessDataEntity } from '@/services/EADAF/api/businessData';
import { getApiData, getApiErrorMessage, isApiSuccess } from '@/utils/apiResponse';
import { loadEntity, resolveBizDataEntityId } from './bizdataFieldUtils';

const CODE_RENAME_ALLOWED_KEYS = new Set(['entityId', 'entityCode', 'code', 'tableName']);

export function assertCodeRenameOnlyArgs(args: Record<string, unknown>): void {
  const extraKeys = Object.keys(args).filter((key) => {
    if (CODE_RENAME_ALLOWED_KEYS.has(key)) return false;
    const value = args[key];
    if (value === undefined || value === null) return false;
    if (typeof value === 'string' && !value.trim()) return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  });
  if (extraKeys.length) {
    throw new Error(
      `修改实体 code 时仅传 entityCode + code（可选 tableName），勿传 ${extraKeys.join('、')}。调整 Scope 请用 bizdata_rename_entity_code，禁止 delete + create。`,
    );
  }
}

export async function assertEntityCodeNotExists(code: string): Promise<void> {
  const trimmed = code.trim();
  if (!trimmed) return;
  try {
    await resolveBizDataEntityId({ entityCode: trimmed });
    throw new Error(
      `code「${trimmed}」已存在。调整 Scope/重命名请用 bizdata_rename_entity_code 或 bizdata_update_entity（仅传 entityCode + code），禁止 delete + create。`,
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes('已存在')) {
      throw error;
    }
  }
}

export interface EntityCodeRenameResult {
  entity: API.BusinessDataEntity;
  previousCode: string;
  newCode: string;
  fieldCount: number;
  _verification: {
    verified: true;
    previousCode: string;
    newCode: string;
    entityId?: string;
    fieldCount: number;
    message: string;
  };
}

/** 纯 code 重命名：保留字段/索引/关系/物化/MOCK，后端同一事务级联引用 */
export async function executeEntityCodeRename(
  entityCode: string,
  newCode: string,
  tableName?: string,
): Promise<EntityCodeRenameResult> {
  const previousCode = entityCode.trim();
  const trimmedNew = newCode.trim();
  if (!previousCode || !trimmedNew) {
    throw new Error('entityCode 与 code 均不能为空');
  }
  if (previousCode === trimmedNew) {
    throw new Error(`新 code 与当前 code 相同（${previousCode}），无需重命名`);
  }

  const entityId = await resolveBizDataEntityId({ entityCode: previousCode });
  const before = await loadEntity(entityId);

  const patchPayload: Record<string, unknown> = { code: trimmedNew };
  if (tableName !== undefined) {
    patchPayload.tableName = String(tableName).trim() || undefined;
  }

  const patchRes = await patchBusinessDataEntity(entityId, patchPayload);
  if (!isApiSuccess(patchRes)) {
    throw new Error(getApiErrorMessage(patchRes, '重命名实体 code 失败'));
  }
  const patched = getApiData<API.BusinessDataEntity>(patchRes);
  if (patched?.code && patched.code !== trimmedNew) {
    throw new Error(`重命名未生效：期望 code=${trimmedNew}，实际=${patched.code}`);
  }

  const entity = await loadEntity(entityId);
  if (entity.code !== trimmedNew) {
    throw new Error(`重命名未生效：期望 code=${trimmedNew}，实际=${entity.code ?? '未知'}`);
  }

  const fieldCount = entity.fields?.length ?? before.fields?.length ?? 0;
  return {
    entity,
    previousCode,
    newCode: trimmedNew,
    fieldCount,
    _verification: {
      verified: true,
      previousCode,
      newCode: trimmedNew,
      entityId: entity.id,
      fieldCount,
      message: `已验证 entity.code 从 ${previousCode} 变更为 ${trimmedNew}（保留 ${fieldCount} 个字段）`,
    },
  };
}
