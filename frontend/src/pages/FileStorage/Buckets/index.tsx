import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import {
  ActionType,
  ModalForm,
  PageContainer,
  ProColumns,
  ProFormRadio,
  ProFormSelect,
  ProFormText,
  ProFormTextArea,
} from '@ant-design/pro-components';
import { UrlSyncedProTable } from '@/components/UrlSyncedProTable';
import { Button, Checkbox, Form, Select, Space, Tag } from 'antd';
import { message, modal } from '@/utils/antdAppApis';
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useAIChatPrompts, useChatReference } from '@eadaf/ai-base';
import { buildStorageBucketPrompts } from '@/ai/pageChatPrompts';
import { BizdataScopePickerModal } from '@/components/BizdataScopePicker';
import { TableActionButton, TableActions, TABLE_ACTION_COLUMN_BASE } from '@/components/TableActions';
import { getApplications } from '@/services/EADAF/api/applications';
import { getRoles } from '@/services/EADAF/api/roles';
import {
  deleteStorageBucket,
  getStorageBuckets,
  postStorageBucket,
  putStorageBucket,
} from '@/services/EADAF/api/storage';
import { DEFAULT_PRO_TABLE_OPTIONS } from '@/constants/proTable';
import { useProTableSearchCollapse } from '@/hooks/useProTableSearchCollapse';
import { storageBucketStatusEnum } from '@/enums';
import { isApiSuccess, parseApiListResponse } from '@/utils/apiResponse';
import { augmentColumnsWithChatReference } from '@/utils/augmentColumnsWithChatReference';
import { buildStorageBucketReference } from '@/ai/chatReferenceBuilders';
import { renderStatusBadge } from '@/utils/statusBadge';

type BucketRecord = API.StorageBucket;

