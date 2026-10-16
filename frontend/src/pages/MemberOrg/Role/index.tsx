import {
  ActionType,
  BetaSchemaForm,
  PageContainer,
  type ProColumns,
} from '@ant-design/pro-components';
import { UrlSyncedProTable } from '@/components/UrlSyncedProTable';
import { Button, Space, Modal, Drawer, Spin, Typography } from 'antd';
import { message, modal } from '@/utils/antdAppApis';
import { EyeOutlined, PlusOutlined, EditOutlined, DeleteOutlined, SaveOutlined, CloseOutlined } from "@ant-design/icons";
import React, { useRef, useState, useEffect, useMemo } from "react";
import { useAIChatPrompts, useChatReference } from '@eadaf/ai-base';
import { buildRolePrompts } from '@/ai/pageChatPrompts';
import { 
  getRoles, 
  postRoles, 
  putRolesRoleId, 
  deleteRolesRoleId, 
  getRolesRoleId,
  postRolesRoleIdPermissions,
  putRolesRoleIdPermissions,
} from "@/services/EADAF/api/roles";
import { getPermissions } from "@/services/EADAF/api/permissions";
import { tableColumns, formFields, editFormFields, detailFields } from "./schema";
import { buildRoleTree } from "./utils";
import type { Role } from "./types";
import { useSetState } from "ahooks";
import { DEFAULT_PRO_TABLE_OPTIONS } from '@/constants/proTable';
import { TableActionButton, TableActions, TABLE_ACTION_COLUMN_BASE } from '@/components/TableActions';
import { Form } from 'antd';
import { augmentColumnsWithChatReference, wrapWithChatReference } from '@/utils/augmentColumnsWithChatReference';
import { buildRoleReference } from '@/ai/chatReferenceBuilders';

