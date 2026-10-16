import { RobotOutlined } from '@ant-design/icons';
import { ProForm } from '@ant-design/pro-components';
import { sendMockUserMessage, useAISurface } from '@eadaf/ai-base';
import { Button, Popconfirm, Space, Spin } from 'antd';
import { message } from '@/utils/antdAppApis';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageContainerTitleWithBack from '@/components/PageContainerTitleWithBack';
import FixHeaderPage from '@/components/FixHeaderPage';
import CollectionPipelineForm, {
  type CollectionPipelineFormValues,
} from './components/CollectionPipelineForm';
import CollectionPipelineSectionNav from './components/CollectionPipelineSectionNav';
import { buildCollectionPipelineScriptPrompt } from '@/pages/BusinessData/ai/buildCollectionPipelineTestPrompt';
import {
  getCollectionPipeline,
  patchCollectionPipeline,
  postCollectionPipeline,
  postCollectionPipelinePublish,
} from '@/services/EADAF/api/businessData';
import { apiServiceStatusEnum } from '@/enums';
import { renderStatusBadge } from '@/utils/statusBadge';
import { getApiData, getApiErrorMessage, isApiSuccess } from '@/utils/apiResponse';

export type CollectionPipelinePageMode = 'create' | 'edit';

interface CollectionPipelineFormPageProps {
  mode: CollectionPipelinePageMode;
}

