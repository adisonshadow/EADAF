import type { ToolDisplay, ToolResponse } from '../types/toolResponse';

const MAX_TABLE_ROWS = 50;
const MAX_ENTITY_KEYS = 40;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function truncateRows(rows: unknown[]): unknown[] {
  if (rows.length <= MAX_TABLE_ROWS) return rows;
  return rows.slice(0, MAX_TABLE_ROWS);
}

function pickEntityFields(row: Record<string, unknown>): Record<string, unknown> {
  const keys = Object.keys(row).filter((k) => !k.startsWith('_'));
  const picked: Record<string, unknown> = {};
  for (const key of keys.slice(0, MAX_ENTITY_KEYS)) {
    const value = row[key];
    if (value === undefined) continue;
    picked[key] = value;
  }
  return picked;
}

/** 从 list/query 形 payload 抽出行数组 */
function extractRows(data: unknown): unknown[] | null {
  if (Array.isArray(data)) return data;
  if (!isPlainObject(data)) return null;
  if (Array.isArray(data.rows)) return data.rows;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.list)) return data.list;
  if (Array.isArray(data.data)) return data.data;
  return null;
}

/**
 * 查询/写成功时若 handler 未声明 display，内核按 data 形状填默认 Surface。
 * 失败时由调用方显式设 error Surface；此处不覆盖已有 display。
 */
export function inferToolDisplay(
  envelope: Pick<ToolResponse, 'ok' | 'kind' | 'data' | 'error' | 'verified' | 'display' | 'meta'>,
): ToolDisplay | undefined {
  if (envelope.display) return envelope.display;

  if (envelope.kind === 'user_choice_request') {
    return undefined;
  }

  if (envelope.kind === 'business_error' || envelope.kind === 'system_error' || envelope.ok === false) {
    return {
      kind: 'error',
      title: envelope.error?.code || '执行失败',
      payload: {
        code: envelope.error?.code,
        message: envelope.error?.message || '执行失败',
        hint: envelope.error?.hint,
      },
    };
  }

  const data = envelope.data;
  const tool = envelope.meta?.tool || '';

  // task_complete 交付数据（summary / next_steps）走独立 segment，不进 InvocationCard
  if (tool === 'task_complete') {
    return {
      kind: 'status',
      title: '完成任务',
      payload: {
        message: envelope.verified === true ? '已完成' : '执行成功',
      },
      visibility: 'transient',
    };
  }

  // 纯副作用 / harness 工具：一句话即可
  if (
    data == null ||
    data === true ||
    (isPlainObject(data) &&
      (data.navigated === true ||
        data.theme != null ||
        data.updated === true ||
        Object.keys(data).length === 0))
  ) {
    if (
      /navigate|theme|update_plan|ask_user/i.test(tool) ||
      data == null ||
      (isPlainObject(data) && Object.keys(data).length === 0)
    ) {
      return {
        kind: 'status',
        title: tool || '完成',
        payload: {
          message:
            isPlainObject(data) && typeof data.message === 'string'
              ? data.message
              : envelope.verified === true
                ? '已完成'
                : '执行成功',
          data,
        },
      };
    }
  }

  // http_request / 探活类：默认折叠 + transient
  if (
    tool === 'http_request' ||
    (isPlainObject(data) &&
      typeof data.status === 'number' &&
      typeof data.url === 'string' &&
      'headers' in data)
  ) {
    const row = (isPlainObject(data) ? data : {}) as Record<string, unknown>;
    const method = typeof row.method === 'string' ? row.method.toUpperCase() : 'GET';
    const path =
      typeof row.path === 'string'
        ? row.path
        : (() => {
            try {
              const u = new URL(String(row.url ?? ''));
              return u.pathname + u.search;
            } catch {
              return String(row.url ?? '');
            }
          })();
    const short = path.length > 56 ? `${path.slice(0, 55)}…` : path;
    return {
      kind: 'json',
      // 标题栏由 InvocationCard / presentResult 负责；此处仅 payload
      payload: {
        status: row.status,
        ok: row.ok,
        method,
        path: short,
        body: row.body,
      },
      collapsed: true,
      visibility: 'transient',
    };
  }

  // update_plan 带 plan 数组：专用 planning Surface（勿落到 entity JSON）
  if (tool === 'update_plan' && isPlainObject(data) && Array.isArray(data.plan)) {
    const plan = data.plan as Array<{ id?: string; content?: string; status?: string }>;
    const mode = data.mode === 'update' ? 'update' : 'create';
    const completed = plan.filter((p) => p.status === 'completed').length;
    const title =
      mode === 'update'
        ? `更新任务清单 · (${completed}/${plan.length})`
        : `生成任务清单 · ${plan.length}项`;
    return {
      kind: 'planning',
      payload: {
        items: plan.map((p) => ({
          id: p.id,
          label: p.content,
          status: p.status,
        })),
        message: title,
      },
      collapsed: mode === 'update',
      visibility: mode === 'update' ? 'transient' : 'sticky',
    };
  }

  const rows = extractRows(data);
  if (rows) {
    if (rows.length === 0) {
      return {
        kind: 'empty',
        title: '无数据',
        payload: { message: '查询成功，但没有返回记录' },
      };
    }
    return {
      kind: 'table',
      title: `共 ${rows.length} 条`,
      payload: {
        rows: truncateRows(rows),
        total: rows.length,
        truncated: rows.length > MAX_TABLE_ROWS,
      },
      collapsed: rows.length > 8,
    };
  }

  if (isPlainObject(data)) {
    // 嵌套实体：{ found, order } / { entity } 等
    const nested =
      (isPlainObject(data.entity) && data.entity) ||
      (isPlainObject(data.order) && data.order) ||
      (isPlainObject(data.item) && data.item) ||
      (isPlainObject(data.record) && data.record) ||
      null;
    if (nested) {
      return {
        kind: 'entity',
        title: typeof data.id === 'string' ? data.id : tool || '详情',
        payload: pickEntityFields(nested),
        collapsed: false,
      };
    }
    return {
      kind: 'entity',
      title: tool || '结果',
      payload: pickEntityFields(data),
      collapsed: Object.keys(data).length > 12,
    };
  }

  if (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') {
    return {
      kind: 'status',
      title: tool || '结果',
      payload: { message: String(data) },
    };
  }

  return {
    kind: 'json',
    title: tool || '结果',
    payload: data,
    collapsed: true,
  };
}
