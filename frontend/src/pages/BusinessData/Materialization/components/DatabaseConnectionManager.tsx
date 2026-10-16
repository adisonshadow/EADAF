import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ThunderboltOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { ProTable } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import {
  Button,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Tooltip,
  message,
} from 'antd';
import { sendMockUserMessage } from '@eadaf/ai-base';
import React, { useState } from 'react';
import { TableActionButton, TableActions, TABLE_ACTION_COLUMN_BASE } from '@/components/TableActions';
import {
  deleteDatabaseConnection,
  getDatabaseConnection,
  postDatabaseConnection,
  putDatabaseConnection,
  testDatabaseConnection,
} from '@/services/EADAF/api/businessData';
import {
  getApiData,
  getApiErrorMessage,
  getMaterializationTargetLabel,
  isApiSuccess,
} from '@/utils/apiResponse';
import { dbConnectionTestStatusEnum, dbConnectionUntestedEnum } from '@/enums';
import { renderStatusBadge } from '@/utils/statusBadge';
import { buildConnectionImportPrompt } from '../utils/connectionImportPrompt';

const DB_TYPE_OPTIONS = [
  { label: 'PostgreSQL', value: 'postgresql' },
  { label: 'MySQL', value: 'mysql' },
  { label: 'MongoDB', value: 'mongodb' },
  { label: 'Redis', value: 'redis' },
];

const DEFAULT_PORTS: Record<string, number> = {
  postgresql: 5432,
  mysql: 3306,
  mongodb: 27017,
  redis: 6379,
};

interface DatabaseConnectionManagerProps {
  connections: API.DatabaseConnection[];
  loading?: boolean;
  onRefresh: () => void;
}

