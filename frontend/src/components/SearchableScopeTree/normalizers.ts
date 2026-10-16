import type { ScopeTreeNode } from './index';
import type { ApiServiceDomainTreeItem } from '@/utils/buildApiServiceDomainTree';
import type { BuiltinApiTreeNode } from '@/services/EADAF/api/builtinApis';

/**
 * 业务 API 域树（{ name, isApiNode, code, serviceCount, children }）
 * → 统一 ScopeTreeNode。
 */
export function fromApiDomainTree(items: ApiServiceDomainTreeItem[]): ScopeTreeNode[] {
  return items.map((item) => {
    const isLeaf = !!item.isApiNode || !item.children?.length;
    return {
      key: item.code,
      title: item.name || item.code,
      isLeaf,
      subTitle: item.isApiNode ? item.code : undefined,
      count: item.serviceCount,
      children: item.children?.length ? fromApiDomainTree(item.children) : undefined,
    };
  });
}

/**
 * 内置 API 树（admin 端：{ code, label, isLeaf, children }）
 * → 统一 ScopeTreeNode。
 */
export function fromBuiltinApiTree(nodes: BuiltinApiTreeNode[]): ScopeTreeNode[] {
  return nodes.map((node) => ({
    key: node.code,
    title: node.label || node.code,
    isLeaf: node.isLeaf === true,
    subTitle: node.isLeaf ? node.code : undefined,
    children: node.children?.length ? fromBuiltinApiTree(node.children) : undefined,
  }));
}
