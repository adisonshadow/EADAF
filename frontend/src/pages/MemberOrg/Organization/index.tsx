import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import {
  ActionType,
  PageContainer,
} from '@ant-design/pro-components';
import type { ProColumns, ParamsType } from '@ant-design/pro-components';
import { UrlSyncedProTable } from '@/components/UrlSyncedProTable';
import { useSetState } from "ahooks";
import { Button } from 'antd';
import { message, modal } from '@/utils/antdAppApis';
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAIChatPrompts, useChatReference } from '@eadaf/ai-base';
import { buildDepartmentPrompts } from '@/ai/pageChatPrompts';
import { tableColumns } from "./Schemas";
import { getDepartmentsTree, deleteDepartmentsDepartmentId } from "@/services/EADAF/api/departments";
import { DEFAULT_PRO_TABLE_OPTIONS } from '@/constants/proTable';
import { TableActionButton, TableActions, TABLE_ACTION_COLUMN_BASE } from '@/components/TableActions';
import { augmentColumnsWithChatReference } from '@/utils/augmentColumnsWithChatReference';
import { buildDepartmentReference } from '@/ai/chatReferenceBuilders';
import { useLocation, useNavigate } from 'react-router-dom';
import { useOpenDetail } from '@/hooks/useReturnToList';
import { getApiData, getApiErrorMessage, isApiSuccess } from '@/utils/apiResponse';

interface DepartmentRecord {
  department_id: string;
  name: string;
  parent_id: string;
  created_at: string;
  updated_at: string;
  children?: DepartmentRecord[];
}

interface DepartmentWithChildren extends API.Department {
  children?: DepartmentWithChildren[];
}

const getAllDepartmentIds = (departments: DepartmentWithChildren[]): string[] =>
  departments.reduce((acc: string[], dept: DepartmentWithChildren) => {
    if (dept.department_id) acc.push(dept.department_id);
    if (dept.children?.length) acc.push(...getAllDepartmentIds(dept.children));
    return acc;
  }, []);

