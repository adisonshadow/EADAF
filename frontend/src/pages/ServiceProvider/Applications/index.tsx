import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  FileDoneOutlined,
  PartitionOutlined,
  QuestionCircleOutlined,
  ApiOutlined,
  SecurityScanOutlined,
  UserSwitchOutlined,
  BulbOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import {
  ActionType,
  PageContainer,
  ProColumns,
  ProForm,
  ProFormText,
  ProFormTextArea,
  ProFormSelect,
  ProFormSwitch,
  ProFormDependency,
  ProFormRadio,
} from '@ant-design/pro-components';
import { UrlSyncedProTable } from '@/components/UrlSyncedProTable';
import { useSetState } from "ahooks";
import { Button, Modal, Space, Form, Typography, Tabs, Checkbox, Col, Collapse, Input, Tooltip } from 'antd';
import { message, modal } from '@/utils/antdAppApis';
import { LinkOutlined } from '@ant-design/icons';
import React, { useRef, useState, useMemo, useEffect } from "react";
import { useAIChatPrompts, useChatReference } from '@eadaf/ai-base';
import { buildApplicationPrompts } from '@/ai/pageChatPrompts';
import { useNavigate } from 'react-router-dom';
import { tableColumns, SYSTEM_APPLICATION_CODE } from "./Schemas";
import SsoLoginAsideUpload from '@/components/SsoLoginAsideUpload';
import { BizdataScopePickerModal } from '@/components/BizdataScopePicker';
import AppSecretUsageModal from './AppSecretUsageModal';
import {
  buildApiDataScopePayload,
  parseApiDataScopeValue,
  useApiDomainTreeData,
} from '@/components/ApiDomainTreePicker';
import SearchableScopeTree, { fromApiDomainTree, fromBuiltinApiTree } from '@/components/SearchableScopeTree';
import { getBuiltinApis, type BuiltinApiTreeNode } from '@/services/EADAF/api/builtinApis';
import { getOutboundWebhooks } from '@/services/EADAF/api/outboundWebhooks';
import {
  attachApiServicesToDomainTree,
  buildApiServiceDomainTree,
  collectDomainCodes,
  type ApiServiceDomainTreeItem,
  type ApiServiceListItem,
} from '@/utils/buildApiServiceDomainTree';
import { buildApplicationApiDocsUrl } from '@/utils/applicationApiDocsUrl';
import { getApplications, putApplicationsId, postApplicationsIdGenerateSecret } from '@/services/EADAF/api/applications';
import { isApiSuccess, parseApiListResponse, getApiData } from '@/utils/apiResponse';
import { DEFAULT_PRO_TABLE_OPTIONS } from '@/constants/proTable';
import { useProTableSearchCollapse } from '@/hooks/useProTableSearchCollapse';
import { TableActionButton, TableActions, TABLE_ACTION_COLUMN_BASE } from '@/components/TableActions';
import { augmentColumnsWithChatReference } from '@/utils/augmentColumnsWithChatReference';
import { buildApplicationReference } from '@/ai/chatReferenceBuilders';

const { Text } = Typography;
const PAGE_SIZE: number = 30;

interface ApplicationRecord extends API.Application {
  application_id: string;
  api_connect_config?: API.APIConnectConfig;
  api_data_scope?: API.APIDataScope;
  builtin_api_scope?: API.BuiltinApiScope;
  outbound_webhook_scope?: API.OutboundWebhookScope;
  bizdata_scope_codes?: string[];
}

/** 从 outbound_webhook_scope 解析 Tree 勾选 keys */
function parseOutboundWebhookScopeValue(scope: unknown): string[] {
  if (!scope) return [];
  if (typeof scope !== 'object') return [];
  const record = scope as Record<string, unknown>;
  const domainCodes = Array.isArray(record.domainCodes)
    ? record.domainCodes.map(String).filter(Boolean)
    : [];
  const webhookCodes = Array.isArray(record.webhookCodes)
    ? record.webhookCodes.map(String).filter(Boolean)
    : [];
  return [...domainCodes, ...webhookCodes];
}

/** 将 Tree 勾选 keys 序列化为 outbound_webhook_scope */
function buildOutboundWebhookScopePayload(
  checkedKeys: string[],
  domainCodes: Set<string>,
): API.OutboundWebhookScope {
  const payload = buildApiDataScopePayload(checkedKeys, domainCodes);
  return {
    domainCodes: payload.domainCodes || [],
    ...(payload.serviceCodes?.length ? { webhookCodes: payload.serviceCodes } : { webhookCodes: [] }),
  };
}