const CollectionPipelineFormPage: React.FC<CollectionPipelineFormPageProps> = ({ mode }) => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [form] = ProForm.useForm<CollectionPipelineFormValues>();
  const [loading, setLoading] = useState(mode !== 'create');
  const [submitting, setSubmitting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [meta, setMeta] = useState<API.CollectionPipeline | null>(null);
  const [sampleData, setSampleData] = useState('');
  const [targetStructure, setTargetStructure] = useState('');
  const [parseScript, setParseScript] = useState('');
  const [storeScript, setStoreScript] = useState('');
  const [entityId, setEntityId] = useState<string | undefined>();

  const sampleDataRef = useRef(sampleData);
  sampleDataRef.current = sampleData;
  const targetStructureRef = useRef(targetStructure);
  targetStructureRef.current = targetStructure;
  const parseScriptRef = useRef(parseScript);
  parseScriptRef.current = parseScript;
  const storeScriptRef = useRef(storeScript);
  storeScriptRef.current = storeScript;
  const pipelineIdRef = useRef(id);
  pipelineIdRef.current = id;

  const listPath = '/api_services/collection-pipelines';

  const loadPipeline = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await getCollectionPipeline(id);
      if (!isApiSuccess(res)) {
        message.error(getApiErrorMessage(res, '加载失败'));
        return;
      }
      const data = getApiData<API.CollectionPipeline>(res);
      if (!data) {
        message.error('采集管道不存在');
        return;
      }
      setMeta(data);
      setSampleData(data.sampleData || '');
      setTargetStructure(data.targetStructure || '');
      setParseScript(data.parseScript || '');
      setStoreScript(data.storeScript || '');
      setEntityId(data.entityId);
      form.setFieldsValue({
        scopeCode: data.scopeCode,
        pipelineSlug: data.pipelineSlug,
        name: data.name,
        description: data.description,
        protocolType: data.protocolType || 'serial',
        restrictSources: data.restrictSources,
        applicationIds: data.applicationIds,
        entityId: data.entityId,
      });
    } finally {
      setLoading(false);
    }
  }, [form, id]);

  useEffect(() => {
    if (mode === 'edit') void loadPipeline();
  }, [loadPipeline, mode]);

  useAISurface({
    id: mode === 'create' ? 'bizdata.collection-pipeline.create' : 'bizdata.collection-pipeline.edit',
    domain: 'bizdata',
    label: mode === 'create' ? '新建采集管道' : '编辑采集管道',
    read: () => {
      const values = form.getFieldsValue();
      return {
        pipelineId: pipelineIdRef.current,
        mode,
        code: meta?.code,
        scopeCode: values.scopeCode || meta?.scopeCode,
        pipelineSlug: values.pipelineSlug || meta?.pipelineSlug,
        name: values.name || meta?.name,
        protocolType: values.protocolType || meta?.protocolType,
        entityId: values.entityId || entityId,
        sampleData: sampleDataRef.current,
        targetStructure: targetStructureRef.current,
        parseScript: parseScriptRef.current,
        storeScript: storeScriptRef.current,
        restrictSources: values.restrictSources,
        applicationIds: values.applicationIds,
      };
    },
    applyMutation: (mutation) => {
      if (mutation.domain !== 'bizdata' || mutation.type !== 'collection_pipeline.updated') return;
      const payload = mutation.payload as API.CollectionPipeline | undefined;
      if (!payload) return;
      if (mutation.resourceId && mutation.resourceId !== pipelineIdRef.current) return;
      if (payload.sampleData != null) setSampleData(payload.sampleData);
      if (payload.targetStructure != null) setTargetStructure(payload.targetStructure);
      if (payload.parseScript != null) setParseScript(payload.parseScript);
      if (payload.storeScript != null) setStoreScript(payload.storeScript);
      setMeta((prev) => ({ ...prev, ...payload }));
      form.setFieldsValue({
        name: payload.name ?? form.getFieldValue('name'),
        protocolType: payload.protocolType ?? form.getFieldValue('protocolType'),
        scopeCode: payload.scopeCode ?? form.getFieldValue('scopeCode'),
        pipelineSlug: payload.pipelineSlug ?? form.getFieldValue('pipelineSlug'),
      });
    },
    matchMutation: (mutation) =>
      mutation.domain === 'bizdata' && mutation.type === 'collection_pipeline.updated',
  });

  const buildPayload = (values: CollectionPipelineFormValues) => ({
    scopeCode: values.scopeCode,
    pipelineSlug: values.pipelineSlug,
    name: String(values.name || '').trim(),
    description: values.description,
    protocolType: values.protocolType,
    restrictSources: values.restrictSources,
    applicationIds: values.applicationIds,
    entityId: values.entityId || entityId,
    sampleData: sampleData.trim() || undefined,
    targetStructure: targetStructure.trim() || undefined,
    parseScript: parseScript.trim() || undefined,
    storeScript: storeScript.trim() || undefined,
  });

  const submit = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      const payload = buildPayload(values);
      const res =
        mode === 'create'
          ? await postCollectionPipeline(payload)
          : await patchCollectionPipeline(id!, payload);

      if (!isApiSuccess(res)) {
        message.error(getApiErrorMessage(res, '保存失败'));
        return;
      }
      message.success('已保存');
      const data = getApiData<API.CollectionPipeline>(res);
      if (mode === 'create' && data?.id) {
        navigate(`${listPath}/${data.id}/edit`, { replace: true });
        return;
      }
      if (data) setMeta(data);
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) return;
      message.error(getApiErrorMessage(error, '保存失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const publish = async () => {
    if (!id) {
      message.warning('请先保存管道');
      return;
    }
    setPublishing(true);
    try {
      const values = await form.validateFields();
      await patchCollectionPipeline(id, buildPayload(values));
      const res = await postCollectionPipelinePublish(id);
      if (!isApiSuccess(res)) {
        message.error(getApiErrorMessage(res, '发布失败'));
        return;
      }
      message.success('已发布');
      await loadPipeline();
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) return;
      message.error(getApiErrorMessage(error, '发布失败'));
    } finally {
      setPublishing(false);
    }
  };

  const handleAiPolish = () => {
    const values = form.getFieldsValue();
    sendMockUserMessage(
      buildCollectionPipelineScriptPrompt({
        code: meta?.code || buildPreviewLabel(values),
        name: values.name || meta?.name,
        protocolType: values.protocolType || meta?.protocolType,
      }),
    );
  };

  const pageTitle =
    mode === 'create'
      ? '新建采集管道'
      : `编辑采集管道${meta?.code ? ` · ${meta.code}` : ''}`;

  const showPublishAction = mode === 'edit'
    && meta
    && (meta.status === 'draft' || meta.status === 'disabled' || !meta.status);

  const formBody = (
    <ProForm
      form={form}
      submitter={false}
      layout="vertical"
      initialValues={{ protocolType: 'serial', restrictSources: false }}
    >
      <CollectionPipelineForm
        form={form}
        mode={mode}
        sampleData={sampleData}
        onSampleDataChange={setSampleData}
        targetStructure={targetStructure}
        onTargetStructureChange={setTargetStructure}
        parseScript={parseScript}
        onParseScriptChange={setParseScript}
        storeScript={storeScript}
        onStoreScriptChange={setStoreScript}
        readonlyCode={meta?.code}
        entityId={entityId}
        onEntityIdChange={setEntityId}
      />
    </ProForm>
  );

  if (loading) {
    return (
      <FixHeaderPage title={<PageContainerTitleWithBack title={pageTitle} />}>
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <Spin description="加载中…" />
        </div>
      </FixHeaderPage>
    );
  }

  return (
    <FixHeaderPage
      title={<PageContainerTitleWithBack title={pageTitle} />}
      subTitle={
        mode === 'edit' && meta ? (
          <Space size={8} wrap>
            <span>版本 v{meta.version ?? 0}</span>
            {renderStatusBadge(
              meta.status === 'disabled' ? 'draft' : (meta.status || 'draft'),
              apiServiceStatusEnum,
            )}
            {showPublishAction ? (
              <Popconfirm title="确定发布该采集管道？" onConfirm={() => void publish()}>
                <Button size="small" type="primary" loading={publishing}>
                  发布
                </Button>
              </Popconfirm>
            ) : null}
          </Space>
        ) : mode === 'create' ? (
          '配置 Scope、样本数据与解析/存储脚本'
        ) : undefined
      }
      centerSlot={<CollectionPipelineSectionNav />}
      extra={
        <Space>
          {mode === 'edit' && id ? (
            <Button onClick={() => navigate(`${listPath}/${id}/test`)}>去测试</Button>
          ) : null}
          <Button className="ai-btn" icon={<RobotOutlined />} onClick={handleAiPolish}>
            AI 完善
          </Button>
          <Button type="primary" loading={submitting} onClick={() => void submit()}>
            保存
          </Button>
        </Space>
      }
    >
      {formBody}
    </FixHeaderPage>
  );
};

function buildPreviewLabel(values: CollectionPipelineFormValues) {
  const scope = String(values.scopeCode || '').trim();
  const slug = String(values.pipelineSlug || '').trim();
  if (scope && slug) return `${scope}:${slug}`;
  return undefined;
}

export default CollectionPipelineFormPage;