const Page: React.FC = () => {
  const navigate = useNavigate();
  const openDetail = useOpenDetail();
  const location = useLocation();
  const actionRef = useRef<ActionType | undefined>(undefined);
  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([]);
  const [highlightedRowId, setHighlightedRowId] = useState<string | null>(null);
  const [isHighlighted, setIsHighlighted] = useState(false);
  const highlightTimerRef = useRef<number | undefined>(undefined);
  const initialExpandDoneRef = useRef(false);
  const { references } = useChatReference();
  const chatPrompts = useMemo(() => buildDepartmentPrompts(references), [references]);
  useAIChatPrompts(chatPrompts);

  const [state] = useSetState({
    tableColumns: augmentColumnsWithChatReference(
      [
        ...tableColumns,
        {
          ...TABLE_ACTION_COLUMN_BASE,
          dataIndex: "option",
          width: 70,
          render: (_: unknown, record: DepartmentRecord) => (
            <TableActions>
              <TableActionButton
                title="编辑"
                key="edit"
                icon={<EditOutlined />}
                onClick={() =>
                  openDetail(`/member_org/organization/${record.department_id}/edit`)
                }
              />
              <TableActionButton
                title="删除"
                key="delete"
                danger
                icon={<DeleteOutlined />}
                onClick={() => {
                  modal.confirm({
                    title: '确认删除',
                    content: '确定要删除该部门吗？',
                    onOk: async () => {
                      try {
                        const response = await deleteDepartmentsDepartmentId({
                          department_id: record.department_id,
                        });
                        if (response.code && response.code >= 200 && response.code < 300) {
                          message.success('删除部门成功');
                          initialExpandDoneRef.current = false;
                          actionRef.current?.reload();
                        } else {
                          message.error(response.message || '删除失败');
                        }
                      } catch (error: unknown) {
                        message.error(getApiErrorMessage(error, '删除失败'));
                      }
                    },
                  });
                }}
              />
            </TableActions>
          ),
        },
      ],
      'name',
      buildDepartmentReference,
    ),
  });

  const { tableColumns: actionColumns } = state;

  useEffect(() => {
    const highlight = new URLSearchParams(location.search).get('highlight');
    if (highlight) {
      setHighlightedRowId(highlight);
      const nextSearch = new URLSearchParams(location.search);
      nextSearch.delete('highlight');
      navigate(
        { pathname: location.pathname, search: nextSearch.toString() },
        { replace: true },
      );
    }
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!highlightedRowId) return;

    let count = 0;
    const maxCount = 6;

    const blink = () => {
      if (count >= maxCount) {
        setHighlightedRowId(null);
        setIsHighlighted(false);
        return;
      }
      setIsHighlighted((prev) => !prev);
      count += 1;
      highlightTimerRef.current = window.setTimeout(blink, 500);
    };

    blink();

    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, [highlightedRowId]);

  /** 按关键词过滤部门树（保留命中节点的祖先链） */
  const filterDepartmentTree = (
    nodes: DepartmentWithChildren[],
    keyword?: string,
  ): DepartmentWithChildren[] => {
    if (!keyword) return nodes;
    const lower = keyword.toLowerCase();
    const walk = (list: DepartmentWithChildren[]): DepartmentWithChildren[] => {
      const result: DepartmentWithChildren[] = [];
      list.forEach((node) => {
        const children = node.children?.length ? walk(node.children) : [];
        const nameMatch = (node.name || '').toLowerCase().includes(lower);
        const codeMatch = (node.code || '').toLowerCase().includes(lower);
        if (nameMatch || codeMatch || children.length) {
          result.push({ ...node, children: children.length ? children : undefined });
        }
      });
      return result;
    };
    return walk(nodes);
  };

  const loadDepartments = useCallback(async (params: ParamsType) => {
    try {
      const response = await getDepartmentsTree();
      if (!isApiSuccess(response)) {
        message.error(getApiErrorMessage(response, '获取部门列表失败'));
        return { data: [], success: false };
      }

      const data = getApiData<{ items?: DepartmentWithChildren[] }>(response);
      let items = data?.items ?? [];

      // ProTable 内置 search 过滤：部门名称
      const keyword = (params?.name as string | undefined)?.trim().toLowerCase();
      if (keyword) {
        items = filterDepartmentTree(items, keyword);
      }

      if (!initialExpandDoneRef.current && items.length > 0) {
        initialExpandDoneRef.current = true;
        setExpandedRowKeys(getAllDepartmentIds(items));
      }

      return {
        data: items,
        success: true,
      };
    } catch (error) {
      message.error(getApiErrorMessage(error, '获取部门列表失败'));
      return { data: [], success: false };
    }
  }, []);

  const proTableColumns = useMemo((): ProColumns<DepartmentWithChildren>[] => {
    const nameColumn: ProColumns<DepartmentWithChildren> = {
      title: '部门名称',
      dataIndex: 'name',
      width: 240,
    };

    return [
      nameColumn,
      ...actionColumns.filter((col) => col.dataIndex !== 'name'),
    ] as ProColumns<DepartmentWithChildren>[];
  }, [actionColumns]);

  return (
    <>
      <PageContainer pageHeaderRender={() => <></>}>
        <UrlSyncedProTable<DepartmentWithChildren>
          engine="nuqs"
          urlFilterKeys={['name']}
          syncPagination={false}
          defaultSize="small"
          actionRef={actionRef}
          rowKey="department_id"
          scroll={{ x: 'max-content' }}
          onRow={(record) => ({
            id: `department-row-${record.department_id}`,
            style: {
              backgroundColor:
                highlightedRowId === record.department_id && isHighlighted
                  ? '#fffbe6'
                  : undefined,
              transition: 'background-color 0.3s',
            },
          })}
          headerTitle="组织架构管理"
          search={{
            labelWidth: 'auto',
            defaultCollapsed: false,
          }}
          columns={proTableColumns}
          toolBarRender={() => [
            <Button
              type="primary" className="btn-gradient-primary"
              key="create"
              icon={<PlusOutlined />}
              onClick={() => navigate('/member_org/organization/create')}
            >
              新建
            </Button>,
          ]}
          request={loadDepartments}
          pagination={false}
          options={DEFAULT_PRO_TABLE_OPTIONS}
          expandable={{
            expandedRowKeys,
            onExpandedRowsChange: (expandedRows) => {
              setExpandedRowKeys(expandedRows as string[]);
            },
            childrenColumnName: 'children',
            indentSize: 20,
          }}
        />
      </PageContainer>
    </>
  );
};

export default Page;
