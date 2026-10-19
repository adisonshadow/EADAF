import type {
  ActionType,
  ParamsType,
  ProColumns,
  ProFormInstance,
  ProTableProps,
} from '@ant-design/pro-components';
import type { SingleParserBuilder } from 'nuqs';
import type { TablePaginationPlacement } from 'antd/es/table/interface';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { UnifiedProTable } from '@/components/UnifiedProTable';
import { useProTableUrlState } from '@/hooks/useProTableUrlState';
import { URL_PAGE_KEY, URL_PAGE_SIZE_KEY } from '@/hooks/useUrlQueryState';
import {
  DEFAULT_RESERVED_URL_KEYS,
  applyTableStateToSearchParams,
  searchParamsToTableState,
} from '@/utils/tableUrlHelper';
import type { TableUrlKeys } from '@/utils/tableUrlState/keys';
import { stringArrayParser } from '@/utils/tableUrlState/parsers';
import type { ProTableSearchObjectConfig } from '@/types/proTableSearch';

type UrlSyncedProTableExtraProps = {
  defaultPageSize?: number;
  urlPageKey?: string;
  urlPageSizeKey?: string;
  /** 为 false 时不读写 URL（如 Drawer / Modal 内表格） */
  syncUrl?: boolean;
  /**
   * 同步到 URL 的筛选字段；不传则同步搜索表单中除 reserved（page/pageSize/scope）外的全部字段。
   * 传空数组则只同步分页。
   */
  urlFilterKeys?: string[];
  /** 需要从 URL 按逗号还原为数组的字段 */
  urlArrayKeys?: string[];
  /**
   * 引擎选择（方案 6.8 灰度策略）：
   * - 'legacy'（默认）：现有基于 useSearchParams + ref 守卫的实现；
   * - 'nuqs'：新引擎，URL 驱动（useProTableUrlState），无 5-ref 守卫。
   * 批量切换前请逐页验证。
   */
  engine?: 'legacy' | 'nuqs';
  /** [nuqs] 显式筛选 parser 覆盖（键 → parser），优先级高于 columns 推断 */
  urlParsers?: Record<string, SingleParserBuilder<any>>;
  /** [nuqs] 分页/排序键名覆盖（多实例） */
  urlKeys?: TableUrlKeys;
  /** [nuqs] 多实例前缀（ASCII），与 urlKeys 二选一 */
  prefix?: string;
  /** [nuqs] 是否启用 URL 排序（opt-in，仅对声明了排序需求的表格开启） */
  sortable?: boolean;
  /** [nuqs] 树表等无分页场景传 false：只同步筛选 */
  syncPagination?: boolean;
  /** 搜索区配置（与 useProTableSearchCollapse 返回类型一致） */
  search?: ProTableSearchObjectConfig | false;
};

export type UrlSyncedProTableProps<
  T extends Record<string, any>,
  U extends ParamsType = ParamsType,
  ValueType = 'text',
> = {
  [K in keyof ProTableProps<T, U, ValueType> as K extends 'search'
    ? never
    : K]: ProTableProps<T, U, ValueType>[K];
} & UrlSyncedProTableExtraProps;

const DEFAULT_PAGINATION_PLACEMENT: TablePaginationPlacement[] = ['bottomStart'];

function assignRef<T>(
  target: React.MutableRefObject<T | undefined> | ((instance: T | undefined) => void) | undefined,
  instance: T | undefined,
) {
  if (!target) return;
  if (typeof target === 'function') target(instance);
  else target.current = instance;
}

/* ============================== legacy 引擎（保留） ============================== */

function LegacyUrlSyncedProTable<
  T extends Record<string, any>,
  U extends ParamsType = ParamsType,
  ValueType = 'text',