/** 预览「跟随本系统域名/IP」时拼出的完整重定向 URI */
function previewSystemHostRedirectUri(suffix: string): string {
  const uri = String(suffix || '').trim();
  if (!uri) return '';
  const { protocol, hostname, host } = window.location;
  if (uri.startsWith(':')) return `${protocol}//${hostname}${uri}`;
  if (uri.startsWith('/')) return `${protocol}//${host}${uri}`;
  return `${protocol}//${hostname}/${uri.replace(/^\//, '')}`;
}

/**
 * 表单项标题行：标题 + 问号提示 + 额外控件（如「启用DEV专用重定向」勾选框）。
 * 复用 antd 的 label 类名，跟其它字段的灰色标题、必填星号保持一致。
 */
const SsoFieldLabel: React.FC<{
  text: string;
  tooltip?: React.ReactNode;
  required?: boolean;
  extra?: React.ReactNode;
}> = ({ text, tooltip, required, extra }) => (
  <div
    className="ant-form-item-label"
    style={{ display: 'flex', alignItems: 'center', gap: 12, maxWidth: '100%', paddingBottom: 8 }}
  >
    <label className={required ? 'ant-form-item-required' : undefined} title={text}>
      {text}
      {tooltip ? (
        <Tooltip title={tooltip}>
          <QuestionCircleOutlined className="ant-form-item-tooltip" />
        </Tooltip>
      ) : null}
    </label>
    {extra}
  </div>
);

/**
 * 一条重定向地址：输入框 + 右侧「自动跟随本系统域名/IP」+ 跟随时的完整地址预览。
 * 生产与 DEV 两行共用，靠字段名区分。
 */
const SsoRedirectUriRow: React.FC<{
  uriName: ['sso_config', string];
  useSystemHostName: ['sso_config', string];
  requiredMessage: string;
}> = ({ uriName, useSystemHostName, requiredMessage }) => {
  const form = Form.useFormInstance();
  const useSystemHost = !!Form.useWatch(useSystemHostName);
  const redirectUri = Form.useWatch(uriName);
  const preview = useSystemHost ? previewSystemHostRedirectUri(redirectUri) : '';
  const skipFirstValidate = useRef(true);

  // 勾选/取消「自动跟随本系统域名/IP」后，地址的合法格式变了：重跑一次校验，别留过期的报错
  useEffect(() => {
    if (skipFirstValidate.current) {
      skipFirstValidate.current = false;
      return;
    }
    const value = form.getFieldValue(uriName);
    if (value === undefined || value === null || value === '') return;
    void form.validateFields([uriName]).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useSystemHost]);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Form.Item
          name={uriName}
          rules={[
            { required: true, message: requiredMessage },
            {
              validator: async (_: unknown, value: string) => {
                const v = String(value || '').trim();
                if (!v) return;
                if (useSystemHost) {
                  if (/^https?:\/\//i.test(v)) {
                    throw new Error('已勾选「自动跟随本系统域名/IP」时，请只填端口路径或本机路径，不要填完整域名');
                  }
                  if (v.startsWith(':')) {
                    if (!/^:\d{1,5}(\/[^\s]*)?$/.test(v)) {
                      throw new Error('格式应为 :端口/路径，例如 :13303/auth/callback');
                    }
                    return;
                  }
                  if (v.startsWith('/')) return;
                  throw new Error('请填写以 :端口 或 / 开头的路径后缀');
                }
                try {
                  const u = new URL(v);
                  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
                    throw new Error('invalid');
                  }
                } catch {
                  throw new Error('请输入完整的 http(s) 回调地址');
                }
              },
            },
          ]}
          style={{ marginBottom: 0 }}
        >
          <Input
            allowClear
            placeholder={
              useSystemHost
                ? ':13303/auth/callback 或 /auth/callback'
                : 'https://your-app.com/auth/callback'
            }
          />
        </Form.Item>
        {useSystemHost && preview ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            预览（当前访问）：{' '}
            <Typography.Text code copyable={{ text: preview }} style={{ fontSize: 12 }}>
              {preview}
            </Typography.Text>
          </Typography.Text>
        ) : null}
      </div>
      <Form.Item
        name={useSystemHostName}
        valuePropName="checked"
        style={{ marginBottom: 0, flex: 'none' }}
      >
        <Checkbox style={{ whiteSpace: 'nowrap' }}>自动跟随本系统域名/IP</Checkbox>
      </Form.Item>
    </div>
  );
};

