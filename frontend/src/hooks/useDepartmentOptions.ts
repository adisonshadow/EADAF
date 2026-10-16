import { useEffect, useMemo, useState } from 'react';
import { getDepartmentsTree } from '@/services/EADAF/api/departments';
import type { DepartmentTreeOption } from '@/providers/InitialStateProvider';
import { getApiData, isApiSuccess } from '@/utils/apiResponse';

/** 部门树 → Cascader options（value / label / children） */
export function toDepartmentCascaderOptions(
  items: API.DepartmentTreeItem[] = [],
): DepartmentTreeOption[] {
  return items.map((item) => ({
    value: String(item.department_id || ''),
    label: String(item.name || ''),
    disabled: item.status !== 'ACTIVE',
    children: item.children?.length
      ? toDepartmentCascaderOptions(item.children)
      : undefined,
  }));
}

/** 原始部门树（department_id / name / children），供 TreeSelect 等使用 */
export const useDepartmentOptions = () => {
  const [departmentTree, setDepartmentTree] = useState<API.DepartmentTreeItem[]>([]);

  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const response = await getDepartmentsTree();
        if (!isApiSuccess(response)) return;
        const data = getApiData<{ items?: API.DepartmentTreeItem[] }>(response);
        if (data?.items) {
          setDepartmentTree(data.items);
        }
      } catch (error) {
        console.error('获取部门树失败:', error);
      }
    };

    void fetchDepartments();
  }, []);

  return departmentTree;
};

/** Cascader 格式的部门选项，供成员表单「所属部门」使用 */
export const useDepartmentCascaderOptions = () => {
  const departmentTree = useDepartmentOptions();
  return useMemo(
    () => toDepartmentCascaderOptions(departmentTree),
    [departmentTree],
  );
};
