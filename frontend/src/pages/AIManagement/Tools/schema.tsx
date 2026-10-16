import type { ProColumns } from '@ant-design/pro-components';
import { Tag } from 'antd';
import { getAdminScopes } from '@/services/EADAF/api/adminScopes';
import { getApiData, isApiSuccess } from '@/utils/apiResponse';
import { EXECUTION_TYPE_OPTIONS } from '../constants';

const executionTypeValueEnum = Object.fromEntries(
  EXECUTION_TYPE_OPTIONS.map((item) => [item.value, { text: item.label }]),
);

export const toolTableColumns: ProColumns<Record<string, any>>[] = [
  { title: '名称', dataIndex: 'name', width: 140 },
  { title: 'Function Name', dataIndex: 'functionName', copyable: true, width: 180 },
  {
    title: 'Scope',
    dataIndex: 'scopeId',
    width: 140,
    valueType: 'select',
    fieldProps: { showSearch: true, optionFilterProp: 'label' },
    request: async () => {
      const response = await getAdminScopes({ page: 1, size: 200, isActive: true });
      if (!isApiSuccess(response)) return [];
      const data = getApiData<{ items: Record<string, any>[] }>(response);
      return (data?.items || []).map((item) => ({
        label: `${item.name} (${item.slug})`,
        value: item.id,
      }));
    },
    render: (_, record) => record.scope?.slug || '-',
  },
  {
    title: '执行类型',
    dataIndex: 'executionType',
    width: 130,
    valueType: 'select',
    valueEnum: executionTypeValueEnum,
    render: (_, record) => <Tag>{record.executionType}</Tag>,
  },
  {
    title: '状态',
    dataIndex: 'isActive',
    width: 90,
    valueType: 'select',
    valueEnum: {
      true: { text: '启用', status: 'Success' },
      false: { text: '停用', status: 'Default' },
    },
  },
  {
    title: '更新时间',
    dataIndex: 'updatedAt',
    valueType: 'dateTime',
    width: 180,
    hideInSearch: true,
  },
];