const SsoRedirectUriFields: React.FC = () => {
  const useSystemHost = !!Form.useWatch(['sso_config', 'redirect_uri_use_system_host']);
  const devEnabled = !!Form.useWatch(['sso_config', 'redirect_uri_dev_enabled']);

  return (
    <Col span={24}>
      <Form.Item style={{ marginBottom: 24 }}>
        <SsoFieldLabel
          required
          text="重定向 URI"
          tooltip={
            useSystemHost
              ? '只填端口与路径（或本机路径）。登录/跳转时按当前访问本系统的域名或 IP 自动拼完整地址，适配客户环境 IP 常变。'
              : 'SSO 登录成功后，将携带 Token 跳转到此地址（POST 或 302 方式由跳转模式决定）'
          }
          extra={
            <Form.Item
              name={['sso_config', 'redirect_uri_dev_enabled']}
              valuePropName="checked"
              noStyle
            >
              <Checkbox>启用DEV专用重定向</Checkbox>
            </Form.Item>
          }
        />
        <SsoRedirectUriRow
          uriName={['sso_config', 'redirect_uri']}
          useSystemHostName={['sso_config', 'redirect_uri_use_system_host']}
          requiredMessage="请输入重定向 URI"
        />
        {devEnabled ? (
          <div style={{ marginTop: 16 }}>
            <SsoFieldLabel
              required
              text="DEV 专用重定向 URI"
              tooltip="平台跑在开发模式（后端 NODE_ENV=development，即 npm run dev / pm2dev）时，登录成功跳到这里；服务器部署仍用上面的重定向 URI。开发机与部署环境的地址（尤其端口）常不同，两套都填好就不用每次改。"
            />
            <SsoRedirectUriRow
              uriName={['sso_config', 'redirect_uri_dev']}
              useSystemHostName={['sso_config', 'redirect_uri_dev_use_system_host']}
              requiredMessage="请输入 DEV 专用重定向 URI"
            />
          </div>
        ) : null}
      </Form.Item>
    </Col>
  );
};

const SsoAsideAssetField: React.FC = () => {
  const kind = Form.useWatch(['sso_config', 'login_page', 'aside_kind']) === 'image' ? 'image' : 'lottie';
  return (
    <Col span={24}>
      <Form.Item
        name={['sso_config', 'login_page', kind === 'image' ? 'aside_image' : 'aside_lottie']}
        label={kind === 'image' ? '侧边栏图片' : '侧边栏 Lottie 动画'}
        style={{ marginBottom: 24 }}
      >
        <SsoLoginAsideUpload kind={kind} />
      </Form.Item>
    </Col>
  );
};