>(props: UrlSyncedProTableProps<T, U, ValueType>) {
  const {
    defaultPageSize = 10,
    urlPageKey = URL_PAGE_KEY,
    urlPageSizeKey = URL_PAGE_SIZE_KEY,
    syncUrl = true,
    urlFilterKeys,
    urlArrayKeys,
    pagination,
    request,
    actionRef,
    params,
    form,
    formRef: formRefProp,
    onSubmit,
    onReset,
    onChange,
    ...rest
  } = props;

  const [searchParams, setSearchParams] = useSearchParams();
  const internalActionRef = useRef<ActionType | undefined>(undefined);
  const internalFormRef = useRef<ProFormInstance | undefined>(undefined);
  /** URL 驱动翻页/reload 期间，忽略 ProTable 误发的 onChange(1) 回写 */
  const urlPaginationGuardRef = useRef<number | null>(null);
  const skipInitialReloadRef = useRef(true);
  const prevUrlPageRef = useRef<{ page: number; pageSize: number } | null>(null);
  /** 同步页码：用户点击时立即更新，供 request 读取（不依赖尚未完成的 URL 写入） */
  const pageRef = useRef(1);
  const pageSizeRef = useRef(defaultPageSize);

  const resolvedDefaultPageSize =
    typeof pagination === 'object' && pagination?.pageSize
      ? Number(pagination.pageSize)
      : defaultPageSize;

  const helperOptions = useMemo(
    () => ({
      pageKey: urlPageKey,
      pageSizeKey: urlPageSizeKey,
      filterKeys: urlFilterKeys,
      arrayKeys: urlArrayKeys,
      reservedKeys: [...DEFAULT_RESERVED_URL_KEYS],
      defaultPageSize: resolvedDefaultPageSize,
    }),
    [resolvedDefaultPageSize, urlArrayKeys, urlFilterKeys, urlPageKey, urlPageSizeKey],
  );

  const { pagination: urlPagination, formValues: urlFormValues } = useMemo(() => {
    if (!syncUrl) {
      return {
        pagination: { current: 1, pageSize: resolvedDefaultPageSize },
        formValues: {} as Record<string, unknown>,
      };
    }
    return searchParamsToTableState(searchParams, helperOptions);
  }, [helperOptions, resolvedDefaultPageSize, searchParams, syncUrl]);

  const page = urlPagination.current;
  const pageSize = urlPagination.pageSize;
  pageRef.current = page;
  pageSizeRef.current = pageSize;

  const syncTableToUrl = useCallback(
    (vals: Record<string, unknown>, nextPage: number, nextPageSize: number) => {
      if (!syncUrl) return;
      setSearchParams(
        (prev) => {
          const next = applyTableStateToSearchParams(
            prev,
            vals,
            { current: nextPage, pageSize: nextPageSize },
            helperOptions,
          );
          if (next.toString() === prev.toString()) return prev;
          return next;
        },
        { replace: true },
      );
    },
    [helperOptions, setSearchParams, syncUrl],
  );

  const readFormValues = useCallback((): Record<string, unknown> => {
    const fromForm = internalFormRef.current?.getFieldsValue?.() as Record<string, unknown> | undefined;
    if (fromForm && Object.keys(fromForm).length) return fromForm;
    return urlFormValues;
  }, [urlFormValues]);

  const handlePaginationChange = useCallback(
    (nextPage: number, nextPageSize: number) => {
      const guard = urlPaginationGuardRef.current;
      // reload / params 重置期间 ProTable 常误发 current=1，勿写回 URL
      if (guard != null && nextPage !== guard) {
        return;
      }
      if (nextPage === page && nextPageSize === pageSize) {
        return;
      }
      // 立即同步，保证紧随其后的 request 用到新页码
      pageRef.current = nextPage;
      pageSizeRef.current = nextPageSize;
      urlPaginationGuardRef.current = nextPage;
      syncTableToUrl(readFormValues(), nextPage, nextPageSize);
      window.setTimeout(() => {
        if (urlPaginationGuardRef.current === nextPage) {
          urlPaginationGuardRef.current = null;
        }
      }, 400);
    },
    [page, pageSize, readFormValues, syncTableToUrl],
  );

  // URL 回填搜索表单（刷新 / 前进后退）
  useEffect(() => {
    if (!syncUrl) return;
    const formInst = internalFormRef.current;
    if (!formInst?.setFieldsValue) return;
    formInst.setFieldsValue(urlFormValues);
  }, [syncUrl, urlFormValues]);

  // URL 页码变化（含前进/后退）时 reload；切勿把 page 放进 params（会触发 ProTable 重置到第 1 页）
  useEffect(() => {
    if (!syncUrl || !request) return;

    if (skipInitialReloadRef.current) {
      skipInitialReloadRef.current = false;
      prevUrlPageRef.current = { page, pageSize };
      return;
    }

    const prev = prevUrlPageRef.current;
    if (prev && prev.page === page && prev.pageSize === pageSize) return;
    prevUrlPageRef.current = { page, pageSize };

    urlPaginationGuardRef.current = page;
    internalActionRef.current?.reload?.();
    const timer = window.setTimeout(() => {
      if (urlPaginationGuardRef.current === page) {
        urlPaginationGuardRef.current = null;
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [page, pageSize, request, syncUrl]);

  const mergedPagination = useMemo(() => {
    if (pagination === false) return false;
    const base = typeof pagination === 'object' ? pagination : {};
    if (!syncUrl) {
      return {
        defaultPageSize: resolvedDefaultPageSize,
        showSizeChanger: true,
        placement: DEFAULT_PAGINATION_PLACEMENT,
        ...base,
      };
    }
    // 受控：current / pageSize 仅来自 URL；页码写入只走 onChange
    return {
      showSizeChanger: true,
      placement: DEFAULT_PAGINATION_PLACEMENT,
      ...base,
      current: page,
      pageSize,
      onChange: (nextPage: number, nextPageSize: number) => {
        handlePaginationChange(nextPage, nextPageSize);
        base.onChange?.(nextPage, nextPageSize);
      },
    };
  }, [handlePaginationChange, page, pageSize, pagination, resolvedDefaultPageSize, syncUrl]);

  // params 只放筛选，绝不放页码（ProTable：params 变化 → 重置到第 1 页）
  const mergedParams = useMemo(() => {
    if (!syncUrl) return params;
    return {
      ...urlFormValues,
      ...params,
    } as unknown as U;
  }, [params, syncUrl, urlFormValues]);

  const wrappedRequest = useMemo(() => {
    if (!request) return undefined;
    if (!syncUrl) return request;
    return async (requestParams: U, sort: Record<string, any>, filter: Record<string, any>) => {
      const raw = requestParams as Record<string, unknown>;
      const cleaned: Record<string, unknown> = {};
      Object.entries(raw).forEach(([key, value]) => {
        if (key.startsWith('_')) return;
        cleaned[key] = value;
      });
      // URL / 同步 pageRef 为权威页码（避免 reload 时 ProTable 仍传 current=1）
      return request(
        {
          ...cleaned,
          ...urlFormValues,
          current: pageRef.current,
          pageSize: pageSizeRef.current,
        } as unknown as U,
        sort,
        filter,
      );
    };
  }, [request, syncUrl, urlFormValues]);

  const handleSubmit = useCallback(
    (values: U) => {
      if (syncUrl) {
        pageRef.current = 1;
        urlPaginationGuardRef.current = 1;
        syncTableToUrl(values as Record<string, unknown>, 1, pageSize);
        window.setTimeout(() => {
          if (urlPaginationGuardRef.current === 1) urlPaginationGuardRef.current = null;
        }, 400);
      }
      onSubmit?.(values);
    },
    [onSubmit, pageSize, syncTableToUrl, syncUrl],
  );

  const handleReset = useCallback(() => {
    if (syncUrl) {
      pageRef.current = 1;
      urlPaginationGuardRef.current = 1;
      syncTableToUrl({}, 1, pageSize);
      window.setTimeout(() => {
        if (urlPaginationGuardRef.current === 1) urlPaginationGuardRef.current = null;
      }, 400);
    }
    onReset?.();
  }, [onReset, pageSize, syncTableToUrl, syncUrl]);

  const handleTableChange = useCallback(
    (pag: any, filters: any, sorter: any, extra: any) => {
      onChange?.(pag, filters, sorter, extra);
    },
    [onChange],
  );

  const mergedForm = useMemo(() => {
    if (!syncUrl) return form;
    return {
      ...form,
      initialValues: {
        ...urlFormValues,
        ...(typeof form === 'object' ? form?.initialValues : undefined),
      },
    };
  }, [form, syncUrl, urlFormValues]);

  const setFormRef = useCallback(
    (instance: ProFormInstance | undefined) => {
      internalFormRef.current = instance;
      assignRef(formRefProp as any, instance);
    },
    [formRefProp],
  );

  const setActionRef = useCallback(
    (instance: ActionType | undefined) => {
      internalActionRef.current = instance;
      assignRef(actionRef as any, instance);
    },
    [actionRef],
  );

  return (
    <UnifiedProTable<T, U, ValueType>
      {...rest}
      actionRef={setActionRef as any}
      formRef={setFormRef as any}
      form={mergedForm}
      request={wrappedRequest}
      pagination={mergedPagination}
      params={mergedParams}
      onSubmit={handleSubmit}
      onReset={handleReset}
      onChange={handleTableChange}
    />
  );
}

/* ============================== nuqs 引擎（v2） ============================== */

/** 过滤空值后的筛选值（与 useProTableUrlState 的 filterValues 口径一致） */
function pickNonEmpty(values: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  keys.forEach((key) => {
    const value = values[key];
    const empty =
      value === undefined ||
      value === null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0);
    if (!empty) result[key] = value;
  });
  return result;
}

/** 稳定签名：dayjs 等对象转为可比较字符串（避免对象引用抖动） */
function stableSignature(value: unknown): string {
  if (value && typeof value === 'object' && 'toISOString' in value && typeof (value as any).toISOString === 'function') {
    return (value as any).toISOString();
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableSignature).join(',')}]`;
  }
  return JSON.stringify(value);
}

function filtersSignature(values: Record<string, unknown>): string {
  return Object.keys(values)
    .sort()
    .map((key) => `${key}=${stableSignature(values[key])}`)
    .join('&');
}

function NuqsUrlSyncedProTable<
  T extends Record<string, any>,
  U extends ParamsType = ParamsType,
  ValueType = 'text',
>(props: UrlSyncedProTableProps<T, U, ValueType>) {
  const {
    defaultPageSize = 10,
    syncUrl = true,
    urlFilterKeys,
    urlArrayKeys,
    urlParsers,
    urlKeys,
    prefix,
    sortable = false,
    syncPagination = true,
    pagination,
    request,
    actionRef,
    params,
    form,
    formRef: formRefProp,
    onSubmit,
    onReset,
    onChange,
    manualRequest: userManualRequest,
    columns,
    search,
    ...rest
  } = props;

  const resolvedDefaultPageSize =
    typeof pagination === 'object' && pagination?.pageSize
      ? Number(pagination.pageSize)
      : defaultPageSize;

  const effectiveSyncPagination = syncPagination && pagination !== false;

  /** urlArrayKeys 兼容：强制按逗号数组解析（优先级高于 columns 推断，低于 urlParsers） */
  const mergedParsers = useMemo(() => {
    if (!urlArrayKeys?.length) return urlParsers;
    const extra: Record<string, SingleParserBuilder<any>> = { ...urlParsers };
    urlArrayKeys.forEach((key) => {
      if (!extra[key]) extra[key] = stringArrayParser;
    });
    return extra;
  }, [urlArrayKeys, urlParsers]);

  const urlState = useProTableUrlState({
    filterKeys: urlFilterKeys,
    parsers: mergedParsers,
    columns: columns as ProColumns<any>[] | undefined,
    urlKeys,
    prefix,
    defaultPageSize: resolvedDefaultPageSize,
    syncPagination: effectiveSyncPagination,
    sortable,
    syncUrl,
  });

  const {
    page,
    pageSize,
    filterValues,
    sort,
    setPagination,
    setFilters,
    resetFilters,
    setSort,
    clearSort,
  } = urlState;

  const internalActionRef = useRef<ActionType | undefined>(undefined);
  const internalFormRef = useRef<ProFormInstance | undefined>(undefined);
  /** 页面显式传 manualRequest：完全手动，胶水层不编排请求 */
  const manualMode = userManualRequest !== undefined;
  /** 权威页码：用户点击时立即更新，供 request 读取（不等 URL 写入） */
  const pageRef = useRef(page);
  const pageSizeRef = useRef(pageSize);
  pageRef.current = page;
  pageSizeRef.current = pageSize;

  const requestRef = useRef(request);
  requestRef.current = request;
  const hasRequest = Boolean(request);
  const filterValuesRef = useRef(filterValues);
  filterValuesRef.current = filterValues;

  const requestSeqRef = useRef(0);

  const filterKey = filtersSignature(filterValues);
  const sortKey = sort ? `${sort.field}:${sort.order}` : '';

  // 表单就绪：立即回填 URL 筛选（URL 直达/前进后退恢复）
  const setFormRef = useCallback(
    (instance: ProFormInstance | undefined) => {
      internalFormRef.current = instance;
      assignRef(formRefProp as any, instance);
      const currentFilters = filterValuesRef.current;
      if (instance?.setFieldsValue && syncUrl && Object.keys(currentFilters).length) {
        instance.setFieldsValue(currentFilters);
      }
    },
    [formRefProp, syncUrl],
  );

  // 回填：筛选值变化时（URL 变化 → 表单同步）
  useEffect(() => {
    if (!syncUrl) return;
    const formInst = internalFormRef.current;
    if (formInst?.setFieldsValue && Object.keys(filterValues).length) {
      formInst.setFieldsValue(filterValues);
    }
  }, [filterValues, syncUrl]);

  /**
   * 请求编排（URL 驱动一切）：
   * - 挂载：reload 一次（URL 有状态 → 正确参数首屏；URL 空 → 默认首屏；
   *   search=false 时靠 internal manualRequest 抑制 ProTable 挂载默认请求）；
   * - page/pageSize/filterKey/sortKey 任一变化（提交/翻页/排序/前进后退/URL 直达）→ reload。
   * 说明：ProTable 表单提交时内部先发请求，但此时 pageRef 尚未同步（onSubmit 在
   * 内部处理之后调用）且受控分页下 pageInfo 非受控，请求参数不可靠；统一由本 effect
   * 以 URL 权威状态 reload（内部先发请求会被 abort，竞态由 request 序号防护）。
   *
   * 不要把页面传入的 `request` 放进依赖：树表等页面常在 request 内 setState
   *（loading / expandedRowKeys），内联 request 每次 render 都是新引用，会立刻
   * 再次 reload，形成请求风暴。
   */
  useEffect(() => {
    if (!syncUrl || !hasRequest || manualMode) return;
    internalActionRef.current?.reload?.();
  }, [filterKey, page, pageSize, sortKey, syncUrl, manualMode, hasRequest]);

  const mergedPagination = useMemo(() => {
    if (pagination === false) return false;
    const base = typeof pagination === 'object' ? pagination : {};
    if (!syncUrl || !effectiveSyncPagination) {
      return {
        defaultPageSize: resolvedDefaultPageSize,
        showSizeChanger: true,
        placement: DEFAULT_PAGINATION_PLACEMENT,
        ...base,
      };
    }
    // 受控：current / pageSize 来自 URL；翻页 onChange 写 URL，由 URL effect 驱动 reload
    return {
      showSizeChanger: true,
      placement: DEFAULT_PAGINATION_PLACEMENT,
      ...base,
      current: page,
      pageSize,
      onChange: (nextPage: number, nextPageSize: number) => {
        pageRef.current = nextPage;
        pageSizeRef.current = nextPageSize;
        setPagination(nextPage, nextPageSize);
        base.onChange?.(nextPage, nextPageSize);
      },
    };
  }, [
    effectiveSyncPagination,
    page,
    pageSize,
    pagination,
    resolvedDefaultPageSize,
    setPagination,
    syncUrl,
  ]);

  // params 原样透传：**禁止**把动态 URL 状态塞进 params（params 变化 → 重置第 1 页）
  const mergedParams = useMemo(() => params, [params]);

  const wrappedRequest = useMemo(() => {
    if (!hasRequest) return undefined;
    if (!syncUrl) {
      return ((params: U, sortParams: Record<string, any>, filterParams: Record<string, any>) =>
        requestRef.current!(params, sortParams, filterParams));
    }
    return async (requestParams: U, sortParams: Record<string, any>, filterParams: Record<string, any>) => {
      const seq = ++requestSeqRef.current;
      const currentRequest = requestRef.current;
      if (!currentRequest) {
        return { data: [], success: false } as unknown as Awaited<ReturnType<NonNullable<typeof request>>>;
      }
      // URL 筛选为权威：合并进请求参数（表单提交的内部请求可能晚于 URL 更新）
      // 页码以 URL 权威 pageRef 为准（避免 reload 时 ProTable 传旧值）
      const result = await currentRequest(
        {
          ...(requestParams as Record<string, unknown>),
          ...filterValuesRef.current,
          current: pageRef.current,
          pageSize: pageSizeRef.current,
        } as unknown as U,
        sortParams,
        filterParams,
      );
      if (seq !== requestSeqRef.current) {
        // 过期响应（快速连点/前进后退竞态）：丢弃
        return { data: [], success: false } as unknown as Awaited<ReturnType<NonNullable<typeof request>>>;
      }
      return result;
    };
  }, [hasRequest, syncUrl]);

  const handleSubmit = useCallback(
    (values: U) => {
      pageRef.current = 1;
      setFilters(values as Record<string, unknown>, { resetPage: true });
      onSubmit?.(values);
    },
    [onSubmit, setFilters],
  );

  const handleReset = useCallback(() => {
    pageRef.current = 1;
    resetFilters();
    onReset?.();
  }, [onReset, resetFilters]);

  const handleTableChange = useCallback(
    (pag: any, filters: any, sorter: any, extra: any) => {
      if (sortable && extra?.action === 'sort') {
        const s = Array.isArray(sorter) ? sorter[0] : sorter;
        if (s?.field && s.order) {
          setSort(String(s.field), s.order === 'ascend' ? 'asc' : 'desc');
        } else {
          clearSort();
        }
      }
      onChange?.(pag, filters, sorter, extra);
    },
    [clearSort, onChange, setSort, sortable],
  );

  const mergedForm = useMemo(() => {
    if (!syncUrl) return form;
    return {
      ...form,
      initialValues: {
        ...filterValues,
        ...(typeof form === 'object' ? form?.initialValues : undefined),
      },
    };
  }, [filterValues, form, syncUrl]);

  // 受控排序恢复（opt-in）：仅为启用 URL 排序的列注入 sortOrder
  const mergedColumns = useMemo(() => {
    if (!sortable || !sort || !columns) return columns;
    return columns.map((col) =>
      typeof col.dataIndex === 'string' && col.dataIndex === sort.field
        ? { ...col, sortOrder: sort.order === 'asc' ? ('ascend' as const) : ('descend' as const) }
        : col,
    );
  }, [columns, sort, sortable]);

  const setActionRef = useCallback(
    (instance: ActionType | undefined) => {
      internalActionRef.current = instance;
      assignRef(actionRef as any, instance);
    },
    [actionRef],
  );

  // search=false 时抑制 ProTable 挂载默认请求（由首轮 reload 统一控制）
  const internalManualRequest =
    manualMode
      ? userManualRequest
      : Boolean(request && syncUrl && search === false) || undefined;

  return (
    <UnifiedProTable<T, U, ValueType>
      {...rest}
      columns={mergedColumns}
      search={search}
      actionRef={setActionRef as any}
      formRef={setFormRef as any}
      form={mergedForm}
      request={wrappedRequest}
      pagination={mergedPagination}
      params={mergedParams}
      manualRequest={internalManualRequest}
      onSubmit={handleSubmit}
      onReset={handleReset}
      onChange={handleTableChange}
    />
  );
}

/* ============================== 主分发组件 ============================== */

export function UrlSyncedProTable<
  T extends Record<string, any>,
  U extends ParamsType = ParamsType,
  ValueType = 'text',
>(props: UrlSyncedProTableProps<T, U, ValueType>) {
  const { engine = 'legacy', ...rest } = props;
  if (engine === 'nuqs') {
    return <NuqsUrlSyncedProTable<T, U, ValueType> {...rest} />;
  }
  return <LegacyUrlSyncedProTable<T, U, ValueType> {...rest} />;
}

export default UrlSyncedProTable;
