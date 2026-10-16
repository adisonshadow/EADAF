import type { MixedFieldType } from "@/types/schema";
import UUIDDisplay from "@/components/UUIDDisplay";
import ApplicationLogoUpload from "@/components/ApplicationLogoUpload";
import TitleWithHelp from '@/components/TitleWithHelp';
import { Button, Modal, Space, Tooltip } from 'antd';
import { message, modal } from '@/utils/antdAppApis';
import { QuestionCircleOutlined } from "@ant-design/icons";
import { useState, useMemo } from "react";
import { Form } from 'antd';
import { postApplicationsIdGenerateSecret } from "@/services/EADAF/api/applications";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const APPLICATION_ID_HELP = (
  <div style={{ maxWidth: 360 }}>
    <p style={{ margin: '0 0 8px' }}>
      应用 ID 为标准 UUID 格式，例如 550e8400-e29b-41d4-a716-446655440000。
    </p>
    <p style={{ margin: 0 }}>
      须全局唯一；开启「是否自动创建唯一ID」时由系统自动生成，无需手动填写。
    </p>
  </div>
);

interface FormValues {
  sso_enabled?: boolean;
  api_enabled?: boolean;
  sso_config?: {
    redirect_uri: string;
    redirect_uri_use_system_host?: boolean;
    redirect_uri_dev_enabled?: boolean;
    redirect_uri_dev?: string;
    redirect_uri_dev_use_system_host?: boolean;
    redirect_mode?: 'POST_REDIRECT' | 'HEADER_REDIRECT';
    salt?: string;
    base_url?: string;
    client_id?: string;
    client_secret?: string;
    issuer?: string;
    frontend_url?: string;
    additional_params?: Record<string, any>;
  };
  api_connect_config?: Record<string, any>;
  api_data_scope?: Record<string, any>;
}

// 系统内置应用缩写，不可删除
export const SYSTEM_APPLICATION_CODE = 'EADAF';

import { booleanEnabledEnum, enableDisableStatusEnum } from '@/enums';

// 基础字段定义
const baseFields: MixedFieldType[] = [
  {
    title: "应用ID",
    dataIndex: "application_id",
    valueType: 'text',
    copyable: true,
    hideInSearch: true,
    ifShowInTable: true,
    ifShowInDetail: true,
    ifShowInForm: false,
    readonly: true,
    width: 90,
  },
  {
    title: "应用全称",
    dataIndex: "name",
    formItemProps: {
      rules: [
        { required: true, message: '请输入应用全称' },
        { min: 2, message: '应用全称至少2个字符' },
        { max: 50, message: '应用全称最多50个字符' },
      ]
    },
    ifShowInTable: true,
    ifShowInDetail: true,
    ifShowInForm: true,
    width: 150,
  },
  {
    title: "缩写简称",
    dataIndex: "code",
    formItemProps: {
      rules: [
        { required: true, message: '请输入缩写简称' },
        { pattern: /^[a-zA-Z0-9_-]+$/, message: '缩写简称只能包含字母、数字、下划线和连字符' },
      ]
    },
    ifShowInTable: true,
    ifShowInDetail: true,
    ifShowInForm: true,
    width: 120,
  },
  {
    title: "应用 Logo",
    dataIndex: "logo_url",
    valueType: 'text',
    ifShowInTable: false,
    ifShowInDetail: true,
    ifShowInForm: true,
    width: 180,
    renderFormItem: () => <ApplicationLogoUpload />,
  },
  {
    title: "状态",
    dataIndex: "status",
    valueType: 'select',
    valueEnum: enableDisableStatusEnum,
    ifShowInTable: true,
    ifShowInDetail: true,
    ifShowInForm: true,
    width: 100,
  },
  {
    title: "描述",
    dataIndex: "description",
    valueType: 'textarea',
    ifShowInTable: false,
    ifShowInDetail: true,
    ifShowInForm: true,
    width: 200,
  },
  {
    title: "SSO 状态",
    dataIndex: "sso_enabled",
    valueType: 'select',
    valueEnum: booleanEnabledEnum,
    ifShowInTable: true,
    ifShowInDetail: false,
    ifShowInForm: false,
    width: 100,
  },
  {
    title: "API 状态",
    dataIndex: "api_enabled",
    valueType: 'select',
    valueEnum: booleanEnabledEnum,
    ifShowInTable: true,
    ifShowInDetail: false,
    ifShowInForm: false,
    width: 100,
  },
  {
    title: "创建时间",
    dataIndex: "created_at",
    valueType: 'dateTime',
    readonly: true,
    hideInSearch: true,
    ifShowInTable: false,
    ifShowInDetail: true,
    ifShowInForm: false,
    width: 180,
  },
  {
    title: "更新时间",
    dataIndex: "updated_at",
    valueType: 'dateTime',
    readonly: true,
    hideInSearch: true,
    ifShowInTable: true,
    ifShowInDetail: true,
    ifShowInForm: false,
    width: 180,
  },
];