const Page: React.FC = () => {
  const actionRef = useRef<ActionType | undefined>(undefined);
  const navigate = useNavigate();
  const [apiConfigModalVisible, setApiConfigModalVisible] = useState(false);
  const [ssoConfigModalVisible, setSsoConfigModalVisible] = useState(false);
  const [keyManagementModalVisible, setKeyManagementModalVisible] = useState(false);
  const [secretUsageModalVisible, setSecretUsageModalVisible] = useState(false);
  const [scopeModalVisible, setScopeModalVisible] = useState(false);
  const [scopeSaving, setScopeSaving] = useState(false);
  const [currentApplication, setCurrentApplication] = useState<ApplicationRecord | null>(null);
  const [apiConfigForm] = Form.useForm();
  const apiEnabledInConfig = Form.useWatch('api_enabled', apiConfigForm);
  const [ssoConfigForm] = Form.useForm();
  const [apiScopeSelection, setApiScopeSelection] = useState<string[]>([]);
  const [builtinApiSelection, setBuiltinApiSelection] = useState<string[]>([]);
  const [outboundWebhookSelection, setOutboundWebhookSelection] = useState<string[]>([]);
  const [builtinApiTree, setBuiltinApiTree] = useState<BuiltinApiTreeNode[]>([]);
  const [builtinApiTreeLoading, setBuiltinApiTreeLoading] = useState(false);
  const [outboundWebhookItems, setOutboundWebhookItems] = useState<ApiServiceListItem[]>([]);
  const [outboundWebhookTreeLoading, setOutboundWebhookTreeLoading] = useState(false);
  const [activeApiTab, setActiveApiTab] = useState<'business' | 'builtin' | 'outbound'>('business');
  // 业务 API 配置：展示具体 API（叶子），域节点可勾选并级联到子节点
  const apiDomainTree = useApiDomainTreeData({
    showApiSelectable: true,
    enabled: apiConfigModalVisible,
  });

  // 内置 API 树数据（自行加载，供 SearchableScopeTree 使用）
  useEffect(() => {
    if (!apiConfigModalVisible) return;
    let cancelled = false;
    const load = async () => {
      setBuiltinApiTreeLoading(true);
      try {
        const res = await getBuiltinApis();
        if (!cancelled && isApiSuccess(res)) {
          setBuiltinApiTree(getApiData<{ tree: BuiltinApiTreeNode[] }>(res)?.tree || []);
        }
      } catch {
        if (!cancelled) setBuiltinApiTree([]);
      } finally {
        if (!cancelled) setBuiltinApiTreeLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [apiConfigModalVisible]);

  // 提交外部 API 树（按 code 域分层，样式对齐业务 API）
  useEffect(() => {
    if (!apiConfigModalVisible) return;
    let cancelled = false;
    const load = async () => {
      setOutboundWebhookTreeLoading(true);
      try {
        const res = await getOutboundWebhooks({ size: -1 });
        if (!cancelled && isApiSuccess(res)) {
          const items = getApiData<{ items?: API.OutboundWebhook[] }>(res)?.items || [];
          setOutboundWebhookItems(
            items
              .filter((w) => w.code && w.status !== 'deleted')
              .map((w) => ({
                id: w.id || w.code!,
                code: w.code!,
                name: w.name || w.code,
                status: w.status,
              })),
          );
        }
      } catch {
        if (!cancelled) setOutboundWebhookItems([]);
      } finally {
        if (!cancelled) setOutboundWebhookTreeLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [apiConfigModalVisible]);

  const businessScopeTree = useMemo(
    () => fromApiDomainTree(apiDomainTree.treeData),
    [apiDomainTree.treeData],
  );
  const builtinScopeTree = useMemo(() => fromBuiltinApiTree(builtinApiTree), [builtinApiTree]);

  const outboundDomainTree = useMemo(() => {
    const domains = buildApiServiceDomainTree(outboundWebhookItems);
    return attachApiServicesToDomainTree(domains, outboundWebhookItems);
  }, [outboundWebhookItems]);
  const outboundScopeTree = useMemo(
    () => fromApiDomainTree(outboundDomainTree as ApiServiceDomainTreeItem[]),
    [outboundDomainTree],
  );
  const outboundDomainCodes = useMemo(
    () => collectDomainCodes(outboundDomainTree as ApiServiceDomainTreeItem[]),
    [outboundDomainTree],
  );
  const { references } = useChatReference();
  const chatPrompts = useMemo(() => buildApplicationPrompts(references), [references]);
  useAIChatPrompts(chatPrompts);
  const search = useProTableSearchCollapse('service-provider.applications', { labelWidth: 120 });
  const apiDocsPreviewUrl = useMemo(
    () => (currentApplication?.code ? buildApplicationApiDocsUrl(currentApplication.code) : ''),
    [currentApplication?.code],
  );

  const [state, setState] = useSetState<any>({
    tableColumns: augmentColumnsWithChatReference<ApplicationRecord>(
      [
        ...(tableColumns as ProColumns<ApplicationRecord>[]),
        {
      ...TABLE_ACTION_COLUMN_BASE,
      dataIndex: "option",
      width: 180,
      render: (_: unknown, record: ApplicationRecord) => (
        <TableActions>
          <TableActionButton
            title="编辑"
            key="edit"
            icon={<EditOutlined />}
            onClick={() => navigate(`/service_provider/${record.application_id}/edit`)}
          />
          <TableActionButton
            title="顶层SKILL"
            key="top-level-skill"
            icon={<BulbOutlined />}
            onClick={() => navigate(`/service_provider/${record.application_id}/top-level-skill`)}
          />
          <TableActionButton
            title="密钥管理"
            key="key-management"
            icon={<SecurityScanOutlined />}
            onClick={() => {
              setCurrentApplication(record);
              setKeyManagementModalVisible(true);
            }}
          />
          <TableActionButton
            title="Scope 设置"
            key="scope-config"
            icon={<PartitionOutlined />}
            disabled={record.code === SYSTEM_APPLICATION_CODE}
            onClick={() => {
              setCurrentApplication(record);
              setScopeModalVisible(true);
            }}
          />
          <TableActionButton
            title="API 配置"
            key="api-config"
            icon={<ApiOutlined />}
            disabled={record.code === SYSTEM_APPLICATION_CODE}
            onClick={() => {
              setCurrentApplication(record);
              setApiScopeSelection(parseApiDataScopeValue(record.api_data_scope));
              setBuiltinApiSelection(record.builtin_api_scope?.permissionCodes ?? []);
              setOutboundWebhookSelection(parseOutboundWebhookScopeValue(record.outbound_webhook_scope));
              setActiveApiTab('business');
              apiConfigForm.setFieldsValue({
                api_enabled: record.api_enabled,
              });
              setApiConfigModalVisible(true);
            }}
          />
          <TableActionButton
            title="SSO 配置"
            key="sso-config"
            icon={<UserSwitchOutlined />}
            disabled={record.code === SYSTEM_APPLICATION_CODE}
            onClick={() => {
              setCurrentApplication(record);
        ssoConfigForm.setFieldsValue({
          sso_enabled: record.sso_enabled,
          sso_config: {
            ...record.sso_config,
            redirect_mode: record.sso_config?.redirect_mode ?? 'POST_REDIRECT',
            redirect_uri_use_system_host: !!record.sso_config?.redirect_uri_use_system_host,
            redirect_uri_dev_enabled: !!record.sso_config?.redirect_uri_dev_enabled,
            redirect_uri_dev_use_system_host: !!record.sso_config?.redirect_uri_dev_use_system_host,
            // 未配置过时按「需要验证」展示，与平台默认一致
            login_verify_enabled: record.sso_config?.login_verify_enabled ?? true,
            base_url: window.location.origin,
            client_id: record.code,
            issuer: window.location.origin,
            login_page: {
              theme: 'light',
              aside_kind: 'lottie',
              large_text: false,
              ...record.sso_config?.login_page,
            },
          },
        });

              setSsoConfigModalVisible(true);
            }}
          />
          <TableActionButton
            title="删除"
            key="delete"
            danger
            icon={<DeleteOutlined />}
            disabled={record.code === SYSTEM_APPLICATION_CODE}
            onClick={() => {
              if (record.code === SYSTEM_APPLICATION_CODE) {
                message.warning('系统内置应用不可删除');
                return;
              }
              navigate(`/service_provider/${record.application_id}/delete`);
            }}
          />
        </TableActions>
      ),
    },
      ],
      'name',
      buildApplicationReference,
    ),
  });

  const { tableColumns: columns } = state;

  const saveApiConfig = async (values: { api_enabled?: boolean }) => {
    try {
      const response = await putApplicationsId(
        { id: currentApplication?.application_id || '' },
        {
          api_enabled: values.api_enabled,
          api_data_scope: buildApiDataScopePayload(apiScopeSelection, apiDomainTree.domainCodes),
          // 系统应用拥有全部内置 API，不发送 builtin_api_scope（避免清空语义混淆）
          ...(currentApplication?.code === SYSTEM_APPLICATION_CODE
            ? {}
            : { builtin_api_scope: { permissionCodes: builtinApiSelection } }),
          outbound_webhook_scope: buildOutboundWebhookScopePayload(
            outboundWebhookSelection,
            outboundDomainCodes,
          ),
        }
      );

      if (isApiSuccess(response)) {
        message.success('保存成功');
        setApiConfigModalVisible(false);
        if (actionRef.current) {
          actionRef.current.reload();
        }
      } else {
        message.error(response.message || '保存失败');
      }
    } catch (error) {
      message.error('保存失败');
    }
  };

  const handleSaveApiConfig = async () => {
    try {
      if (!currentApplication) return;
      
      const values = await apiConfigForm.validateFields();
      
      // 正常保存
      await saveApiConfig(values);
    } catch (error) {
      message.error('保存失败');
    }
  };

  const handleGenerateAppSecret = async () => {
    try {
      if (!currentApplication) return;

      const res = await postApplicationsIdGenerateSecret(
        { id: currentApplication.application_id },
        {}
      );

      if (isApiSuccess(res)) {
        const secret = getApiData<{ app_secret?: string }>(res)?.app_secret;
        if (secret) {
          setCurrentApplication({
            ...currentApplication,
            api_connect_config: {
              app_secret: secret,
            },
            sso_config: {
              ...currentApplication.sso_config,
              protocol: 'OIDC',
              redirect_uri: currentApplication.sso_config?.redirect_uri || '',
              client_secret: secret,
            },
          });
          message.success('生成统一密钥成功');
          if (actionRef.current) {
            actionRef.current.reload();
          }
        } else {
          message.error('生成失败');
        }
      } else {
        message.error((res as { message?: string }).message || '生成失败');
      }
    } catch (e) {
      message.error('生成失败');
    }
  };

  const handleSaveSsoConfig = async () => {
    try {
      if (!currentApplication) return;
      
      const values = await ssoConfigForm.validateFields();
      
      // 构建SSO配置，包含自动生成的字段
      const ssoConfig = {
        ...currentApplication.sso_config,
        ...values.sso_config,
        protocol: 'OIDC',
        base_url: window.location.origin,
        client_id: currentApplication.code,
        issuer: window.location.origin,
        client_secret: currentApplication.sso_config?.client_secret
          || currentApplication.api_connect_config?.app_secret,
        redirect_uri_use_system_host: !!values.sso_config?.redirect_uri_use_system_host,
        redirect_uri_dev_enabled: !!values.sso_config?.redirect_uri_dev_enabled,
        redirect_uri_dev_use_system_host: !!values.sso_config?.redirect_uri_dev_use_system_host,
      };
      
      const response = await putApplicationsId(
        { id: currentApplication.application_id || '' },
        {
          sso_enabled: values.sso_enabled,
          sso_config: ssoConfig,
        }
      );

      if (isApiSuccess(response)) {
        message.success('保存成功');
        setSsoConfigModalVisible(false);
        if (actionRef.current) {
          actionRef.current.reload();
        }
      } else {
        message.error(response.message || '保存失败');
      }
    } catch (error) {
      message.error('保存失败');
    }
  };

  return (
    <PageContainer pageHeaderRender={() => {
      return <></>;
    }}>
      <UrlSyncedProTable<ApplicationRecord, API.getApplicationsParams, API.Application>
        defaultPageSize={PAGE_SIZE}
        headerTitle="应用列表"
        actionRef={actionRef}
        rowKey="application_id"
        scroll={{ x: 'max-content' }}
        search={search}
        toolBarRender={() => [
          <Button
            key="button"
            icon={<PlusOutlined />}
            type="primary" className="btn-gradient-primary"
            onClick={() => navigate('/service_provider/create')}
          >
            新建
          </Button>,
        ]}
        request={async (params) => {
          const { current, pageSize, ...rest } = params;
          try {
            const response = await getApplications({
              page: current,
              size: pageSize,
              ...rest,
            });
            const { items, total, success } = parseApiListResponse<API.Application>(response);
            const mappedItems = items.map((item: API.Application) => ({
              ...item,
              application_id: item.application_id || '',
          sso_config: item.sso_config ? {
            ...item.sso_config,
            redirect_uri: item.sso_config.redirect_uri,
            redirect_mode: item.sso_config.redirect_mode || 'POST_REDIRECT',
            salt: item.sso_config.salt,
            base_url: item.sso_config.base_url,
            client_id: item.sso_config.client_id,
            client_secret: item.sso_config.client_secret,
            issuer: item.sso_config.issuer,
            additional_params: item.sso_config.additional_params,
          } : undefined,
              api_connect_config: item.api_connect_config,
              api_data_scope: item.api_data_scope,
              builtin_api_scope: item.builtin_api_scope,
              outbound_webhook_scope: item.outbound_webhook_scope,
            } as ApplicationRecord));
            return {
              data: mappedItems,
              success,
              total,
            };
          } catch (error) {
            return {
              data: [],
              success: false,
              total: 0,
            };
          }
        }}
        columns={columns}
        options={DEFAULT_PRO_TABLE_OPTIONS}
      />

      <Modal
        title="API 配置"
        open={apiConfigModalVisible}
        onCancel={() => setApiConfigModalVisible(false)}
        width={640}
        onOk={handleSaveApiConfig}
        okText="保存"
        cancelText="取消"
        centered
        destroyOnHidden
      >
        <ProForm
          form={apiConfigForm}
          submitter={false}
          layout="horizontal"
        >
          <ProFormSwitch
            name="api_enabled"
            label="启用 API"
          />
          {apiEnabledInConfig ? (
            <Tabs
              activeKey={activeApiTab}
              onChange={(k) => setActiveApiTab(k as 'business' | 'builtin' | 'outbound')}
              items={[
                {
                  key: 'business',
                  label: '业务API配置',
                  children: (
                    <SearchableScopeTree
                      treeData={businessScopeTree}
                      value={apiScopeSelection}
                      onChange={setApiScopeSelection}
                      loading={apiDomainTree.loading}
                      valueStrategy="all"
                      emptyText="暂无 API 域，请先在 API 服务中创建服务"
                      searchPlaceholder="检索域 / API 名称"
                    />
                  ),
                },
                ...(currentApplication?.code === SYSTEM_APPLICATION_CODE
                  ? []
                  : [
                      {
                        key: 'builtin',
                        label: '内置API配置',
                        children: (
                          <SearchableScopeTree
                            treeData={builtinScopeTree}
                            value={builtinApiSelection}
                            onChange={setBuiltinApiSelection}
                            loading={builtinApiTreeLoading}
                            valueStrategy="leaf"
                            emptyText="暂无内置 API 清单"
                            searchPlaceholder="检索内置 API 名称 / code"
                          />
                        ),
                      },
                    ]),
                {
                  key: 'outbound',
                  label: '提交外部API配置',
                  children: (
                    <SearchableScopeTree
                      treeData={outboundScopeTree}
                      value={outboundWebhookSelection}
                      onChange={setOutboundWebhookSelection}
                      loading={outboundWebhookTreeLoading}
                      valueStrategy="all"
                      emptyText="暂无提交外部API，请先在「提交外部API」中创建"
                      searchPlaceholder="检索域 / 提交外部API 名称"
                    />
                  ),
                },
              ]}
            />
          ) : null}
        </ProForm>
        {apiEnabledInConfig && apiDocsPreviewUrl ? (
          <div style={{ marginTop: 8 }}>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>
              <span style={{ marginRight: 8 }}>API 地址</span>
              <Typography.Link href={apiDocsPreviewUrl} target="_blank" rel="noopener noreferrer">
                <EyeOutlined /> 打开 API 文档
              </Typography.Link>
            </div>
            <Space orientation="vertical" size={4} style={{ width: '100%' }}>
              <Typography.Paragraph copyable={{ text: apiDocsPreviewUrl }} style={{ marginBottom: 0 }}>
                <LinkOutlined /> {apiDocsPreviewUrl}
              </Typography.Paragraph>
            </Space>
          </div>
        ) : null}
      </Modal>

      <Modal
        title={currentApplication?.code ? `${currentApplication.code} SSO 配置` : 'SSO 配置'}
        open={ssoConfigModalVisible}
        onCancel={() => setSsoConfigModalVisible(false)}
        width={800}
        onOk={handleSaveSsoConfig}
        okText="保存"
        cancelText="取消"
      >
        <ProForm
          form={ssoConfigForm}
          submitter={false}
          grid={true}
          rowProps={{
            gutter: [16, 16],
          }}
          colProps={{
            span: 12,
          }}
        >
          <ProFormSwitch
            name="sso_enabled"
            label="启用 SSO"
            colProps={{
              span: 24,
            }}
          />
          <ProFormDependency name={['sso_enabled']}>
            {({ sso_enabled }) => {
              if (!sso_enabled) return null;
              return (
                <Col span={24}>
                  <Collapse
                    defaultActiveKey={['redirect', 'login']}
                    style={{ marginBottom: 8 }}
                    items={[
                      {
                        key: 'redirect',
                        label: '重定向',
                        children: (
                          <>
                            <SsoRedirectUriFields />
                            <ProFormSelect
                              name={['sso_config', 'redirect_mode']}
                              label="跳转模式"
                              colProps={{ span: 24 }}
                              valueEnum={{
                                'POST_REDIRECT': 'POST 跳转',
                                'HEADER_REDIRECT': '302 重定向 + URL参数',
                              }}
                              initialValue="POST_REDIRECT"
                              tooltip="POST跳转模式：JWT信息在请求体中传递；302重定向模式：JWT信息在URL参数中传递"
                            />
                            <ProFormTextArea
                              name={['sso_config', 'additional_params']}
                              label="额外参数"
                              placeholder='{"scope": "openid profile email", "response_type": "code"}'
                              tooltip="其他SSO协议特定的参数，JSON格式"
                              colProps={{ span: 24 }}
                              rows={3}
                            />
                          </>
                        ),
                      },
                      {
                        key: 'login',
                        label: '登录页面',
                        children: (
                          <>
                            <ProFormSwitch
                              name={['sso_config', 'login_verify_enabled']}
                              label="登录时验证是人类"
                              colProps={{ span: 24 }}
                              tooltip="开启后登录页需滑动验证通过才能登录；内部应用可关闭，登录将直接进行（密码校验与登录失败次数限制不受影响）"
                            />
                            <ProFormText
                              name={['sso_config', 'login_page', 'subtitle']}
                              label="登录页副标题"
                              placeholder="选填，不填则不显示"
                              tooltip="显示在应用名称下方。不填写则不展示副标题，不会使用应用描述。"
                              colProps={{ span: 24 }}
                              fieldProps={{ maxLength: 80, showCount: true }}
                            />
                            <ProFormRadio.Group
                              name={['sso_config', 'login_page', 'theme']}
                              label="页面主题"
                              radioType="button"
                              options={[
                                { label: '浅色', value: 'light' },
                                { label: '深色', value: 'dark' },
                                { label: '跟随系统', value: 'system' },
                              ]}
                              tooltip="SSO 登录页的配色：浅色、深色，或跟随设备系统外观"
                              colProps={{ span: 24 }}
                            />
                            <ProFormRadio.Group
                              name={['sso_config', 'login_page', 'aside_kind']}
                              label="左侧侧边栏素材"
                              radioType="button"
                              options={[
                                { label: 'Lottie 动画', value: 'lottie' },
                                { label: '图片', value: 'image' },
                              ]}
                              tooltip="选择上传 Lottie JSON 动画，或静态图片（支持 SVG）"
                              colProps={{ span: 24 }}
                            />
                            <SsoAsideAssetField />
                            <Col span={24}>
                              <Form.Item
                                name={['sso_config', 'login_page', 'large_text']}
                                valuePropName="checked"
                                style={{ marginBottom: 24 }}
                              >
                                <Checkbox>使用更大的文字（适合 Pad 显示，文字放大一号）</Checkbox>
                              </Form.Item>
                            </Col>
                          </>
                        ),
                      },
                    ]}
                  />
                </Col>
              );
            }}
          </ProFormDependency>
        </ProForm>
      </Modal>

      <Modal
        title="密钥管理"
        open={keyManagementModalVisible}
        onCancel={() => setKeyManagementModalVisible(false)}
        width={600}
        footer={null}
      >
        <div style={{ padding: '20px 0' }}>
          
          <div style={{ marginBottom: 20 }}>
            {(currentApplication?.api_connect_config?.app_secret
              || currentApplication?.sso_config?.client_secret) ? (
              <>
                <h5><FileDoneOutlined /> 已经生成的密钥</h5>
                <Text
                  copyable
                  style={{ fontSize: 14 }}
                >
                  {currentApplication?.api_connect_config?.app_secret
                    || currentApplication?.sso_config?.client_secret}
                </Text>
              </>
            ) : null}
            <div style={{ marginTop: 10 }}>
              <Button 
                type="primary" 
                onClick={handleGenerateAppSecret}
              >
                生成密钥
              </Button>
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: '#666' }}>
              此密钥同时用于API认证和SSO认证
            </div>
            <div style={{ marginTop: 12 }}>
              <Button icon={<QuestionCircleOutlined />} onClick={() => setSecretUsageModalVisible(true)}>
                密钥使用说明
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      <AppSecretUsageModal
        open={secretUsageModalVisible}
        application={currentApplication}
        onClose={() => setSecretUsageModalVisible(false)}
      />

      <BizdataScopePickerModal
        open={scopeModalVisible}
        title={currentApplication ? `Scope 设置 - ${currentApplication.name}` : 'Scope 设置'}
        value={currentApplication?.bizdata_scope_codes || []}
        onCancel={() => setScopeModalVisible(false)}
        onOk={async (codes) => {
          if (!currentApplication?.application_id) return;
          try {
            setScopeSaving(true);
            const res = await putApplicationsId(
              { id: currentApplication.application_id },
              { bizdata_scope_codes: codes },
            );
            if (isApiSuccess(res)) {
              message.success('Scope 已保存');
              setScopeModalVisible(false);
              actionRef.current?.reload();
            } else {
              message.error('保存失败');
            }
          } catch {
            message.error('保存失败');
          } finally {
            setScopeSaving(false);
          }
        }}
      />
    </PageContainer>
  );
};

export default Page; 