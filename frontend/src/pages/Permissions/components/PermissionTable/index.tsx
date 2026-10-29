import React, { useRef, useState, useMemo } from 'react';
import { useAIChatPrompts, useChatReference } from '@eadaf/ai-base';
import { buildPermissionPrompts } from '@/ai/pageChatPrompts';
import {
  ActionType as ProActionType,
  PageContainer,
  type ProColumns,
} from '@ant-design/pro-components';
import { UrlSyncedProTable } from '@/components/UrlSyncedProTable';
import { Button, Select, Space, Modal, Drawer, Spin, Tag, Typography } from 'antd';
import { message, modal } from '@/utils/antdAppApis';
import { EyeOutlined, PlusOutlined, EditOutlined, DeleteOutlined, SaveOutlined, CloseOutlined, ControlOutlined } from "@ant-design/icons";
import { Form } from 'antd';
import { useSetState } from "ahooks";
import { Permission, PermissionTableProps, ActionType } from '../../types';
import { getPermissions, postPermissions, putPermissionsPermissionId, deletePermissionsPermissionId, getPermissionsPermissionId } from "@/services/EADAF/api/permissions";
import { buildPermissionTree, getAllPermissionIds, getNodeLevel, getCurrentLevelCode } from '../../utils';
import { RESOURCE_TYPES, ACTION_LABELS } from '../../constants';
import PermissionForm from '../PermissionForm';
import AccessRestrictionConfigDrawer from '../AccessRestrictionConfigDrawer';
import { DEFAULT_PRO_TABLE_OPTIONS } from '@/constants/proTable';
import { TableActionButton, TableActions, TABLE_ACTION_COLUMN_BASE } from '@/components/TableActions';
import { wrapWithChatReference } from '@/utils/augmentColumnsWithChatReference';
import { buildPermissionReference } from '@/ai/chatReferenceBuilders';
import { enableDisableStatusEnum } from '@/enums';
import { passthroughStatusCell } from '@/utils/statusBadge';
import { useInitialState } from '@/providers/InitialStateProvider';
import { THREE_MEMBER_DUTY_OPTIONS, effectiveThreeMemberDuty } from '@/utils/threeMember';

