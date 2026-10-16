import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageContainer, ProTable, type ProColumns, type ActionType as ProActionType } from '@ant-design/pro-components';
import { Button, Drawer, Form, Radio, Space, Tag, Tooltip, Typography } from 'antd';
import { message } from '@/utils/antdAppApis';
import { ControlOutlined, ThunderboltOutlined, BlockOutlined } from '@ant-design/icons';
import {
  getBuiltinApis,
  putBuiltinApiAccessRestriction,
  deleteBuiltinApiAccessRestriction,
  putBuiltinApiBatchAccessRestriction,
  type BuiltinApiItem,
  type BuiltinApiAccessRestriction,
} from '@/services/EADAF/api/builtinApis';
import { getRoles } from '@/services/EADAF/api/roles';
import DepartmentLookup from '@/pages/ApiServices/components/DepartmentLookup';
import { isApiSuccess, getApiData } from '@/utils/apiResponse';
import { DEFAULT_PRO_TABLE_OPTIONS } from '@/constants/proTable';
import { TableActionButton, TableActions, TABLE_ACTION_COLUMN_BASE } from '@/components/TableActions';
import { ProFormSelect } from '@ant-design/pro-components';

/** 超级管理员角色 code —— 默认拥有全部权限，配置限制时从角色列表中排除 */
const SUPER_ADMIN_ROLE_CODE = 'SUPER_ADMIN';

const { Text } = Typography;

const METHOD_COLORS: Record<string, string> = {
  GET: 'blue',
  POST: 'green',
  PUT: 'orange',
  DELETE: 'red',
  PATCH: 'cyan',
};

/** 把限制配置渲染为摘要 */
function renderRestriction(record: BuiltinApiItem) {
  const r = record.accessRestriction;
  if (!r) {
    return <Tag color="default">未配置</Tag>;
  }
  if (r.mode === 'role') {
    return <Tag color="purple">限制角色</Tag>;
  }
  if (r.mode === 'department') {
    return <Tag color="geekblue">限制组织</Tag>;
  }
  return <Tag color="default">未配置</Tag>;
}

interface BuiltinApiTreeRow extends BuiltinApiItem {
  key: string;
  children?: BuiltinApiTreeRow[];
}

interface TreeBuildNode {
  code: string;
  children: Record<string, TreeBuildNode>;
  label?: string;
  isLeaf?: boolean;
}

/** 把后端 tree + items 合并成带明细的树表行 */
function buildTreeRows(
  items: BuiltinApiItem[],
): BuiltinApiTreeRow[] {
  const itemMap = new Map(items.map((i) => [i.code, i]));
  const root: TreeBuildNode = { code: '', children: {} };
  items.forEach((item) => {
    const segments = item.code.split(':');
    let node = root;
    segments.forEach((seg, idx) => {
      const isLeaf = idx === segments.length - 1;
      if (!node.children[seg]) node.children[seg] = { code: seg, children: {} };
      node = node.children[seg];
      if (isLeaf) {
        node.label = item.label;
        node.isLeaf = true;
      }
    });
  });

  function toRows(mapNode: TreeBuildNode, parentPath = ''): BuiltinApiTreeRow[] {
    return Object.values(mapNode.children)
      .map((child) => {
        const code = parentPath ? `${parentPath}:${child.code}` : child.code;
        if (child.isLeaf) {
          const item = itemMap.get(code);
          return { ...(item as BuiltinApiItem), key: code, children: undefined };
        }
        return {
          code,
          key: code,
          domain: '',
          label: child.code,
          routePath: '',
          httpMethods: [],
          actions: [],
          description: '',
          accessRestriction: null,
          configured: false,
          children: toRows(child, code),
        };
      })
      .sort((a, b) => {
        const aLeaf = Boolean(a.routePath);
        const bLeaf = Boolean(b.routePath);
        if (aLeaf !== bLeaf) return aLeaf ? 1 : -1;
        return String(a.code).localeCompare(String(b.code));
      });
  }
  return toRows(root);
}