const DatabaseConnectionManager: React.FC<DatabaseConnectionManagerProps> = ({
  connections,
  loading,
  onRefresh,
}) => {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<API.DatabaseConnection | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [testingId, setTestingId] = useState<string>();
  const [showAiImport, setShowAiImport] = useState(false);
  const [aiImportText, setAiImportText] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [form] = Form.useForm();
  const dbType = Form.useWatch('dbType', form) as string | undefined;

  const applyDbTypeDefaults = (type: string) => {
    const next: Record<string, unknown> = { port: DEFAULT_PORTS[type] || 5432 };
    if (type === 'postgresql' || type === 'mysql') {
      if (!form.getFieldValue('targetSchema')) next.targetSchema = 'bizdata_mat';
    }
    if (type === 'mysql') {
      const db = form.getFieldValue('databaseName');
      if (db == null || db === '' || db === '0') next.databaseName = 'mysql';
    }
    if (type === 'redis') {
      const db = form.getFieldValue('databaseName');
      if (db == null || db === '' || db === 'mysql') next.databaseName = '0';
      if (!form.getFieldValue('targetSchema')) next.targetSchema = 'bizdata_mat';
    }
    form.setFieldsValue(next);
  };

  const openCreate = () => {
    setEditing(null);
    setShowAiImport(false);
    setAiImportText('');
    setPasswordVisible(false);
    form.resetFields();
    form.setFieldsValue({
      dbType: 'postgresql',
      port: 5432,
      targetSchema: 'bizdata_mat',
    });
    setOpen(true);
  };

  const openEdit = async (record: API.DatabaseConnection) => {
    setEditing(record);
    setShowAiImport(false);
    setAiImportText('');
    setPasswordVisible(true);
    form.setFieldsValue({
      name: record.name,
      dbType: record.dbType,
      host: record.host,
      port: record.port,
      username: record.username,
      databaseName: record.databaseName,
      targetSchema: record.targetSchema,
      isDefault: record.isDefault,
      password: undefined,
    });
    setOpen(true);
    if (!record.id) return;
    try {
      const res = await getDatabaseConnection(record.id);
      const detail = getApiData(res) as (API.DatabaseConnection & { password?: string }) | undefined;
      if (isApiSuccess(res) && detail) {
        form.setFieldsValue({
          name: detail.name,
          dbType: detail.dbType,
          host: detail.host,
          port: detail.port,
          username: detail.username,
          databaseName: detail.databaseName,
          targetSchema: detail.targetSchema,
          isDefault: detail.isDefault,
          password: detail.password || undefined,
        });
      }
    } catch {
      // 详情拉取失败时保留列表字段，密码仍可留空不改
    }
  };

  const closeModal = () => {
    setOpen(false);
    setShowAiImport(false);
    setAiImportText('');
    setPasswordVisible(false);
  };

  const handleAiImport = () => {
    const text = aiImportText.trim();
    if (!text) {
      message.warning('请先粘贴连接串或配置脚本');
      return;
    }
    sendMockUserMessage(buildConnectionImportPrompt(text));
    closeModal();
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      const dbName =
        values.dbType === 'redis'
          ? String(values.databaseName ?? '0')
          : values.databaseName;
      let targetSchema = values.targetSchema;
      if (values.dbType === 'mongodb') {
        targetSchema = dbName;
      }
      const body = {
        name: values.name,
        dbType: values.dbType,
        host: values.host,
        port: values.port,
        username: values.username || undefined,
        password: values.password,
        databaseName: dbName,
        targetSchema,
        isDefault: values.isDefault,
      };
      const res = editing
        ? await putDatabaseConnection(editing.id!, body)
        : await postDatabaseConnection(body);
      if (isApiSuccess(res)) {
        message.success(editing ? '连接已更新' : '连接已创建');
        closeModal();
        onRefresh();
      } else {
        message.error(getApiErrorMessage(res, '保存失败'));
      }
    } catch (error) {
      message.error(getApiErrorMessage(error, '保存失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const res = await testDatabaseConnection(id);
      if (isApiSuccess(res)) {
        message.success('连接测试成功');
        onRefresh();
      } else {
        message.error(getApiErrorMessage(res, '连接测试失败'));
      }
    } catch (error) {
      message.error(getApiErrorMessage(error, '连接测试失败'));
    } finally {
      setTestingId(undefined);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await deleteDatabaseConnection(id);
      if (isApiSuccess(res)) {
        message.success('已删除');
        onRefresh();
      } else {
        message.error(getApiErrorMessage(res, '删除失败'));
      }
    } catch (error) {
      message.error(getApiErrorMessage(error, '删除失败'));
    }
  };

  const isRedis = dbType === 'redis';
  const isMongo = dbType === 'mongodb';
  const isMysql = dbType === 'mysql';
  const usernameRequired = !isRedis;
  const passwordRequired = !editing && !isRedis;

  const columns: ProColumns<API.DatabaseConnection>[] = [
    { title: '名称', dataIndex: 'name', ellipsis: true },
    {
      title: '类型',
      dataIndex: 'dbType',
      width: 110,
      render: (_, r) => {
        const opt = DB_TYPE_OPTIONS.find((o) => o.value === r.dbType);
        return opt?.label || r.dbType;
      },
    },
    { title: 'Host', dataIndex: 'host', width: 120, ellipsis: true },
    {
      title: '库/DB',
      dataIndex: 'databaseName',
      width: 100,
      ellipsis: true,
      render: (_, r) =>
        r.dbType === 'redis' ? `DB ${r.databaseName ?? '0'}` : r.databaseName,
    },
    {
      title: '目标',
      dataIndex: 'targetSchema',
      width: 120,
      ellipsis: true,
      render: (_, r) => {
        const label = getMaterializationTargetLabel(r.dbType);
        const value =
          r.dbType === 'mongodb'
            ? r.targetSchema || r.databaseName
            : r.targetSchema;
        return value ? `${label}: ${value}` : '-';
      },
    },
    {
      title: '状态',
      width: 90,
      render: (_, r) =>
        r.lastTestStatus
          ? renderStatusBadge(r.lastTestStatus, dbConnectionTestStatusEnum)
          : renderStatusBadge('pending', dbConnectionUntestedEnum),
    },
    {
      ...TABLE_ACTION_COLUMN_BASE,
      width: 90,
      render: (_, record) => (
        <TableActions>
          <TableActionButton
            title="测试连接"
            icon={<ThunderboltOutlined />}
            loading={testingId === record.id}
            onClick={() => handleTest(record.id!)}
          />
          <TableActionButton
            title="编辑"
            icon={<EditOutlined />}
            onClick={() => void openEdit(record)}
          />
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id!)}>
            <Tooltip title="删除">
              <Button
                type="link"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={(e) => e.stopPropagation()}
              />
            </Tooltip>
          </Popconfirm>
        </TableActions>
      ),
    },
  ];

  const modalTitle = editing ? (
    '编辑数据库连接'
  ) : (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <span>新建数据库连接</span>
      <Button
        className="ai-btn"
        icon={<RobotOutlined />}
        style={{ marginRight: 50 }}
        onClick={() => setShowAiImport((v) => !v)}
      >
        {showAiImport ? '返回手工创建' : '智能识别创建'}
      </Button>
    </div>
  );

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <Button
          type="primary"
          className="btn-gradient-primary"
          icon={<PlusOutlined />}
          onClick={openCreate}
        >
          新建连接
        </Button>
      </Space>
      <ProTable<API.DatabaseConnection>
        size="small"
        rowKey="id"
        loading={loading}
        scroll={{ x: 'max-content' }}
        columns={columns}
        dataSource={connections}
        search={false}
        options={false}
        pagination={false}
      />
      <Modal
        title={modalTitle}
        open={open}
        onCancel={closeModal}
        onOk={() => void handleSubmit()}
        confirmLoading={submitting}
        width={640}
        destroyOnHidden
        styles={{
          header: { marginBottom: 0 },
          title: { width: '100%', maxWidth: '100%' },
        }}
        okButtonProps={showAiImport && !editing ? { style: { display: 'none' } } : undefined}
        footer={
          showAiImport && !editing
            ? [
                <Button key="cancel" onClick={closeModal}>
                  取消
                </Button>,
                <Button
                  key="ai"
                  className="ai-btn"
                  icon={<RobotOutlined />}
                  onClick={handleAiImport}
                >
                  让 AI 创建
                </Button>,
              ]
            : undefined
        }
      >
        {showAiImport && !editing ? (
          <div style={{ marginTop: 22 }}>
            <Input.TextArea
              rows={10}
              value={aiImportText}
              onChange={(e) => setAiImportText(e.target.value)}
              placeholder={
                '粘贴连接串或配置脚本，例如：\n' +
                'postgres://user:pass@host:5432/mydb\n' +
                'mysql://user:pass@host:3306/mydb\n' +
                'mongodb://user:pass@host:27017/mydb\n' +
                'redis://:pass@host:6379/0\n' +
                '或 docker-compose / .env 片段'
              }
            />
          </div>
        ) : (
          <Form form={form} layout="vertical">
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="name" label="连接名称" rules={[{ required: true }]}>
                  <Input placeholder="如：生产 PostgreSQL" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="dbType" label="数据库类型" rules={[{ required: true }]}>
                  <Select
                    options={DB_TYPE_OPTIONS}
                    onChange={(v) => applyDbTypeDefaults(String(v))}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="host" label="Host" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="port" label="Port" rules={[{ required: true }]}>
                  <InputNumber style={{ width: '100%' }} min={1} max={65535} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="username"
                  label="用户名"
                  rules={usernameRequired ? [{ required: true, message: '请输入用户名' }] : []}
                  extra={isRedis ? 'Redis ACL 用户名，可留空' : undefined}
                >
                  <Input placeholder={isRedis ? '可选' : undefined} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="password"
                  label={editing ? '密码（留空则不修改）' : '密码'}
                  rules={passwordRequired ? [{ required: true, message: '请输入密码' }] : []}
                  extra={isRedis && !editing ? '可留空（无密码 Redis）' : undefined}
                >
                  <Input.Password
                    visibilityToggle={{
                      visible: passwordVisible,
                      onVisibleChange: setPasswordVisible,
                    }}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                {isRedis ? (
                  <Form.Item
                    name="databaseName"
                    label="Redis DB 索引"
                    rules={[{ required: true, message: '请填写 0–15 的 DB 索引' }]}
                    extra="填写 0–15 的数字索引"
                  >
                    <InputNumber style={{ width: '100%' }} min={0} max={15} />
                  </Form.Item>
                ) : (
                  <Form.Item
                    name="databaseName"
                    label={isMysql ? '登录库' : '数据库名'}
                    rules={[
                      {
                        required: true,
                        message: isMysql ? '请输入登录库名' : '请输入数据库名',
                      },
                    ]}
                    extra={isMysql ? '连接用，默认 mysql' : undefined}
                  >
                    <Input placeholder={isMysql ? 'mysql' : undefined} />
                  </Form.Item>
                )}
              </Col>
              {!isMongo && (
                <Col span={12}>
                  <Form.Item
                    name="targetSchema"
                    label={
                      isRedis ? 'Key 前缀' : isMysql ? '物化目标库' : 'Schema'
                    }
                    rules={[
                      {
                        required: true,
                        message: isRedis
                          ? '请输入 Key 前缀'
                          : isMysql
                            ? '请输入物化目标库名'
                            : '请输入 Schema',
                      },
                    ]}
                    extra={
                      isMysql ? '物化建表的库，可不存在；须 ≥ 8.0.13' : undefined
                    }
                  >
                    <Input placeholder="如 bizdata_mat" />
                  </Form.Item>
                </Col>
              )}
            </Row>
          </Form>
        )}
      </Modal>
    </>
  );
};

export default DatabaseConnectionManager;
