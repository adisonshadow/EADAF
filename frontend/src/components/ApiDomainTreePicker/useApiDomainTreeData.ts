import { useCallback, useEffect, useMemo, useState } from 'react';
import { getApiServices, getApiServiceTree } from '@/services/EADAF/api/apiServices';
import { getApiData, isApiSuccess } from '@/utils/apiResponse';
import {
  attachApiServicesToDomainTree,
  buildApiServiceDomainTree,
  collectDomainCodes,
  type ApiServiceDomainTreeItem,
  type ApiServiceListItem,
} from '@/utils/buildApiServiceDomainTree';
import type { UseApiDomainTreeDataOptions, UseApiDomainTreeDataResult } from './types';

function mapApiService(item: API.ApiService): ApiServiceListItem {
  const apiUrl = item.basePath || (item.routePath ? `/api/v1/data/${item.routePath}` : undefined);
  return {
    id: item.id!,
    code: item.code!,
    name: item.name,
    status: item.status,
    version: item.version,
    transportProtocols: item.transportProtocols,
    entityCode: item.entityCode,
    routePath: item.routePath,
    apiUrl,
    tags: item.tags,
  };
}

/** 加载 API 域树（及可选 API 服务列表），供选择器初始化 */
export function useApiDomainTreeData(
  options: UseApiDomainTreeDataOptions = {},
): UseApiDomainTreeDataResult {
  const { showApiSelectable = false, enabled = true } = options;
  const [domainTree, setDomainTree] = useState<ApiServiceDomainTreeItem[]>([]);
  const [services, setServices] = useState<ApiServiceListItem[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const [treeRes, listRes] = await Promise.all([
        getApiServiceTree(),
        getApiServices({ size: -1 }),
      ]);

      let items: ApiServiceListItem[] = [];
      if (listRes && isApiSuccess(listRes)) {
        const listData = getApiData<API.ApiServiceListResult>(listRes);
        items = listData?.items?.map(mapApiService) || [];
        setServices(items);
      }

      const treeData = getApiData<ApiServiceDomainTreeItem[]>(treeRes);
      if (isApiSuccess(treeRes) && Array.isArray(treeData) && treeData.length) {
        setDomainTree(
          treeData.map((node) => ({
            code: String(node.code || ''),
            name: String(node.name || node.code || ''),
            isDomainNode: node.isDomainNode !== false,
            serviceCount: node.serviceCount,
            children: node.children as ApiServiceDomainTreeItem[] | undefined,
          })),
        );
      } else {
        setDomainTree(buildApiServiceDomainTree(items));
      }
    } finally {
      setLoading(false);
    }
  }, [enabled, showApiSelectable]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const treeData = useMemo(() => {
    if (!showApiSelectable) return domainTree;
    return attachApiServicesToDomainTree(domainTree, services);
  }, [domainTree, services, showApiSelectable]);

  const domainCodes = useMemo(() => collectDomainCodes(domainTree), [domainTree]);

  return { treeData, services, domainCodes, loading, reload };
}
