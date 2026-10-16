import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { BetaSchemaForm, PageContainer } from '@ant-design/pro-components';
import type { ActionType } from '@ant-design/pro-components';
import { UrlSyncedProTable } from '@/components/UrlSyncedProTable';
import { Button, Drawer, Form } from 'antd';
import { message, modal } from '@/utils/antdAppApis';
import React, { useRef, useState, useMemo } from 'react';
import { useAISurface, useAIChatPrompts, useChatReference } from '@eadaf/ai-base';
import { buildDataStandardPrompts } from '@/ai/pageChatPrompts';
import { TableActionButton, TableActions, TABLE_ACTION_COLUMN_BASE } from '@/components/TableActions';
import { DEFAULT_PRO_TABLE_OPTIONS } from '@/constants/proTable';
import { useProTableSearchCollapse } from '@/hooks/useProTableSearchCollapse';
import {
  deleteBizdataDataStandard,
  getBizdataDataStandards,
  postBizdataDataStandard,
  putBizdataDataStandard,
} from '@/services/EADAF/api/businessData';
import { isApiSuccess, parseApiListResponse } from '@/utils/apiResponse';
import { augmentColumnsWithChatReference } from '@/utils/augmentColumnsWithChatReference';
import { buildDataStandardReference } from '@/ai/chatReferenceBuilders';
import { dataStandardFormColumns, dataStandardTableColumns } from './schema';

const DataStandardsPage: React.FC = () => {
  const actionRef = useRef<ActionType | undefined>(undefined);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<API.BizdataDataStandard | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<API.BizdataDataStandard>();
  const { references } = useChatReference();
  const chatPrompts = useMemo(() => buildDataStandardPrompts(references), [references]);
  useAIChatPrompts(chatPrompts);
  const search = useProTableSearchCollapse('business-data.data-standards');

  useAISurface({
    id: 'bizdata.data-standards',
    domain: 'bizdata',
    label: '数据标准列表',
    read: () => ({ path: '/business_data/data-standards' }),
    refresh: () => actionRef.current?.reload(),
    applyMutation: (mutation) => {
      if (mutation.domain === 'bizdata' && mutation.type.startsWith('data_standard.')) {
        actionRef.current?.reload();
      }
    },
  });

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: 'enabled' });
    setDrawerOpen(true);
  };

  const openEdit = (record: API.BizdataDataStandard) => {
    setEditing(record);
    form.setFieldsValue(record);
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const response = editing?.id
        ? await putBizdataDataStandard(editing.id, values)
        : await postBizdataDataStandard(values);
      if (isApiSuccess(response)) {
        message.success(editing?.id ? '已保存' : '已创建');
        setDrawerOpen(false);
        actionRef.current?.reload();
      } else {
        message.error(response.message || '保存失败');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (record: API.BizdataDataStandard) => {
    modal.confirm({
      title: '确认删除',
      content: `确定删除数据标准「${record.name}」吗？`,
      onOk: async () => {
        if (!record.id) return;
        const response = await deleteBizdataDataStandard(record.id);
        if (isApiSuccess(response)) {
          message.success('已删除');
          actionRef.current?.reload();
        } else {
          message.error(response.message || '删除失败');
        }
      },
    });
  };

  return (
    <PageContainer pageHeaderRender={() => <></>}>
      <UrlSyncedProTable<API.BizdataDataStandard>
        actionRef={actionRef}
        rowKey="id"
        scroll={{ x: 'max-content' }}
        search={search}
        columns={[
          ...augmentColumnsWithChatReference(dataStandardTableColumns, 'name', buildDataStandardReference),
          {
            ...TABLE_ACTION_COLUMN_BASE,
            width: 70,
            render: (_, record) => (
              <TableActions>
                <TableActionButton title="编辑" icon={<EditOutlined />} onClick={() => openEdit(record)} />
                <TableActionButton
                  title="删除"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleDelete(record)}
                />
              </TableActions>
            ),
          },
        ]}
        request={async (params) => {
          const response = await getBizdataDataStandards({
            page: params.current,
            size: params.pageSize,
            keyword: params.keyword as string | undefined,
            status: params.status as string | undefined,
          });
          const { items, total, success } = parseApiListResponse<API.BizdataDataStandard>(response);
          return { data: items, total, success };
        }}
        toolBarRender={() => [
          <Button key="create" type="primary" className="btn-gradient-primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建数据标准
          </Button>,
        ]}
        defaultPageSize={10}
        options={DEFAULT_PRO_TABLE_OPTIONS}
      />

      <Drawer
        title={editing?.id ? '编辑数据标准' : '新建数据标准'}
        width={520}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        destroyOnClose
        extra={
          <Button type="primary" loading={saving} onClick={() => void handleSave()}>
            保存
          </Button>
        }
      >
        <BetaSchemaForm<API.BizdataDataStandard>
          form={form}
          layoutType="Form"
          columns={dataStandardFormColumns}
          submitter={false}
          grid
          rowProps={{ gutter: 16 }}
          colProps={{ span: 24 }}
        />
      </Drawer>
    </PageContainer>
  );
};

export default DataStandardsPage;