const BuiltinApiPage: React.FC = () => {
  const actionRef = useRef<ProActionType | undefined>(undefined);
  const [rows, setRows] = useState<BuiltinApiItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<BuiltinApiItem | null>(null);
  const [batchDomain, setBatchDomain] = useState<string | null>(null);
  const [form] = Form.useForm();
  const mode = Form.useWatch('mode', form);
  const [roleOptions, setRoleOptions] = useState<{ label: string; value: string }[]>([]);
  const [roleOptionsLoading, setRoleOptionsLoading] = useState(false);

  const treeRows = useMemo(() => buildTreeRows(rows), [rows]);

  /** 加载角色选项，排除超级管理员（默认拥有全部权限，无需配置） */
  const loadRoles = useCallback(async () => {
    setRoleOptionsLoading(true);
    try {
      const res = await getRoles({ page: 1, size: -1, status: 'ACTIVE' });
      const items = (res.data?.items || []).filter((r) => r.code !== SUPER_ADMIN_ROLE_CODE);
      setRoleOptions(
        items.map((role) => ({
          label: `${role.role_name} (${role.code})`,
          value: role.role_id!,
        })),
      );
    } catch {
      setRoleOptions([]);
    } finally {
      setRoleOptionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await getBuiltinApis();
      if (isApiSuccess(res)) {
        setRows(getApiData(res)?.items || []);
      } else {
        message.error(res.message || '加载失败');
      }
    } catch {
      message.error('加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  /** 打开单条配置 */
  const openConfig = (record: BuiltinApiItem) => {
    setEditing(record);
    setBatchDomain(null);
    const r = record.accessRestriction;
    form.setFieldsValue({
      mode: r?.mode || 'none',
      roleIds: r?.mode === 'role' ? r.roleIds || [] : [],
      departmentIds: r?.mode === 'department' ? r.departmentIds || [] : [],
    });
    setDrawerOpen(true);
  };

  /** 打开域批量配置：domainCode 为该域顶层 code（如 'user'、'bizdata:metrics'） */
  const openBatchConfig = (domainCode: string, domainLabel: string) => {
    setEditing(null);
    setBatchDomain(domainCode);
    form.setFieldsValue({ mode: 'none', roleIds: [], departmentIds: [] });
    setDrawerOpen(true);
    message.info(`批量配置将应用到「${domainLabel}」域下所有内置 API`);
  };

  const isBatch = batchDomain !== null;

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const payload: BuiltinApiAccessRestriction = { mode: values.mode };
      if (values.mode === 'role') payload.roleIds = values.roleIds || [];
      if (values.mode === 'department') payload.departmentIds = values.departmentIds || [];

      setSaving(true);
      let res;
      if (isBatch && batchDomain) {
        res = await putBuiltinApiBatchAccessRestriction(batchDomain, payload);
      } else {
        if (!editing) return;
        res = await putBuiltinApiAccessRestriction(editing.code, payload);
      }
      if (isApiSuccess(res)) {
        message.success(isBatch ? `批量配置成功（已应用到 ${(res as any).data?.appliedCount ?? ''} 项）` : '保存成功');
        setDrawerOpen(false);
        await loadData();
      } else {
        message.error(res.message || '保存失败');
      }
    } catch (err: any) {
      if (err?.errorFields) return; // 表单校验错误，不提示
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!editing) return;
    try {
      setSaving(true);
      const res = await deleteBuiltinApiAccessRestriction(editing.code);
      if (isApiSuccess(res)) {
        message.success('已清除限制');
        setDrawerOpen(false);
        await loadData();
      } else {
        message.error(res.message || '清除失败');
      }
    } catch {
      message.error('清除失败');
    } finally {
      setSaving(false);
    }
  };

  const columns: ProColumns<BuiltinApiTreeRow>[] = [
    {
      title: '内置 API',
      dataIndex: 'code',
      width: 320,
      render: (_, record) => {
        if (!record.routePath) {
          return <Text strong>{record.label}</Text>;
        }
        return (
          <Space direction="vertical" size={0}>
            <span>{record.label}</span>
            <Text type="secondary" style={{ fontSize: 12 }}>{record.code}</Text>
          </Space>
        );
      },
    },
    {
      title: '路由',
      dataIndex: 'routePath',
      width: 280,
      render: (_, record) => {
        if (!record.routePath) return '-';
        return (
          <Space direction="vertical" size={0}>
            <Text code style={{ fontSize: 12 }}>{record.routePath}</Text>
            <Space size={4}>
              {(record.httpMethods || []).map((m) => (
                <Tag key={m} color={METHOD_COLORS[m] || 'default'} style={{ margin: 0 }}>{m}</Tag>
              ))}
            </Space>
          </Space>
        );
      },
    },
    {
      title: '操作类型',
      dataIndex: 'actions',
      width: 140,
      render: (_, record) => {
        if (!record.routePath) return '-';
        return (record.actions || []).map((a) => (
          <Tag key={a}>{a}</Tag>
        ));
      },
    },
    {
      title: '访问限制',
      dataIndex: 'accessRestriction',
      width: 140,
      render: (_, record) => {
        if (!record.routePath) return null;
        return renderRestriction(record);
      },
    },
    {
      ...TABLE_ACTION_COLUMN_BASE,
      dataIndex: 'option',
      width: 60,
      render: (_, record) => {
        if (!record.routePath) {
          return (
            <TableActions>
              <TableActionButton
                title="批量配置"
                key="batch-config"
                icon={<BlockOutlined />}
                onClick={() => openBatchConfig(record.code, record.label)}
              />
            </TableActions>
          );
        }
        return (
          <TableActions>
            <TableActionButton
              title="配置限制"
              key="config"
              icon={<ControlOutlined />}
              onClick={() => openConfig(record)}
            />
          </TableActions>
        );
      },
    },
  ];

  return (
    <PageContainer pageHeaderRender={() => <></>}>
      <ProTable<BuiltinApiTreeRow>
        headerTitle="内置 API 权限"
        actionRef={actionRef}
        rowKey="key"
        search={false}
        loading={loading}
        dataSource={treeRows}
        columns={columns}
        pagination={false}
        scroll={{ x: 'max-content' }}
        options={DEFAULT_PRO_TABLE_OPTIONS}
        expandable={{ defaultExpandAllRows: true }}
      />

      <Drawer
        title={isBatch ? '批量配置访问限制' : '配置访问限制'}
        width={480}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        destroyOnHidden
        extra={
          !isBatch && editing?.configured ? (
            <Button danger onClick={handleClear} loading={saving}>清除限制</Button>
          ) : null
        }
      >
        {isBatch ? (
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary">批量配置目标</Text>
            <div style={{ fontSize: 16, fontWeight: 500 }}>
              <ThunderboltOutlined style={{ marginRight: 6, color: '#faad14' }} />
              {batchDomain} 域（全部内置 API）
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              该配置将覆盖「{batchDomain}」域下所有内置 API 的访问限制。
            </Text>
          </div>
        ) : editing ? (
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary">内置 API</Text>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{editing.label}</div>
            <Text code>{editing.code}</Text>
            <div style={{ marginTop: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>{editing.routePath}</Text>
            </div>
          </div>
        ) : null}
        {(isBatch || editing) ? (
          <>
            <Form form={form} layout="vertical" initialValues={{ mode: 'none' }}>
              <Form.Item
                name="mode"
                label="访问策略"
                rules={[{ required: true, message: '请选择访问策略' }]}
              >
                <Radio.Group>
                  <Radio value="none">无限制</Radio>
                  <Radio value="role">限制用户角色</Radio>
                  <Radio value="department">限制用户组织</Radio>
                </Radio.Group>
              </Form.Item>
              {mode === 'role' ? (
                <Form.Item
                  name="roleIds"
                  label="允许的角色"
                  rules={[{ required: true, message: '请选择至少一个角色' }]}
                  extra="超级管理员默认拥有全部权限，无需在此选择"
                >
                  <ProFormSelect
                    mode="multiple"
                    options={roleOptions}
                    fieldProps={{ loading: roleOptionsLoading, placeholder: '选择可访问该内置 API 的角色' }}
                  />
                </Form.Item>
              ) : null}
              {mode === 'department' ? (
                <Form.Item
                  name="departmentIds"
                  label="允许的组织"
                  rules={[{ required: true, message: '请选择至少一个组织' }]}
                >
                  <DepartmentLookup />
                </Form.Item>
              ) : null}
            </Form>
            <div style={{ marginTop: 8 }}>
              <Tooltip title="应用令牌（外部系统）按应用授权访问，不受此处角色/组织限制约束">
                <Text type="secondary" style={{ fontSize: 12 }}>
                  说明：此处限制仅作用于「用户令牌」调用；「应用令牌」按应用授权（可访问内置 API）鉴权，不受角色/组织限制。
                </Text>
              </Tooltip>
            </div>
            <div style={{ marginTop: 24, textAlign: 'right' }}>
              <Space>
                <Button onClick={() => setDrawerOpen(false)}>取消</Button>
                <Button type="primary" loading={saving} onClick={handleSave}>
                  {isBatch ? '批量应用' : '保存'}
                </Button>
              </Space>
            </div>
          </>
        ) : null}
      </Drawer>
    </PageContainer>
  );
};

export default BuiltinApiPage;