// 导出表格列配置
export const tableColumns = baseFields
  .filter(field => field.ifShowInTable)
  .map(field => {
    if (field.dataIndex === 'application_id') {
      return {
        ...field,
        width: field.width,
        render: (text: any, record: any) => {
          const application_id = record.application_id;
          if (!application_id || application_id === '') return null;
          return <UUIDDisplay uuid={String(application_id)} />;
        },
      };
    }
    if (['name', 'code'].includes(field.dataIndex as string)) {
      return {
        ...field,
        width: field.width,
        filters: false,
        onFilter: true,
        filterMode: 'menu',
        filterSearch: true,
      };
    }
    if (['status'].includes(field.dataIndex as string)) {
      return {
        ...field,
        width: field.width,
        filters: true,
        onFilter: true,
        filterMode: 'menu',
        filterSearch: true,
      };
    }
    return {
      ...field,
      width: field.width,
    };
  });

// 导出详情表单列配置
export const applicationDetailFormColumns = baseFields
  .filter(field => field.ifShowInDetail)
  .map(field => {
    const { width, ...rest } = field;
    return {
      ...rest,
    };
  });

// 导出编辑表单列配置
export const applicationEditFormColumns = baseFields
  .filter(field => field.ifShowInForm)
  .map(field => {
    const { width, ...rest } = field;
    return {
      ...rest,
    };
  });

// 新建应用表单（含 ID 自动创建选项）
export const applicationCreateFormColumns = [
  {
    title: '是否自动创建唯一ID',
    dataIndex: 'auto_create_application_id',
    valueType: 'switch' as const,
    initialValue: true,
    colProps: { span: 12 },
    fieldProps: {
      checkedChildren: '是',
      unCheckedChildren: '否',
    },
  },
  {
    valueType: 'dependency' as const,
    name: ['auto_create_application_id'],
    columns: ({ auto_create_application_id }: { auto_create_application_id?: boolean }) => {
      if (auto_create_application_id !== false) return [];
      return [
        {
          title: <TitleWithHelp title="应用ID" help={APPLICATION_ID_HELP} />,
          dataIndex: 'application_id',
          valueType: 'text' as const,
          colProps: { span: 12 },
          formItemProps: {
            rules: [
              { required: true, message: '请输入应用 ID' },
              { pattern: UUID_PATTERN, message: '请输入有效的 UUID 格式' },
            ],
          },
          fieldProps: {
            placeholder: '550e8400-e29b-41d4-a716-446655440000',
          },
        },
      ];
    },
  },
  ...applicationEditFormColumns,
];