const Page: React.FC = () => {
  const actionRef = useRef<ActionType | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([]);
  const [highlightedRowId, setHighlightedRowId] = useState<string | null>(null);
  const [isHighlighted, setIsHighlighted] = useState(false);
  const highlightTimerRef = useRef<number | undefined>(undefined);
  const [editform] = Form.useForm();
  const { references } = useChatReference();
  const chatPrompts = useMemo(() => buildRolePrompts(references), [references]);
  useAIChatPrompts(chatPrompts);

  // 递归获取所有角色的 ID
  const getAllRoleIds = (roles: Role[]): string[] => {
    return roles.reduce((acc: string[], role: Role) => {
      if (role.role_id) {
        acc.push(role.role_id);
      }
      if (role.children && role.children.length > 0) {
        acc.push(...getAllRoleIds(role.children));
      }
      return acc;
    }, []);
  };

  // 按关键词/状态过滤角色树（保留命中节点的祖先链以便树形展示）
  const filterRoleTree = (roles: Role[], keyword?: string, status?: string): Role[] => {
    const matchNode = (role: Role): boolean => {
      if (role.role_id.startsWith('virtual-')) return false;
      if (status && role.status !== status) return false;
      if (keyword) {
        const nameMatch = (role.role_name || '').toLowerCase().includes(keyword);
        const codeMatch = (role.code || '').toLowerCase().includes(keyword);
        if (!nameMatch && !codeMatch) return false;
      }
      return true;
    };
    const walk = (nodes: Role[]): Role[] => {
      const result: Role[] = [];
      nodes.forEach((node) => {
        const children = node.children?.length ? walk(node.children) : [];
        if (matchNode(node) || children.length) {
          result.push({ ...node, children: children.length ? children : undefined });
        }
      });
      return result;
    };
    return walk(roles);
  };

  const [state, setState] = useSetState<{
    isCreateModalOpen: boolean;
    createValue: Partial<Role>;
    isDetailsViewOpen: boolean;
    isDetailsEditable: boolean;
    detailsValue: Partial<Role> & { role_id?: string };
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

  // 获取权限列表
  const fetchPermissions = async () => {
    try {
      const response = await getPermissions({});
      if (response.code === 200 && response.data?.items) {
        return response.data.items.map((item:any) => ({
          label: item.name,
          value: item.permission_id,
        }));
      }
      return [];
    } catch (error) {
      console.error('获取权限列表失败:', error);
      return [];
    }
  };

  // 更新权限字段的 request 函数
  const updatePermissionsRequest = async () => {
    const permissions = await fetchPermissions();
    // 更新 schema 中的权限字段
    const permissionField = editFormFields.find(
      (field) => field.dataIndex === 'permissions',
    ) as (typeof editFormFields)[number] & {
      request?: () => Promise<{ label: string; value: string }[]>;
    };
    if (permissionField) {
      permissionField.request = async () => permissions;
    }
    return permissions;
  };

  // 处理保存详情
  const handleSaveDetails = async (values: any) => {
    try {
      setLoading(true);
      setSaving(true);
      if (!detailsValue.role_id) {
        message.error('角色ID不存在');
        return;
      }

      // 更新基本信息
      const updateData = {
        role_name: values.role_name,
        description: values.description,
        status: values.status,
      };
      
      const response = await putRolesRoleId(
        { role_id: detailsValue.role_id },
        updateData
      );

      if (response.code && response.code >= 200 && response.code < 300) {
        // 更新权限
        if (values.permissions) {
          const currentPermissions = detailsValue.permissions?.map(p => p.permission_id) || [];
          const newPermissions = values.permissions;
          
          const addPermissions = newPermissions.filter((id: string) => !currentPermissions.includes(id));
          const removePermissions = currentPermissions.filter(id => !newPermissions.includes(id));

          if (addPermissions.length > 0 || removePermissions.length > 0) {
            await putRolesRoleIdPermissions(
              { role_id: detailsValue.role_id },
              {
                add_permissions: addPermissions,
                remove_permissions: removePermissions,
              }
            );
          }
        }

        message.success('更新成功');
        setState({ 
          isDetailsEditable: false,
          detailsValue: { 
            ...detailsValue, 
            ...updateData,
            permissions: values.permissions ? 
              (await fetchPermissions()).filter(p => values.permissions.includes(p.value))
                .map(p => ({ permission_id: p.value, name: p.label, code: '' })) : 
              detailsValue.permissions,
          } as Role,
        });
        if (actionRef.current) {
          actionRef.current.reload();
        }
      } else {
        message.error(response.message || '更新失败');
      }
    } catch (error) {
      console.error('更新角色信息失败:', error);
      message.error('更新失败');
    } finally {
      setLoading(false);
      setSaving(false);
    }
  };

  // 在组件挂载时获取权限列表
  useEffect(() => {
    updatePermissionsRequest();
  }, []);

  // 添加操作列
  const columns: ProColumns<Role>[] = [
    {
      title: "角色名称",
      dataIndex: "role_name",
      width: 300,
      render: (dom: React.ReactNode, record: Role) => {
        const text = String(dom || '');
        if (record.role_id.startsWith('virtual-')) {
          return text;
        }
        return wrapWithChatReference(text, record, buildRoleReference);
      },
    },
    {
      title: "角色编码",
      dataIndex: "code",
      width: 160,
      render: (dom: React.ReactNode, record: Role) => {
        const text = String(dom || '');
        if (record.role_id.startsWith('virtual-')) {
          return text;
        }
        const nodeLevel = record.code.split(':').length - 1;
        const displayCode = text.split(':')[nodeLevel] || text;
        return record.status === 'ARCHIVED' ? (
          <Typography.Text delete>{displayCode}</Typography.Text>
        ) : displayCode;
      },
    },
    ...tableColumns.filter((col: any) => !['role_name', 'code'].includes(col.dataIndex)),
    {
      ...TABLE_ACTION_COLUMN_BASE,
      dataIndex: 'option',
      width: 70,
      render: (_: unknown, record: Role) => {
        // 虚拟节点不显示操作按钮
        if (record.role_id.startsWith('virtual-')) {
          return null;
        }
        return (
          <TableActions>
            <TableActionButton
              title="查看"
              key="view"
              icon={<EyeOutlined />}
              onClick={async () => {
              try {
                setLoading(true);
                // 先关闭抽屉，确保状态被重置
                setState({
                  isDetailsViewOpen: false,
                  detailsValue: {},
                  isDetailsEditable: false,
                });
                
                const response = await getRolesRoleId({
                  role_id: record.role_id,
                });
                
                if (response.code === 200 && response.data) {
                  const processedData = {
                    ...response.data,
                  } as Role;
                  
                  setTimeout(() => {
                    setState({
                      detailsValue: processedData,
                      isDetailsViewOpen: true,
                      isDetailsEditable: false,  // 默认是查看模式
                    });
                  }, 0);

                  editform.setFieldsValue(processedData);
                } else {
                  message.error('获取角色详情失败');
                }
              } catch (error) {
                message.error('获取角色详情失败');
              } finally {
                setLoading(false);
              }
            }}
            />
            <TableActionButton
              title="删除"
              key="delete"
              danger
              icon={<DeleteOutlined />}
              loading={deleteLoading}
              onClick={() => {
              modal.confirm({
                title: '确认删除',
                content: '确定要删除该角色吗？',
                onOk: async () => {
                  try {
                    setDeleteLoading(true);
                    const response = await deleteRolesRoleId({
                      role_id: record.role_id,
                    });
                    if (response.code && response.code >= 200 && response.code < 300) {
                      message.success('删除角色成功');
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

  return (
    <>
      <PageContainer
        pageHeaderRender={() => {
          return <></>;
        }}
      >
        <UrlSyncedProTable
          engine="nuqs"
          urlFilterKeys={['role_name', 'status']}
          syncPagination={false}
          defaultSize="small"
          actionRef={actionRef}
          rowKey="role_id"
          scroll={{ x: 'max-content' }}
          onRow={(record) => ({
            id: `role-row-${record.role_id}`,
            style: {
              backgroundColor: record.status === 'ARCHIVED' ? '#f5f5f5' : 
                highlightedRowId === record.role_id && isHighlighted ? '#fffbe6' : undefined,
              transition: 'background-color 0.3s',
              opacity: record.status === 'ARCHIVED' ? 0.8 : 1,
            },
          })}
          search={{
            labelWidth: 'auto',
            defaultCollapsed: false,
          }}
          headerTitle="角色管理"
          toolBarRender={() => [
            <Button
              type="primary" className="btn-gradient-primary"
              key="create"
              icon={<PlusOutlined />}
              loading={createLoading}
              onClick={() => {
                setState({
                  isCreateModalOpen: true,
                  createValue: {
                    status: 'ACTIVE',
                  },
                });
              }}
            >
              新建
            </Button>
          ]}
          request={async (params) => {
            try {
              setLoading(true);
              // 始终拉取全部角色，按搜索参数在前端过滤（树形全量数据）
              const response = await getRoles({});

              if (response.code === 200 && response.data?.items) {
                const roles = response.data.items.map(item => ({
                  role_id: item.role_id || '',
                  role_name: item.role_name || '',
                  code: item.code || '',
                  description: item.description,
                  status: (item.status || 'ACTIVE') as 'ACTIVE' | 'ARCHIVED',
                  permissions: item.permissions?.map(p => ({
                    permission_id: p.permission_id || '',
                    name: p.name || '',
                    code: p.code || '',
                  })) || [],
                }));

                let treeData = buildRoleTree(roles);

                // ProTable 内置 search 过滤：角色名称 / 状态
                const keyword = (params.role_name as string | undefined)?.trim().toLowerCase();
                const statusParam = params.status as string | undefined;
                if (keyword || statusParam) {
                  treeData = filterRoleTree(treeData, keyword, statusParam);
                }

                const allIds = getAllRoleIds(treeData);
                setExpandedRowKeys(allIds);

                return {
                  data: treeData,
                  success: true,
                  total: treeData.length,
                };
              }

              message.error(response.message || '获取角色列表失败');
              return { data: [], success: false, total: 0 };
            } catch (error) {
              message.error('获取角色列表失败');
              return { data: [], success: false, total: 0 };
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

        {/* 角色详情 */}
        {detailsValue?.role_id && (
          <Drawer
            key={`${detailsValue.role_id}-${isDetailsViewOpen}`}
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
            title={"角色详情 " + (detailsValue?.role_name || '')}
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
                        if (!detailsValue?.role_id) return;
                        modal.confirm({
                          title: '确认删除',
                          content: '确定要删除该角色吗？',
                          onOk: async () => {
                            try {
                              setDeleteLoading(true);
                              const response = await deleteRolesRoleId({
                                role_id: detailsValue.role_id,
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
              <BetaSchemaForm
                key={`form-${detailsValue.role_id}`}
                layoutType="Form"
                columns={isDetailsEditable ? editFormFields : detailFields}
                readonly={!isDetailsEditable}
                title={detailsValue.role_name}
                initialValues={{
                  ...detailsValue,
                  permissions: detailsValue.permissions?.map(p => p.permission_id),
                }}
                grid={true}
                rowProps={{
                  gutter: [16, 16],
                }}
                colProps={{
                  span: 12,
                }}
                onFinish={handleSaveDetails}
                submitter={false}
                form={editform}
              />
            </Spin>
          </Drawer>
        )}

        {/* 新建角色 */}
        <Modal
          title="新建角色"
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
          <BetaSchemaForm
            layoutType="Form"
            columns={formFields}
            initialValues={createValue}
            grid={true}
            rowProps={{
              gutter: [16, 16],
            }}
            colProps={{
              span: 12,
            }}
            submitter={{
              searchConfig: {
                submitText: '创建',
              },
              submitButtonProps: {
                loading: createLoading,
              },
            }}
            onFinish={async (values: any) => {
              try {
                setCreateLoading(true);
                console.log('提交的表单数据:', values);
                const response = await postRoles({
                  role_name: values.role_name,
                  code: values.code,
                  description: values.description,
                  status: values.status,
                });
                
                console.log('提交到 API 的数据:', {
                  role_name: values.role_name,
                  code: values.code,
                  description: values.description,
                  status: values.status,
                });
                
                if (response.code && response.code >= 200 && response.code < 300) {
                  message.success('创建成功');
                  setState({
                    isCreateModalOpen: false,
                    createValue: {},
                  });
                  if (actionRef.current) {
                    // 设置要高亮的行 ID
                    setHighlightedRowId(response.data?.role_id || null);
                    setIsHighlighted(true);
                    // 重新加载表格
                    actionRef.current.reload();
                    // 3秒后清除高亮状态
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
          />
        </Modal>
      </PageContainer>
    </>
  );
};

export default Page; 