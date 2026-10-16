import {
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Splitter,
  message,
} from 'antd';

import { RedoOutlined } from '@ant-design/icons';
import type { AIMutation } from '@eadaf/ai-base';
import { useAISurface, useChatReference, useAIChatPrompts, sendMockUserMessage } from '@eadaf/ai-base';
import { buildEntityContextPrompts } from '@/ai/pageChatPrompts';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AISurfaceMarker from '@/components/AISurfaceMarker';
import { applyBizdataModelMutation } from '../ai/bizdataMutation';
import ScopeEntityTree from '../components/ScopeEntityTree';
import FieldsManager from '../components/FieldsManager';
import ScopeDocPanel from '../components/ScopeDocPanel';
import JsonSchemaEditor from '../components/JsonSchemaEditor';
import EnumManager from '../components/EnumManager';
import EntityDeletionModal from '../components/EntityDeletionModal';
import MetadataEditor from '../components/MetadataEditor';
import { buildEntityValidatePrompt, buildBatchValidatePrompt } from '../utils/entityValidation';
import {
  getBusinessDataSchema,
  getBusinessDataScopeDocs,
  getMaterializationStatus,
  patchBusinessDataEntity,
  postBusinessDataEntity,
  putBusinessDataEntityFields,
} from '@/services/EADAF/api/businessData';
import { getApiData, getApiErrorMessage, isApiSuccess } from '@/utils/apiResponse';
import {
  createEntityCodeUniqueRule,
  createTableNameUniqueRule,
  defaultTableNameFromCode,
} from '../utils/entityTableName';

