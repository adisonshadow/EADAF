import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import Editor from '@monaco-editor/react';
import { ActionType, PageContainer, ProForm, ProFormDigit, ProFormSwitch, ProFormText, ProFormTextArea } from '@ant-design/pro-components';
import { UrlSyncedProTable } from '@/components/UrlSyncedProTable';
import { Button, Form, Modal, Popconfirm, Tag, Typography } from 'antd';
import { message } from '@/utils/antdAppApis';
import React, { useCallback, useRef, useState } from 'react';
import { sendMockUserMessage, useAISurface } from '@eadaf/ai-base';
import PageContainerTitleWithBack from '@/components/PageContainerTitleWithBack';
import { TableActionButton, TableActions, TABLE_ACTION_COLUMN_BASE } from '@/components/TableActions';
import { DEFAULT_PRO_TABLE_OPTIONS } from '@/constants/proTable';
import { useProTableSearchCollapse } from '@/hooks/useProTableSearchCollapse';
import type { ProColumns } from '@ant-design/pro-components';
import {
  createExceptionResponse,
  deleteExceptionResponse,
  getExceptionResponses,
  patchExceptionResponse,
} from '@/services/EADAF/api/exceptionResponses';
import { getApiData, getApiErrorMessage, isApiSuccess } from '@/utils/apiResponse';
import { buildExceptionResponsePrompt } from '../ai/buildExceptionResponsePrompt';

const { Text } = Typography;

/** 根据状态码着色 Tag */
function codeColor(code: number): string {
  if (code >= 500) return 'red';
  if (code >= 400) return 'volcano';
  if (code >= 300) return 'orange';
  return 'green';
}

type EditorMode = 'create' | 'edit';