const BucketsPage: React.FC = () => {
  const actionRef = useRef<ActionType | undefined>(undefined);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BucketRecord | null>(null);
  const [scopePickerOpen, setScopePickerOpen] = useState(false);
  const [scopeCodes, setScopeCodes] = useState<string[]>([]);
  const [policySameApp, setPolicySameApp] = useState(false);
  const [policyRoles, setPolicyRoles] = useState(false);
  const [policyScope, setPolicyScope] = useState(false);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [roleOptions, setRoleOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [form] = Form.useForm();
  const { references } = useChatReference();
  const chatPrompts = useMemo(() => buildStorageBucketPrompts(references), [references]);
  useAIChatPrompts(chatPrompts);
  const search = useProTableSearchCollapse('file-storage.buckets');

  useEffect(() => {
    if (!policyRoles) return;
    (async () => {
      const res = await getRoles({ size: -1 });
      const { items } = parseApiListResponse<API.Role>(res);
      setRoleOptions(items.map((r) => ({ label: r.role_name || r.role_id!, value: r.role_id! })));
    })();
  }, [policyRoles]);

  const openCreate = () => {
    setEditing(null);
    setPolicySameApp(false);
    setPolicyRoles(false);
    setPolicyScope(false);
    setRoleIds([]);
    setScopeCodes([]);
    form.resetFields();
    form.setFieldsValue({ accessMode: 'authenticated', status: 'ACTIVE' });
    setModalOpen(true);
  };

  const openEdit = (record: BucketRecord) => {
    if (record.isSystem) {
      message.warning('系统内置 Bucket 不可编辑');
      return;
    }
    setEditing(record);
    const restrictions = record.accessRestrictions || {};
    setPolicySameApp(!!restrictions.same_application);
    setPolicyRoles(!!restrictions.role_ids?.length);
    setPolicyScope(!!restrictions.scope_codes?.length);
    setRoleIds(restrictions.role_ids || []);
    setScopeCodes(restrictions.scope_codes || []);
    form.setFieldsValue({
      code: record.code,
      name: record.name,
      description: record.description,
      applicationId: record.applicationId,
      status: record.status,
      accessMode: record.accessMode || 'authenticated',
    });
    setModalOpen(true);
  };

  const buildRestrictions = () => ({
    same_application: policySameApp,
    role_ids: policyRoles ? roleIds : [],
    scope_codes: policyScope ? scopeCodes : [],
  });

  const validatePolicies = () => {
    const accessMode = form.getFieldValue('accessMode');
    if (accessMode !== 'authenticated') return true;
    if (policyRoles && !roleIds.length) {
      message.error('已启用角色限制但未选择角色');
      return false;
    }
    if (policyScope && !scopeCodes.length) {
      message.error('已启用 Scope 限制但未选择 Scope');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validatePolicies()) return false;
    const values = await form.validateFields();
    const payload = {
      ...values,
      accessRestrictions: buildRestrictions(),
    };
    const res = editing?.bucketId
      ? await putStorageBucket(editing.bucketId, payload)
      : await postStorageBucket(payload);
    if (isApiSuccess(res)) {
      message.success(editing ? '更新成功' : '创建成功');
      setModalOpen(false);
      actionRef.current?.reload();
      return true;
    }
    message.error('保存失败');
    return false;
  };

  return (
    <PageContainer pageHeaderRender={() => <></>}>
      <UrlSyncedProTable<BucketRecord>
        actionRef={actionRef}
        rowKey="bucketId"
        scroll={{ x: 'max-content' }}
        headerTitle="Bucket 管理"
        search={search}
        options={DEFAULT_PRO_TABLE_OPTIONS}
        toolBarRender={() => [
          <Button key="create" type="primary" className="btn-gradient-primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建 Bucket
          </Button>,
        ]}
        request={async (params) => {
          const res = await getStorageBuckets({
            page: params.current,
            size: params.pageSize,
            keyword: params.keyword as string | undefined,
          });
          const { items, total, success } = parseApiListResponse<BucketRecord>(res);
          return { data: items, total, success };
        }}
        columns={[
          { title: '编码', dataIndex: 'code', copyable: true },
          ...augmentColumnsWithChatReference<BucketRecord>(
            [{ title: '名称', dataIndex: 'name' } as ProColumns<BucketRecord>],
            'name',
            buildStorageBucketReference,
          ),
          {
            title: '类型',
            render: (_, r) =>
              r.isSystem ? (
                <Tag color="purple">系统内置</Tag>
              ) : r.accessMode === 'public' ? (
                <Tag color="green">无需授权</Tag>
              ) : (
                <Tag color="blue">必须授权</Tag>
              ),
          },
          {
            title: '来源应用',
            render: (_, r) => r.application?.name || '-',
          },
          {
            title: '状态',
            dataIndex: 'status',
            width: 90,
            render: (_, r) => renderStatusBadge(r.status, storageBucketStatusEnum),
          },
          {
            ...TABLE_ACTION_COLUMN_BASE,
            width: 70,
            render: (_, record) =>
              record.isSystem ? (
                <TableActions>
                  <Tag color="purple">系统内置</Tag>
                </TableActions>
              ) : (
                <TableActions>
                  <TableActionButton
                    title="编辑"
                    icon={<EditOutlined />}
                    onClick={() => openEdit(record)}
                  />
                  <TableActionButton
                    title="删除"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => {
                      modal.confirm({
                        title: '确认删除该 Bucket？',
                        onOk: async () => {
                          const res = await deleteStorageBucket(record.bucketId!);
                          if (isApiSuccess(res)) {
                            message.success('已删除');
                            actionRef.current?.reload();
                          }
                        },
                      });
                    }}
                  />
                </TableActions>
              ),
          },
        ]}
      />

      <ModalForm
        title={editing ? '编辑 Bucket' : '新建 Bucket'}
        open={modalOpen}
        form={form}
        modalProps={{ destroyOnHidden: true, onCancel: () => setModalOpen(false) }}
        onFinish={handleSubmit}
        width={640}
      >
        <ProFormText name="code" label="Bucket 编码" rules={[{ required: true }]} disabled={!!editing} />
        <ProFormText name="name" label="名称" rules={[{ required: true }]} />
        <ProFormTextArea name="description" label="描述" />
        <ProFormSelect
          name="applicationId"
          label="来源企业系统"
          request={async () => {
            const res = await getApplications({ page: 1, size: -1 });
            const { items } = parseApiListResponse<API.Application>(res);
            return items.map((a) => ({
              label: `${a.name} (${a.code})`,
              value: a.application_id,
            }));
          }}
        />
        <ProFormRadio.Group
          name="accessMode"
          label="文件访问"
          options={[
            { label: '无需授权访问', value: 'public' },
            { label: '必须授权访问', value: 'authenticated' },
          ]}
        />
        <Form.Item noStyle shouldUpdate={(prev, cur) => prev.accessMode !== cur.accessMode}>
          {({ getFieldValue }) =>
            getFieldValue('accessMode') === 'authenticated' ? (
              <Form.Item label="限制策略（可多选，AND）">
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Checkbox checked={policySameApp} onChange={(e) => setPolicySameApp(e.target.checked)}>
                    必须与上传相同应用
                  </Checkbox>
                  <Checkbox checked={policyRoles} onChange={(e) => setPolicyRoles(e.target.checked)}>
                    限制角色
                  </Checkbox>
                  {policyRoles && (
                    <Select
                      mode="multiple"
                      style={{ width: '100%' }}
                      placeholder="选择角色"
                      value={roleIds}
                      onChange={setRoleIds}
                      options={roleOptions}
                    />
                  )}
                  <Checkbox checked={policyScope} onChange={(e) => setPolicyScope(e.target.checked)}>
                    限制 Scope（访问方应用 Scope 须重叠）
                  </Checkbox>
                  {policyScope && (
                    <Space wrap>
                      {scopeCodes.map((code) => (
                        <Tag key={code}>{code}</Tag>
                      ))}
                      <Button size="small" onClick={() => setScopePickerOpen(true)}>
                        选择 Scope
                      </Button>
                    </Space>
                  )}
                </Space>
              </Form.Item>
            ) : null
          }
        </Form.Item>
        <ProFormSelect
          name="status"
          label="状态"
          initialValue="ACTIVE"
          options={[
            { label: '启用', value: 'ACTIVE' },
            { label: '停用', value: 'DISABLED' },
          ]}
        />
      </ModalForm>

      <BizdataScopePickerModal
        open={scopePickerOpen}
        value={scopeCodes}
        onOk={(codes) => {
          setScopeCodes(codes);
          setScopePickerOpen(false);
        }}
        onCancel={() => setScopePickerOpen(false)}
      />
    </PageContainer>
  );
};

export default BucketsPage;