const Page: React.FC = () => {
  const [form] = Form.useForm();
  const [helpModalVisible, setHelpModalVisible] = useState(false);

  const fieldDefinitions = useMemo(() => {
    return [
      ...baseFields,
      {
        title: "SSO 配置",
        dataIndex: "sso_config",
        valueType: 'group',
        ifShowInTable: false,
        ifShowInDetail: true,
        ifShowInForm: true,
        colProps: {
          span: 24,
        },
        columns: [
          {
            title: "启用 SSO",
            dataIndex: "sso_enabled",
            valueType: 'switch',
            colProps: {
              span: 24,
            },
          },
          {
            valueType: 'dependency',
            name: ['sso_enabled'],
            columns: ({ sso_enabled }: { sso_enabled: boolean }) => {
              return sso_enabled
                ? [
                    {
                      title: "Salt",
                      dataIndex: ["sso_config", "salt"],
                      valueType: 'text',
                      formItemProps: {
                        rules: [{ required: true, message: '请输入 Salt' }]
                      },
                      tooltip: "用于JWT签名的盐值，请妥善保管"
                    },
                    {
                      title: "重定向 URI",
                      dataIndex: ["sso_config", "redirect_uri"],
                      valueType: 'text',
                      formItemProps: {
                        rules: [{ required: true, message: '请输入重定向 URI' }]
                      }
                    },
                    {
                      title: "SSO系统URL",
                      dataIndex: ["sso_config", "base_url"],
                      valueType: 'text',
                      tooltip: "统一鉴权系统的基础URL"
                    },
                    {
                      title: "客户端ID",
                      dataIndex: ["sso_config", "client_id"],
                      valueType: 'text',
                      tooltip: "OIDC客户端标识符"
                    },
                    {
                      title: "客户端密钥",
                      dataIndex: ["sso_config", "client_secret"],
                      valueType: 'text',
                      tooltip: "OIDC客户端密钥"
                    },
                    {
                      title: "发行者URL",
                      dataIndex: ["sso_config", "issuer"],
                      valueType: 'text',
                      tooltip: "OIDC发行者URL"
                    },
                    {
                      title: "跳转模式",
                      dataIndex: ["sso_config", "redirect_mode"],
                      valueType: 'select',
                      valueEnum: {
                        'POST_REDIRECT': 'POST 跳转',
                        'HEADER_REDIRECT': '302 重定向 + URL参数',
                      },
                      initialValue: 'POST_REDIRECT',
                      tooltip: "POST跳转模式：JWT信息在请求体中传递；302重定向模式：JWT信息在URL参数中传递"
                    },
                    {
                      title: "额外参数",
                      dataIndex: ["sso_config", "additional_params"],
                      valueType: 'jsonCode',
                      colProps: {
                        span: 24,
                      },
                    },
                  ]
                : [];
            },
          },
        ],
      },
      {
        title: "API 配置",
        dataIndex: "api_config",
        valueType: 'group',
        ifShowInTable: false,
        ifShowInDetail: true,
        ifShowInForm: true,
        colProps: {
          span: 24,
        },
        columns: [
          {
            title: "启用 API",
            dataIndex: "api_enabled",
            valueType: 'switch',
            colProps: {
              span: 24,
            },
          },
          {
            valueType: 'dependency',
            name: ['api_enabled'],
            columns: ({ api_enabled }: { api_enabled: boolean }) => {
              return api_enabled
                ? [
                    {
                      title: "连接配置",
                      dataIndex: "api_connect_config",
                      valueType: 'group',
                      colProps: {
                        span: 24,
                      },
                      columns: [
                        {
                          title: "App Key",
                          dataIndex: ["api_connect_config", "app_key"],
                          valueType: 'text',
                          readonly: true,
                          colProps: {
                            span: 12,
                          },
                        },
                        {
                          title: "Salt",
                          dataIndex: ["api_connect_config", "salt"],
                          valueType: 'text',
                          colProps: {
                            span: 12,
                          },
                        },
                        {
                          title: "App Secret",
                          dataIndex: ["api_connect_config", "app_secret"],
                          valueType: 'text',
                          readonly: true,
                          colProps: {
                            span: 12,
                          },
                          fieldProps: {
                            addonAfter: (
                              <Space>
                                <Button
                                  type="link"
                                  onClick={async () => {
                                    const salt = form.getFieldValue(['api_connect_config', 'salt']);
                                    const application_id = form.getFieldValue('application_id');
                                    if (!salt) {
                                      message.error('请先输入 Salt');
                                      return;
                                    }
                                    if (!application_id) {
                                      message.error('应用 ID 不能为空');
                                      return;
                                    }
                                    try {
                                      const res = await postApplicationsIdGenerateSecret(
                                        { id: application_id },
                                        { salt }
                                      );
                                      if (res.code === 200 && res.data?.app_secret) {
                                        form.setFieldsValue({
                                          api_connect_config: {
                                            ...form.getFieldValue('api_connect_config'),
                                            app_secret: res.data.app_secret,
                                          },
                                        });
                                        message.success('生成 App Secret 成功');
                                      } else {
                                        message.error(res.message || '生成失败');
                                      }
                                    } catch (e) {
                                      message.error('生成失败');
                                    }
                                  }}
                                >
                                  生成 app_secret
                                </Button>
                                <Tooltip title="点击查看使用说明">
                                  <QuestionCircleOutlined
                                    onClick={() => {
                                      modal.info({
                                        title: 'API 访问说明',
                                        width: 600,
                                        content: (
                                          <div>
                                            <h3>如何使用 App Secret 访问 API</h3>
                                            <p>1. 在请求头中添加以下字段：</p>
                                            <pre>
                                              {`X-API-Key: ${form.getFieldValue(['api_connect_config', 'app_key'])}
X-API-Sign: ${form.getFieldValue(['api_connect_config', 'app_secret'])}`}
                                            </pre>
                                            <p>2. 签名生成规则：</p>
                                            <pre>
                                              {`app_secret = md5(application_id + salt + timestamp)
timestamp = 当前时间戳（毫秒）`}
                                            </pre>
                                            <p>3. 注意事项：</p>
                                            <ul>
                                              <li>请妥善保管 App Secret，不要泄露给他人</li>
                                              <li>每次生成新的 App Secret 后，旧的 App Secret 将失效</li>
                                              <li>建议定期更换 Salt 和 App Secret</li>
                                            </ul>
                                          </div>
                                        ),
                                      });
                                    }}
                                    style={{ cursor: 'pointer' }}
                                  />
                                </Tooltip>
                              </Space>
                            ),
                          },
                        },
                      ],
                    },
                  ]
                : [];
            },
          },
        ],
      },
    ];
  }, [form]);

  return (
    <Form form={form}>
      <Modal
        title="API 访问说明"
        open={helpModalVisible}
        onCancel={() => setHelpModalVisible(false)}
        footer={null}
        width={600}
      >
        <div>
          <h3>如何使用 App Secret 访问 API</h3>
          <p>1. 在请求头中添加以下字段：</p>
          <pre>
            {`X-API-Key: ${form.getFieldValue(['api_connect_config', 'app_key'])}
X-API-Sign: ${form.getFieldValue(['api_connect_config', 'app_secret'])}`}
          </pre>
          <p>2. 签名生成规则：</p>
          <pre>
            {`app_secret = md5(application_id + salt + timestamp)
timestamp = 当前时间戳（毫秒）`}
          </pre>
          <p>3. 注意事项：</p>
          <ul>
            <li>请妥善保管 App Secret，不要泄露给他人</li>
            <li>每次生成新的 App Secret 后，旧的 App Secret 将失效</li>
            <li>建议定期更换 Salt 和 App Secret</li>
          </ul>
        </div>
      </Modal>
    </Form>
  );
};

export default Page; 