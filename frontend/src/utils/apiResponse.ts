type ApiRecord = Record<string, unknown>;

/** 判断 API 请求是否成功（兼容 dataField 解包前后） */
export function isApiSuccess(response: unknown): boolean {
  if (response == null || typeof response !== 'object') {
    return false;
  }
  const res = response as ApiRecord;
  if (typeof res.code === 'number') {
    return res.code >= 200 && res.code < 300;
  }
  // dataField: 'data' 解包后直接返回业务数据
  return true;
}

/** 解析分页列表响应（兼容 dataField 解包前后） */
export function parseApiListResponse<T>(response: unknown): {
  /** ProTable request 需要的行数据字段 */
  data: T[];
  /** 与 data 相同，便于解构后手动映射 */
  items: T[];
  total: number;
  page?: number;
  size?: number;
  success: boolean;
} {
  if (response == null || typeof response !== 'object') {
    return { data: [], items: [], total: 0, success: false };
  }
  const res = response as ApiRecord;
  const payload =
    res.data && typeof res.data === 'object' ? (res.data as ApiRecord) : res;
  const items = (Array.isArray(payload.items) ? payload.items : []) as T[];
  const total = typeof payload.total === 'number' ? payload.total : 0;
  const page = typeof payload.page === 'number' ? payload.page : undefined;
  const size = typeof payload.size === 'number' ? payload.size : undefined;
  return {
    data: items,
    items,
    total,
    page,
    size,
    success: isApiSuccess(response),
  };
}

/** 从 API 响应或异常中取出 message 字段 */
export function getApiErrorMessage(response: unknown, fallback?: string): string {
  if (response == null) {
    return fallback || '请求失败';
  }

  const err = response as {
    info?: { message?: string };
    response?: { data?: ApiRecord | string | null };
    message?: string;
    code?: number;
  };

  // axios / umi 异常：优先使用 response.data.message；OAuth 端点用 error_description
  const responseData = err.response?.data;
  if (responseData && typeof responseData === 'object') {
    const oauthDetail = (responseData as { error_description?: string }).error_description;
    if (typeof oauthDetail === 'string' && oauthDetail.trim()) {
      return oauthDetail;
    }
    const apiMessage = responseData.message;
    if (typeof apiMessage === 'string' && apiMessage.trim()) {
      return apiMessage;
    }
  }

  const fromInfo = err.info?.message;
  if (fromInfo?.trim()) return fromInfo;

  // 完整 API 响应体 { code, message, data }
  if (typeof response === 'object') {
    const res = response as ApiRecord;
    if (typeof res.message === 'string' && res.message.trim()) {
      return res.message;
    }
  }

  if (
    typeof err.message === 'string' &&
    err.message.trim() &&
    !/^Request failed with status code/i.test(err.message)
  ) {
    return err.message;
  }

  return fallback || '请求失败';
}

function stringifyApiDetail(detail: unknown): string {
  if (detail == null) return '';
  if (typeof detail === 'string') return detail;
  try {
    const text = JSON.stringify(detail);
    return text === '{}' || text === 'null' ? '' : text;
  } catch {
    return String(detail);
  }
}

/** 将 axios / 业务异常 enrich 为含 HTTP 状态与 API details 的 message */
export function enrichAxiosError(error: unknown): void {
  if (!error || typeof error !== 'object') return;
  const err = error as {
    message?: string;
    response?: { status?: number; data?: ApiRecord | string | null };
    info?: { code?: number; message?: string; data?: unknown };
  };

  if (err.info?.message?.trim()) {
    const code = err.info.code;
    let text = code ? `[HTTP ${code}] ${err.info.message}` : err.info.message;
    const detail = stringifyApiDetail(err.info.data);
    if (detail) text += ` | ${detail}`;
    err.message = text;
    return;
  }

  const responseData = err.response?.data;
  if (responseData && typeof responseData === 'object') {
    const apiMessage = responseData.message;
    if (typeof apiMessage === 'string' && apiMessage.trim()) {
      const status = err.response?.status;
      let text = status ? `[HTTP ${status}] ${apiMessage}` : apiMessage;
      const detail = stringifyApiDetail(responseData.data);
      if (detail) text += ` | ${detail}`;
      err.message = text;
    }
  }
}

/** 格式化请求异常（含 API message / details） */
export function formatRequestError(error: unknown, fallback = '请求失败'): string {
  enrichAxiosError(error);
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

/** 从 axios / 业务异常中取出 API 响应 data 字段 */
export function getApiResponseData(error: unknown): ApiRecord | undefined {
  if (error == null || typeof error !== 'object') return undefined;
  const err = error as {
    response?: { data?: ApiRecord };
    info?: { data?: unknown };
  };
  const fromResponse = err.response?.data;
  if (fromResponse && typeof fromResponse === 'object') {
    return fromResponse.data != null && typeof fromResponse.data === 'object'
      ? (fromResponse.data as ApiRecord)
      : fromResponse;
  }
  if (err.info?.data != null && typeof err.info.data === 'object') {
    return err.info.data as ApiRecord;
  }
  return undefined;
}

export function getMaterializationTargetLabel(dbType?: string): string {
  if (dbType === 'mongodb') return '数据库';
  if (dbType === 'redis') return 'Key 前缀';
  // MySQL：Schema ≡ 库，界面用语一律叫「库」，避免「Schema（库）」双名
  if (dbType === 'mysql') return '物化目标库';
  return 'Schema';
}

/** 物化目标 Schema/数据库不存在，需用户确认创建 */
export function isTargetNotFoundError(error: unknown): boolean {
  if (error == null || typeof error !== 'object') return false;
  const err = error as { response?: { status?: number }; info?: { code?: number } };
  const status = err.response?.status ?? err.info?.code;
  if (status !== 409) return false;
  const data = getApiResponseData(error);
  return data?.errorCode === 'TARGET_NOT_FOUND';
}

export function getTargetNotFoundPayload(error: unknown): {
  targetSchema?: string;
  dbType?: string;
  connectionId?: string;
} | undefined {
  if (!isTargetNotFoundError(error)) return undefined;
  const data = getApiResponseData(error);
  if (!data) return undefined;
  return {
    targetSchema: typeof data.targetSchema === 'string' ? data.targetSchema : undefined,
    dbType: typeof data.dbType === 'string' ? data.dbType : undefined,
    connectionId: typeof data.connectionId === 'string' ? data.connectionId : undefined,
  };
}

/** 从响应类型推断 data 字段 */
type ApiDataFromResponse<R> = R extends { data?: infer D } ? D : R;

/** 从 API 响应中取出 data 字段（兼容已解包的情况） */
export function getApiData<R>(response: R): ApiDataFromResponse<R> | undefined;
export function getApiData<T>(response: unknown): T | undefined;
export function getApiData<T>(response: unknown): T | undefined {
  if (response == null || typeof response !== 'object') {
    return undefined;
  }
  const res = response as ApiRecord;
  if (res.data !== undefined) {
    return res.data as T;
  }
  return response as T;
}