const PermissionTable: React.FC<PermissionTableProps> = ({
  resourceType,
  allowedActions,
  title,
}) => {
  const actionRef = useRef<ProActionType | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([]);
  const [highlightedRowId, setHighlightedRowId] = useState<string | null>(null);
  const [isHighlighted, setIsHighlighted] = useState(false);
  const highlightTimerRef = useRef<number | undefined>(undefined);
  const [editform] = Form.useForm();
  // 访问限制配置抽屉（仅菜单/按钮使用）
  const [arDrawerOpen, setArDrawerOpen] = useState(false);
  const [arPermission, setArPermission] = useState<Permission | null>(null);
  const isMenuOrButton = resourceType === 'MENU' || resourceType === 'BUTTON';
  const { initialState } = useInitialState();
  const threeOn = Boolean(initialState?.systemFeatures?.threeMemberEnabled);
  const canEditDuty = threeOn && initialState?.currentUser?.three_member_role === 'security_admin';
  const { references } = useChatReference();
  const chatPrompts = useMemo(
    () => buildPermissionPrompts(resourceType, references),
    [resourceType, references],
  );
  useAIChatPrompts(chatPrompts);

  const [state, setState] = useSetState<{
    isCreateModalOpen: boolean;
    createValue: Partial<Permission>;
    isDetailsViewOpen: boolean;
    isDetailsEditable: boolean;
    detailsValue: Partial<Permission>;
  }>({
    isCreateModalOpen: false,
    createValue: {},
    isDetailsViewOpen: false,
    isDetailsEditable: false,
    detailsValue: {},
  });

  const {
    isCreateModalOpen,
    createValue,
    isDetailsViewOpen,
    isDetailsEditable,
    detailsValue,
  } = state;

  /** 按关键词/状态过滤权限树（保留命中节点的祖先链） */
  const filterPermissionTree = (
    nodes: Permission[],
    keyword?: string,
    status?: string,
  ): Permission[] => {
    const matchNode = (node: Permission): boolean => {
      if (node.permission_id.startsWith('virtual-')) return false;
      if (status && node.status !== status) return false;
      if (keyword) {
        const codeMatch = (node.code || '').toLowerCase().includes(keyword);
        if (!codeMatch) return false;
      }
      return true;
    };
    const walk = (list: Permission[]): Permission[] => {
      const result: Permission[] = [];
      list.forEach((node) => {
        const children = node.children?.length ? walk(node.children) : [];
        if (matchNode(node) || children.length) {
          result.push({ ...node, children: children.length ? children : undefined });
        }
      });
      return result;
    };
    return walk(nodes);
  };

  // 处理保存详情
  const handleSaveDetails = async (values: any) => {
    try {
      setLoading(true);
      setSaving(true);
      if (!detailsValue.permission_id) {
        message.error('权限ID不存在');
        return;
      }

      const updateData = {
        code: values.code,
        description: values.description,
        actions: values.actions as ActionType[],
        resource_type: resourceType,
      };
      
      const response = await putPermissionsPermissionId(
        { permission_id: detailsValue.permission_id },
        updateData
      );

      if (response.code && response.code >= 200 && response.code < 300) {
        message.success('更新成功');
        setState({ 
          isDetailsEditable: false,
          detailsValue: { 
            ...detailsValue, 
            ...updateData,
          } as Permission,
        });
        if (actionRef.current) {
          actionRef.current.reload();
        }
      } else {
        message.error(response.message || '更新失败');
      }
    } catch (error) {
      console.error('更新权限信息失败:', error);
      message.error('更新失败');
    } finally {
      setLoading(false);
      setSaving(false);
    }
  };

  // 添加操作列
  const columns: ProColumns<Permission>[] = [
    {
      title: "权限编码",
      dataIndex: "code",
      width: 240,
      render: (dom: React.ReactNode, record: Permission) => {
        const text = String(dom || '');
        const nodeLevel = getNodeLevel(record);
        const displayCode = getCurrentLevelCode(text, nodeLevel);
        const content = record.status === 'DISABLED' ? (
          <Typography.Text delete>{displayCode}</Typography.Text>
        ) : displayCode;
        if (record.permission_id.startsWith('virtual-')) {
          return content;
        }
        return wrapWithChatReference(content, record, buildPermissionReference);
      },
    },
    {
      title: "描述",
      dataIndex: "description",
      width: 200,
      render: (_, record: Permission) => {
        if (record.permission_id.startsWith('virtual-')) {
          return '-';
        }
        return record.description;
      },
    },
    {
      title: "操作权限",
      dataIndex: "actions",
      width: 200,
      render: (_: unknown, record: Permission) => {
        if (!record.actions || !Array.isArray(record.actions)) {
          return '-';
        }
        return record.actions.map(action => ACTION_LABELS[action]).join(', ');
      },
    },
    {
      title: "状态",
      dataIndex: "status",
      valueType: 'select',
      valueEnum: enableDisableStatusEnum,
      width: 100,
      render: (dom, record: Permission) =>
        passthroughStatusCell(dom, record.permission_id.startsWith('virtual-')),
    },
    ...(isMenuOrButton ? [{
      title: "访问限制",
      dataIndex: "access_restriction",
      width: 110,
      render: (_: unknown, record: Permission) => {
        if (record.permission_id.startsWith('virtual-')) return null;
        const r = record.access_restriction;
        if (!r || r.mode === 'none') return <Tag color="green">无限制</Tag>;
        if (r.mode === 'role') return <Tag color="purple">限制角色</Tag>;
        if (r.mode === 'department') return <Tag color="geekblue">限制组织</Tag>;
        return <Tag color="default">无限制</Tag>;
      },
    }, ...(threeOn ? [{
      title: '三员性质',
      dataIndex: 'three_member_duty',
      width: 160,
      render: (_: unknown, record: Permission) => {
        if (record.permission_id.startsWith('virtual-')) return null;
        const value = effectiveThreeMemberDuty(record.code, record.three_member_duty);
        return (
          <Select
            size="small"
            style={{ width: 140 }}
            disabled={!canEditDuty}
            value={value}
            options={THREE_MEMBER_DUTY_OPTIONS}
            onChange={async (next) => {
              const response = await putPermissionsPermissionId(
                { permission_id: record.permission_id },
                {
                  description: record.description,
                  resource_type: record.resource_type,
                  actions: record.actions,
                  three_member_duty: next,
                },
              );
              if (response.code === 200) {
                message.success('已更新三员性质');
                actionRef.current?.reload();
              } else {
                message.error(response.message || '更新失败');
              }
            }}
          />
        );
      },
    }] : [])] : []),
    {
      ...TABLE_ACTION_COLUMN_BASE,
      dataIndex: 'option',
      width: 70,
      render: (_: unknown, record: Permission) => {
        if (record.permission_id.startsWith('virtual-')) {
          return null;
        }
        return (
          <TableActions>
            {isMenuOrButton ? (
              <TableActionButton
                title="配置限制"
                key="access-restriction"
                icon={<ControlOutlined />}
                onClick={() => {
                  setArPermission(record);
                  setArDrawerOpen(true);
                }}
              />
            ) : (
              <TableActionButton
                title="查看"
                key="view"
                icon={<EyeOutlined />}
                onClick={async () => {
              try {
                setLoading(true);
                setState({
                  isDetailsViewOpen: false,
                  detailsValue: {},
                  isDetailsEditable: false,
                });
                
                const response = await getPermissionsPermissionId({
                  permission_id: record.permission_id,
                });
                
                if (response.code === 200 && response.data) {
                  const processedData = {
                    ...response.data,
                    resource_type: resourceType,
                    actions: response.data.actions as ActionType[],
                  } as Permission;
                  
                  setTimeout(() => {
                    setState({
                      detailsValue: processedData,
                      isDetailsViewOpen: true,
                      isDetailsEditable: false,
                    });
                  }, 0);

                  editform.setFieldsValue(processedData);
                } else {
                  message.error('获取权限详情失败');
                }
              } catch (error) {
                message.error('获取权限详情失败');
              } finally {
                setLoading(false);
              }
            }}
            />
            )}
            <TableActionButton
              title="删除"
              key="delete"
              danger
              icon={<DeleteOutlined />}
              loading={deleteLoading}
              onClick={() => {
              modal.confirm({
                title: '确认删除',
                content: '确定要删除该权限吗？',
                onOk: async () => {
                  try {
                    setDeleteLoading(true);
                    const response = await deletePermissionsPermissionId({
                      permission_id: record.permission_id,
                    });
                    if (response.code && response.code >= 200 && response.code < 300) {
                      message.success('删除权限成功');
                      if (actionRef.current) {
                        actionRef.current.reload();
                      }
                    } else {
                      message.error(response.message || '删除失败');
                    }
                  } catch (error: any) {
                    const errMsg = error?.response?.data?.message || '删除失败';
                    message.error(errMsg);
                  } finally {
                    setDeleteLoading(false);
                  }
                },
              });
            }}
            />
          </TableActions>
        );
      },
    },
  ];

  const handleCreate = () => {
    setState({
      isCreateModalOpen: true,
      createValue: {
        actions: ['read'],
        status: 'ACTIVE',
      },
    });
  };

  return (
    <>
      <PageContainer
        pageHeaderRender={() => {
          return <></>;
        }}
      >
        <UrlSyncedProTable
          engine="nuqs"
          urlFilterKeys={['code', 'status']}
          syncPagination={false}
          defaultSize="small"
          actionRef={actionRef}
          rowKey="permission_id"
          scroll={{ x: 'max-content' }}
          onRow={(record) => ({
            id: `permission-row-${record.permission_id}`,
            style: {
              backgroundColor: record.status === 'DISABLED' ? '#f5f5f5' : 
                highlightedRowId === record.permission_id && isHighlighted ? '#fffbe6' : undefined,
              transition: 'background-color 0.3s',
              opacity: record.status === 'DISABLED' ? 0.8 : 1,
            },
          })}
          search={{
            labelWidth: 'auto',
            defaultCollapsed: false,
          }}
          headerTitle={RESOURCE_TYPES[resourceType].label}
          toolBarRender={() => [
            <Button
              type="primary" className="btn-gradient-primary"
              key="create"
              icon={<PlusOutlined />}
              loading={createLoading}
              onClick={handleCreate}
            >
              新建
            </Button>
          ]}
          request={async (params) => {
            try {
              setLoading(true);
              // 始终拉取全部，按搜索参数前端过滤（树形全量数据）
              const response: any = await getPermissions({ resource_type: resourceType } as any);

              if (response.code === 200 && response.data?.items) {
                let treeData = buildPermissionTree(response.data.items);

                // ProTable 内置 search 过滤：编码 / 状态
                const keyword = (params.code as string | undefined)?.trim().toLowerCase();
                const statusParam = params.status as string | undefined;
                if (keyword || statusParam) {
                  treeData = filterPermissionTree(treeData, keyword, statusParam);
                }

                const allIds = getAllPermissionIds(treeData);
                setExpandedRowKeys(allIds);

                return {
                  data: treeData,
                  success: true,
                  total: treeData.length,
                };
              }

              message.error(response.message || `获取${RESOURCE_TYPES[resourceType].label}列表失败`);
              return {
                data: [],
                success: false,
                total: 0,
              };
            } catch (error) {
              console.error('获取权限数据时发生错误:', error);
              message.error(`获取${RESOURCE_TYPES[resourceType].label}列表失败`);
              return {
                data: [],
                success: false,
                total: 0,
              };
            } finally {
              setLoading(false);
            }
          }}
          columns={columns}
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
          loading={loading}
        />

        {/* 权限详情 */}
        <Drawer
          key={`${detailsValue?.permission_id || ''}-${isDetailsViewOpen}`}
          width={800}
          forceRender={true}
          open={isDetailsViewOpen}
          destroyOnHidden={true}
          onClose={() => {
            setState({ 
              isDetailsViewOpen: false,
              isDetailsEditable: false,
              detailsValue: {},
            });
          }}
          title={`${RESOURCE_TYPES[resourceType].label}详情 ${detailsValue?.code || ''}`}
          extra={
            <Space>
              {isDetailsEditable ? (
                <>
                  <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    loading={saving}
                    onClick={() => {
                      editform.submit();
                    }}
                  >
                    保存
                  </Button>
                  <Button
                    icon={<CloseOutlined />}
                    onClick={() => {
                      setState({ isDetailsEditable: false });
                    }}
                  >
                    取消
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="primary"
                    icon={<EditOutlined />}
                    onClick={() => {
                      setState({ isDetailsEditable: true });
                    }}
                  >
                    编辑
                  </Button>
                  <Button
                    danger
                    ghost
                    icon={<DeleteOutlined />}
                    loading={deleteLoading}
                    onClick={() => {
                      if (!detailsValue?.permission_id) return;
                      modal.confirm({
                        title: '确认删除',
                        content: '确定要删除该权限吗？',
                        onOk: async () => {
                          try {
                            setDeleteLoading(true);
                            const response = await deletePermissionsPermissionId({
                              permission_id: detailsValue.permission_id,
                            });
                            if (response.code && response.code >= 200 && response.code < 300) {
                              message.success('删除成功');
                              setState({ 
                                isDetailsViewOpen: false,
                                detailsValue: {},
                                isDetailsEditable: false,
                              });
                              if (actionRef.current) {
                                actionRef.current.reload();
                              }
                            } else {
                              message.error(response.message || '删除失败');
                            }
                          } catch (error) {
                            message.error('删除失败');
                          } finally {
                            setDeleteLoading(false);
                          }
                        },
                      });
                    }}
                  >
                    删除
                  </Button>
                </>
              )}
            </Space>
          }
        >
          <Spin spinning={loading}>
            {detailsValue?.permission_id && (
              <PermissionForm
                resourceType={resourceType}
                allowedActions={allowedActions}
                initialValues={detailsValue}
                onFinish={async (values) => {
                  try {
                    setSaving(true);
                    const response = await putPermissionsPermissionId({
                      permission_id: detailsValue.permission_id!,
                    }, {
                      ...values,
                      resource_type: resourceType,
                    });
                    
                    if (response.code === 200) {
                      message.success('更新权限成功');
                      setState({
                        isDetailsViewOpen: false,
                        detailsValue: {},
                        isDetailsEditable: false,
                      });
                      if (actionRef.current) {
                        actionRef.current.reload();
                      }
                      return true;
                    } else {
                      message.error(response.message || '更新权限失败');
                      return false;
                    }
                  } catch (error: any) {
                    const errMsg = error?.response?.data?.message || '更新权限失败';
                    message.error(errMsg);
                    return false;
                  } finally {
                    setSaving(false);
                  }
                }}
                loading={saving}
                readonly={!isDetailsEditable}
                form={editform}
              />
            )}
          </Spin>
        </Drawer>

        {/* 新建权限 */}
        <Modal
          title={`新建${RESOURCE_TYPES[resourceType].label}`}
          open={isCreateModalOpen}
          onCancel={() => {
            setState({ 
              isCreateModalOpen: false,
              createValue: {},
            });
          }}
          footer={null}
          width={800}
        >
          <PermissionForm
            resourceType={resourceType}
            allowedActions={allowedActions}
            initialValues={createValue}
            onFinish={async (values: any) => {
              try {
                setCreateLoading(true);
                const response = await postPermissions({
                  code: values.code,
                  description: values.description,
                  resource_type: resourceType,
                  actions: values.actions as ActionType[],
                  // 菜单/按钮创建时默认无限制，后续可通过「配置限制」调整
                  ...(isMenuOrButton ? { access_restriction: { mode: 'none', roleIds: [], departmentIds: [] } } : {}),
                } as any);
                
                if (response.code && response.code >= 200 && response.code < 300) {
                  message.success('创建成功');
                  setState({
                    isCreateModalOpen: false,
                    createValue: {},
                  });
                  if (actionRef.current) {
                    setHighlightedRowId(response.data?.permission_id || null);
                    setIsHighlighted(true);
                    actionRef.current.reload();
                    if (highlightTimerRef.current) {
                      window.clearTimeout(highlightTimerRef.current);
                    }
                    highlightTimerRef.current = window.setTimeout(() => {
                      setIsHighlighted(false);
                      setHighlightedRowId(null);
                    }, 3000);
                  }
                  return true;
                } else {
                  message.error(response.message || '创建失败');
                  return false;
                }
              } catch (error: any) {
                message.error(error.message || '创建失败');
                return false;
              } finally {
                setCreateLoading(false);
              }
            }}
            loading={createLoading}
          />
        </Modal>
        {isMenuOrButton ? (
          <AccessRestrictionConfigDrawer
            open={arDrawerOpen}
            permission={arPermission}
            onClose={() => setArDrawerOpen(false)}
            onSuccess={() => actionRef.current?.reload()}
          />
        ) : null}
      </PageContainer>
    </>
  );
};

export default PermissionTable; 