const ExceptionResponsesPage: React.FC = () => {
  const actionRef = useRef<ActionType | undefined>(undefined);
  const [editForm] = ProForm.useForm();
  const [modalOpen, setModalOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>('create');
  const [editingId, setEditingId] = useState<string | undefined>();
  const [schemaText, setSchemaText] = useState('{}');
  const [exampleText, setExampleText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const search = useProTableSearchCollapse('api-services.exception-responses');

  useAISurface({
    id: 'api-services.exception-responses',
    domain: 'bizdata',
    label: '异常响应设置',
    read: async () => {
      const res = await getExceptionResponses({ size: -1 });
      return isApiSuccess(res) ? getApiData(res) : null;
    },
    refresh: () => actionRef.current?.reload(),
    matchMutation: (mutation) =>
      mutation.domain === 'bizdata'
      && (mutation.type === 'apiservice.exception_response.created'
        || mutation.type === 'apiservice.exception_response.updated'
        || mutation.type === 'apiservice.exception_response.deleted'),
  });

  const handleAiGenerate = useCallback(() => {
    sendMockUserMessage(buildExceptionResponsePrompt());
  }, []);

  const openCreateModal = useCallback(() => {
    setEditorMode('create');
    setEditingId(undefined);
    editForm.resetFields();
    setSchemaText('{}');
    setExampleText('');
    setModalOpen(true);
  }, [editForm]);

  const openEditModal = useCallback(
    (record: API.ExceptionResponseItem) => {
      setEditorMode('edit');
      setEditingId(record.id);
      editForm.setFieldsValue({
        code: record.code,
        title: record.title,
        description: record.description,
        isEnabled: record.isEnabled !== false,
        sortOrder: record.sortOrder ?? 0,
      });
      setSchemaText(JSON.stringify(record.schema || {}, null, 2));
      setExampleText(record.example != null ? JSON.stringify(record.example, null, 2) : '');
      setModalOpen(true);
    },
    [editForm],
  );

  const handleSubmit = useCallback(async () => {
    let values: Record<string, unknown>;
    try {
      values = await editForm.validateFields();
    } catch {
      return;
    }

    let parsedSchema: Record<string, unknown>;
    let parsedExample: unknown;
    try {
      parsedSchema = schemaText.trim() ? JSON.parse(schemaText) : {};
    } catch {
      message.error('Schema JSON 格式不正确');
      return;
    }
    try {
      parsedExample = exampleText.trim() ? JSON.parse(exampleText) : undefined;
    } catch {
      message.error('Example JSON 格式不正确');
      return;
    }

    const payload = {
      code: Number(values.code),
      title: String(values.title || '').trim(),
      description: (values.description as string) || undefined,
      schema: parsedSchema,
      example: parsedExample,
      isEnabled: values.isEnabled as boolean,
      sortOrder: Number(values.sortOrder) || 0,
    };

    setSubmitting(true);
    try {
      const res = editorMode === 'create'
        ? await createExceptionResponse(payload)
        : await patchExceptionResponse(editingId!, payload);
      if (!isApiSuccess(res)) {
        message.error(getApiErrorMessage(res, '保存失败'));
        return;
      }
      message.success(editorMode === 'create' ? '已创建' : '已更新');
      setModalOpen(false);
      actionRef.current?.reload();
    } catch (err) {
      message.error(getApiErrorMessage(err, '保存失败'));
    } finally {
      setSubmitting(false);
    }
  }, [editForm, editorMode, editingId, schemaText, exampleText]);

  const handleDelete = useCallback(
    async (record: API.ExceptionResponseItem) => {
      try {
        const res = await deleteExceptionResponse(record.id);
        if (!isApiSuccess(res)) {
          message.error(getApiErrorMessage(res, '删除失败'));
          return;
        }
        message.success('已删除');
        actionRef.current?.reload();
      } catch (err) {
        message.error(getApiErrorMessage(err, '删除失败'));
      }
    },
    [],
  );

  const columns: ProColumns<API.ExceptionResponseItem>[] = [
    {
      title: '状态码',
      dataIndex: 'code',
      width: 90,
      render: (_, record) => (
        <Tag color={codeColor(record.code)} style={{ minWidth: 48, textAlign: 'center', fontWeight: 600 }}>
          {record.code}
        </Tag>
      ),
    },
    {
      title: '标题',
      dataIndex: 'title',
      width: 160,
      render: (_, record) => <Text strong>{record.title}</Text>,
    },
    {
      title: '说明',
      dataIndex: 'description',
      ellipsis: true,
      render: (_, record) => <Text type="secondary">{record.description || '-'}</Text>,
    },
    {
      title: '启用',
      dataIndex: 'isEnabled',
      width: 80,
      render: (_, record) => (record.isEnabled !== false ? <Tag color="success">启用</Tag> : <Tag>禁用</Tag>),
    },
    {
      ...TABLE_ACTION_COLUMN_BASE,
      width: 80,
      render: (_, record) => (
        <TableActions>
          <TableActionButton
            title="编辑"
            icon={<EditOutlined />}
            onClick={() => openEditModal(record)}
          />
          <Popconfirm
            title="确认删除该异常响应？"
            onConfirm={() => handleDelete(record)}
          >
            <TableActionButton title="删除" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </TableActions>
      ),
    },
  ];

  return (
    <PageContainer
      title={<PageContainerTitleWithBack title="异常响应设置" />}
    >
      <UrlSyncedProTable<API.ExceptionResponseItem>
        actionRef={actionRef}
        rowKey="id"
        scroll={{ x: 'max-content' }}
        search={search}
        columns={columns}
        request={async (params) => {
          const res = await getExceptionResponses({
            page: params.current,
            size: params.pageSize,
          });
          if (!isApiSuccess(res)) {
            return { data: [], total: 0, success: false };
          }
          const data = getApiData<API.ExceptionResponseListResult>(res);
          return { data: data?.items || [], total: data?.total || 0, success: true };
        }}
        toolBarRender={() => [
          <Button
            key="ai-generate"
            className="ai-btn"
            icon={<RobotOutlined />}
            onClick={handleAiGenerate}
          >
            AI 生成
          </Button>,
          <Button
            key="create"
            type="primary"
            className="btn-gradient-primary"
            icon={<PlusOutlined />}
            onClick={openCreateModal}
          >
            新建
          </Button>,
        ]}
        defaultPageSize={10}
        options={DEFAULT_PRO_TABLE_OPTIONS}
      />

      <Modal
        title={editorMode === 'create' ? '新建异常响应' : '编辑异常响应'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => void handleSubmit()}
        okButtonProps={{ loading: submitting }}
        destroyOnClose
        width={680}
      >
        <ProForm
          form={editForm}
          submitter={false}
          layout="vertical"
          initialValues={{ isEnabled: true, sortOrder: 0 }}
        >
          <Form.Item label="HTTP 状态码" name="code" rules={[{ required: true, message: '请输入状态码' }]}>
            <ProFormDigit
              fieldProps={{ style: { width: '100%' } }}
              min={100}
              max={599}
              placeholder="如 401、404、500"
            />
          </Form.Item>
          <ProFormText
            label="标题"
            name="title"
            rules={[{ required: true, message: '请输入标题' }]}
            placeholder="如「未授权」「资源不存在」"
          />
          <ProFormTextArea
            label="说明"
            name="description"
            placeholder="该异常的触发场景与含义"
          />
          <Form.Item label="Schema（JSON Schema）">
            <Editor
              height="160px"
              language="json"
              value={schemaText}
              onChange={(val) => setSchemaText(val || '{}')}
              options={{ minimap: { enabled: false }, fontSize: 12, wordWrap: 'on' }}
            />
          </Form.Item>
          <Form.Item label="Example（响应示例，JSON）">
            <Editor
              height="120px"
              language="json"
              value={exampleText}
              onChange={(val) => setExampleText(val || '')}
              options={{ minimap: { enabled: false }, fontSize: 12, wordWrap: 'on' }}
            />
          </Form.Item>
          <ProFormSwitch label="启用" name="isEnabled" />
          <ProFormDigit label="排序" name="sortOrder" fieldProps={{ style: { width: 120 } }} />
        </ProForm>
      </Modal>
    </PageContainer>
  );
};

export default ExceptionResponsesPage;