const ModelDesigner: React.FC = () => {
  const navigate = useNavigate();
  const [schema, setSchema] = useState<API.BusinessDataSchema>({ entities: [], enums: [], relations: [] });
  const [materializedEntityIds, setMaterializedEntityIds] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<API.BusinessDataEntity | null>(null);
  const [selectedScopeDocCode, setSelectedScopeDocCode] = useState<string | null>(null);
  const [scopeCodesWithDocs, setScopeCodesWithDocs] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [enumModalOpen, setEnumModalOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<API.BusinessDataEntity | null>(null);
  const [deletingEntity, setDeletingEntity] = useState<API.BusinessDataEntity | null>(null);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const { references } = useChatReference();
  const schemaRef = useRef(schema);
  const selectedRef = useRef(selected);
  const selectedScopeDocCodeRef = useRef(selectedScopeDocCode);
  const scopeCodesWithDocsRef = useRef(scopeCodesWithDocs);
  schemaRef.current = schema;
  selectedRef.current = selected;
  selectedScopeDocCodeRef.current = selectedScopeDocCode;
  scopeCodesWithDocsRef.current = scopeCodesWithDocs;

  const chatPrompts = useMemo(
    () => buildEntityContextPrompts(references, selected),
    [references, selected?.id, selected?.label, selected?.code, selected?.entityKind],
  );

  useAIChatPrompts(chatPrompts);

  const loadScopeDocs = useCallback(async () => {
    try {
      const res = await getBusinessDataScopeDocs();
      const data = getApiData<API.BusinessDataScopeDocSummary[]>(res);
      if (!isApiSuccess(res) || !Array.isArray(data)) {
        return;
      }
      setScopeCodesWithDocs(new Set(data.map((item) => item.code).filter(Boolean)));
    } catch {
      // 树 icon 非关键路径，静默失败
    }
  }, []);

  const loadSchema = useCallback(async () => {
    setLoading(true);
    try {
      const [res, statusRes] = await Promise.all([
        getBusinessDataSchema(),
        getMaterializationStatus(),
        loadScopeDocs(),
      ]);
      const data = getApiData<API.BusinessDataSchema>(res);
      if (!isApiSuccess(res) || !data) {
        message.error(getApiErrorMessage(res, '加载业务数据模型失败'));
        return null;
      }
      setSchema(data);

      const statusData = getApiData<API.MaterializationStatusItem[]>(statusRes);
      if (isApiSuccess(statusRes) && Array.isArray(statusData)) {
        const materialized = new Set<string>();
        statusData.forEach((item) => {
          if (item.entityId && item.materializedVersion != null) {
            materialized.add(item.entityId);
          }
        });
        setMaterializedEntityIds(materialized);
      }

      if (selected?.id) {
        const updated = data.entities?.find((e) => e.id === selected.id);
        setSelected(updated || null);
      }
      return data;
    } catch (error) {
      message.error(getApiErrorMessage(error, '加载业务数据模型失败'));
      return null;
    } finally {
      setLoading(false);
    }
  }, [loadScopeDocs, selected?.id]);

  const patchEntityInSchema = useCallback((entity: API.BusinessDataEntity) => {
    setSchema((prev) => ({
      ...prev,
      entities: (prev.entities || []).map((item) => (item.id === entity.id ? { ...item, ...entity } : item)),
    }));
    setSelected((prev) => (prev?.id === entity.id ? { ...prev, ...entity } : prev));
  }, []);

  const appendEntityInSchema = useCallback((entity: API.BusinessDataEntity) => {
    setSchema((prev) => ({
      ...prev,
      entities: [...(prev.entities || []).filter((item) => item.id !== entity.id), entity],
    }));
  }, []);

  const removeEntityFromSchema = useCallback((entityId: string) => {
    setSchema((prev) => ({
      ...prev,
      entities: (prev.entities || []).filter((item) => item.id !== entityId),
    }));
    setSelected((prev) => (prev?.id === entityId ? null : prev));
  }, []);

  const appendEnumInSchema = useCallback((enumItem: API.BusinessDataEnum) => {
    setSchema((prev) => ({
      ...prev,
      enums: [...(prev.enums || []).filter((item) => item.id !== enumItem.id), enumItem],
    }));
  }, []);

  const refreshSchema = useCallback(async () => {
    await loadSchema();
  }, [loadSchema]);

  const applyMutation = useCallback(
    (mutation: AIMutation) => {
      applyBizdataModelMutation(mutation, {
        patchEntity: patchEntityInSchema,
        appendEntity: appendEntityInSchema,
        removeEntity: removeEntityFromSchema,
        appendEnum: appendEnumInSchema,
        refresh: refreshSchema,
      });
    },
    [appendEntityInSchema, appendEnumInSchema, patchEntityInSchema, refreshSchema, removeEntityFromSchema],
  );

  useAISurface({
    id: 'bizdata.model-designer',
    domain: 'bizdata',
    label: '业务数据模型设计',
    read: () => ({
      selectedEntity: selectedRef.current,
      selectedScopeDocCode: selectedScopeDocCodeRef.current,
      scopeDocsSummary: [...scopeCodesWithDocsRef.current],
      entityCount: schemaRef.current.entities?.length ?? 0,
      enumCount: schemaRef.current.enums?.length ?? 0,
      relationCount: schemaRef.current.relations?.length ?? 0,
    }),
    refresh: refreshSchema,
    applyMutation,
    matchMutation: (mutation) =>
      mutation.domain === 'bizdata'
      && /^(entity|enum|relation|schema|scopeDoc)\./.test(mutation.type),
  });

  useEffect(() => {
    loadSchema();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectEntity = (entity: API.BusinessDataEntity) => {
    setSelectedScopeDocCode(null);
    setSelected(entity);
  };

  const handleOpenScopeDoc = (scopeCode: string) => {
    setSelectedScopeDocCode(scopeCode);
  };

  const handleScopeDocSaved = (doc: API.BusinessDataScopeDoc) => {
    setScopeCodesWithDocs((prev) => {
      const next = new Set(prev);
      if (doc.hasContent) next.add(doc.code);
      else next.delete(doc.code);
      return next;
    });
  };

  const handleCreateEntity = async () => {
    const values = await createForm.validateFields();
    const res = await postBusinessDataEntity({
      code: values.code,
      label: values.label,
      entityKind: values.entityKind,
      ...(values.entityKind === 'er_table'
        ? { tableName: values.tableName?.trim() || undefined }
        : {}),
    });
    if (isApiSuccess(res)) {
      message.success('实体已创建');
      setCreateOpen(false);
      createForm.resetFields();
      const data = await loadSchema();
      const entity = getApiData<API.BusinessDataEntity>(res);
      const created = entity || data?.entities?.find((e) => e.code === values.code);
      if (created) setSelected(created);
    } else {
      message.error(getApiErrorMessage(res, '创建失败'));
    }
  };

  const handleEditEntity = async () => {
    if (!editingEntity?.id) return;
    const values = await editForm.validateFields();
    const res = await patchBusinessDataEntity(editingEntity.id, {
      code: values.code?.trim(),
      label: values.label,
      ...(editingEntity.entityKind === 'er_table'
        ? { tableName: values.tableName?.trim() || undefined }
        : {}),
      status: values.status,
    });
    if (isApiSuccess(res)) {
      message.success('实体已更新');
      setEditOpen(false);
      await loadSchema();
    } else {
      message.error(getApiErrorMessage(res, '更新失败'));
    }
  };

  const handleToggleLock = async (entity: API.BusinessDataEntity) => {
    if (!entity.id) return;
    const res = await patchBusinessDataEntity(entity.id, { isLocked: !entity.isLocked });
    if (isApiSuccess(res)) {
      message.success(entity.isLocked ? '已解锁' : '已锁定');
      await loadSchema();
    } else {
      message.error(getApiErrorMessage(res, '操作失败'));
    }
  };

  const handleDeleteEntity = (entity: API.BusinessDataEntity) => {
    if (!entity.id) return;
    setDeletingEntity(entity);
  };

  const handleEntityDeletionDone = async (result: API.EntityDeletionExecuteResult) => {
    const deletedIds = new Set(result.deleteEntityIds || []);
    deletedIds.forEach((id) => removeEntityFromSchema(id));
    setDeletingEntity(null);
    await loadSchema();
  };

  const handleSaveFields = async (fields: API.BusinessDataField[]) => {
    if (!selected?.id) return;
    setSaving(true);
    try {
      const res = await putBusinessDataEntityFields(selected.id, fields);
      if (isApiSuccess(res)) {
        if (selected.entityInfo?.modelValidated) {
          await patchBusinessDataEntity(selected.id, {
            entityInfo: { ...(selected.entityInfo || {}), modelValidated: false },
          });
        }
        message.success('字段已保存');
        await loadSchema();
      } else {
        message.error(getApiErrorMessage(res, '保存字段失败'));
      }
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (entity: API.BusinessDataEntity) => {
    setEditingEntity(entity);
    editForm.setFieldsValue({
      code: entity.code,
      label: entity.label,
      tableName: entity.tableName,
      status: entity.status || 'enabled',
    });
    setEditOpen(true);
  };

  const renderDetail = () => {
    if (selectedScopeDocCode) {
      return (
        <AISurfaceMarker
          surfaceId="bizdata.model-designer.scope-doc"
          resourceId={selectedScopeDocCode}
          style={{ height: '100%', display: 'block' }}
        >
          <ScopeDocPanel
            scopeCode={selectedScopeDocCode}
            onClose={() => setSelectedScopeDocCode(null)}
            onSaved={handleScopeDocSaved}
          />
        </AISurfaceMarker>
      );
    }

    if (!selected) {
      return (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Empty description="请在左侧选择实体进行设计" />
        </div>
      );
    }

    return (
      <AISurfaceMarker surfaceId="bizdata.model-designer.entity-detail" resourceId={selected.id}>
        <div style={{ padding: '0 4px' }}>
          <Space orientation="vertical" size={12} style={{ width: '100%' }}>
            {selected.entityKind === 'json_schema' ? (
              <JsonSchemaEditor entity={selected} onSaved={loadSchema} />
            ) : (
              <FieldsManager
                entity={selected}
                entities={schema.entities || []}
                relations={schema.relations || []}
                enums={schema.enums || []}
                onSaveFields={handleSaveFields}
                onRefresh={loadSchema}
                saving={saving}
              />
            )}
            {selected.id ? (
              <MetadataEditor
                targetType="entity"
                targetId={selected.id}
                targetCode={selected.code}
              />
            ) : null}
          </Space>
        </div>
      </AISurfaceMarker>
    );
  };

  return (
    <div className="model-designer" style={{ padding: 0, margin:0 }}>
      <Splitter style={{ height: 'calc(100vh - 56px)', minHeight: 480 }}>
        <Splitter.Panel defaultSize={340} min={280} max="50%">
          <div
            style={{
              height: 'calc(100vh - 56px)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              paddingRight: 8,
            }}
          >
            <Space wrap size="small" style={{ margin: 8, flexShrink: 0 }}>
              <Button type="primary" size="small" className="btn-gradient-primary" onClick={() => setCreateOpen(true)}>
                新建实体
              </Button>
              <Button className="btn-function" size="small" onClick={() => setEnumModalOpen(true)}>
                枚举管理
              </Button>
              <Button className="btn-function" size="small" onClick={() => navigate('/business_data/model-design/relations-graph')}>
                关系图谱
              </Button>
              <Button size="small" variant='filled' color="default" icon={<RedoOutlined />} loading={loading} onClick={() => loadSchema()} />
            </Space>
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              <ScopeEntityTree
                entities={schema.entities || []}
                selectedEntityId={selected?.id}
                showHeader={false}
                materializedEntityIds={materializedEntityIds}
                scopeCodesWithDocs={scopeCodesWithDocs}
                onSelectEntity={handleSelectEntity}
                onOpenScopeDoc={handleOpenScopeDoc}
                onToggleLock={handleToggleLock}
                onEditEntity={openEditModal}
                onDeleteEntity={handleDeleteEntity}
                onAiValidate={(entity) => sendMockUserMessage(buildEntityValidatePrompt(entity))}
                onAiBatchValidate={(scopeCode) =>
                  sendMockUserMessage(buildBatchValidatePrompt(scopeCode))
                }
              />
            </div>
          </div>
        </Splitter.Panel>
        <Splitter.Panel>
          <div style={{ height: 'calc(100vh - 56px)', overflow: 'auto' }}>{renderDetail()}</div>
        </Splitter.Panel>
      </Splitter>

      <Modal title="新建实体" open={createOpen} onOk={handleCreateEntity} onCancel={() => setCreateOpen(false)}>
        <Form form={createForm} layout="vertical" initialValues={{ entityKind: 'er_table' }}>
          <Form.Item
            name="code"
            label="Code (Scope:Entity)"
            rules={[{ required: true }, createEntityCodeUniqueRule(schema.entities || [])]}
          >
            <Input placeholder="sales:order:Order" />
          </Form.Item>
          <Form.Item name="label" label="显示名" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="entityKind" label="类型" rules={[{ required: true }]}>
            <Select
              options={[
                { label: 'ER 表', value: 'er_table' },
                { label: 'JSON 结构', value: 'json_schema' },
              ]}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.code !== cur.code || prev.entityKind !== cur.entityKind}>
            {({ getFieldValue }) => {
              if (getFieldValue('entityKind') !== 'er_table') return null;
              const code = getFieldValue('code') as string | undefined;
              const defaultName = code ? defaultTableNameFromCode(code) : '';
              return (
                <Form.Item
                  name="tableName"
                  label="表名（ER 可选）"
                  extra={code ? `不填则默认：${defaultName}` : '不填则将 code 中的 : 替换为 _'}
                  rules={[createTableNameUniqueRule(schema.entities || [])]}
                >
                  <Input placeholder={defaultName || 'equipment_device_equipment'} />
                </Form.Item>
              );
            }}
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="编辑实体" open={editOpen} onOk={handleEditEntity} onCancel={() => setEditOpen(false)}>
        <Form form={editForm} layout="vertical">
          <Form.Item
            name="code"
            label="Code (Scope:Entity)"
            rules={[
              { required: true },
              createEntityCodeUniqueRule(schema.entities || [], editingEntity?.id),
            ]}
            extra="修改 Code 将在同一事务中级联更新元数据、API 服务、物化记录、关系配置等引用，并同步重命名已物化的物理表/集合；任一步失败则全部回滚并提示错误"
          >
            <Input placeholder="fmms:production:WorkCard" />
          </Form.Item>
          <Form.Item name="label" label="显示名" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          {editingEntity?.entityKind === 'er_table' && (
            <Form.Item noStyle shouldUpdate={(prev, cur) => prev.code !== cur.code}>
              {({ getFieldValue }) => {
                const code = (getFieldValue('code') as string | undefined) || editingEntity?.code || '';
                const defaultName = code ? defaultTableNameFromCode(code) : '';
                return (
                  <Form.Item
                    name="tableName"
                    label="表名（ER 可选）"
                    extra={code ? `不填则默认：${defaultName}` : '不填则将 code 中的 : 替换为 _'}
                    rules={[createTableNameUniqueRule(schema.entities || [], editingEntity?.id)]}
                  >
                    <Input placeholder={defaultName || undefined} />
                  </Form.Item>
                );
              }}
            </Form.Item>
          )}
          <Form.Item name="status" label="状态">
            <Select
              options={[
                { label: '启用', value: 'enabled' },
                { label: '禁用', value: 'disabled' },
                { label: '归档', value: 'archived' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <EnumManager
        enums={schema.enums || []}
        open={enumModalOpen}
        onClose={() => setEnumModalOpen(false)}
        onRefresh={loadSchema}
      />

      <EntityDeletionModal
        open={!!deletingEntity}
        rootEntity={deletingEntity}
        onCancel={() => setDeletingEntity(null)}
        onDeleted={handleEntityDeletionDone}
      />
    </div>
  );
};

export default ModelDesigner;
