import { PageContainer } from '@ant-design/pro-components';
import { Alert, Button, Card, Checkbox, Space, Spin, Table, Typography } from 'antd';
import { message, modal } from '@/utils/antdAppApis';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageContainerTitleWithBack from '@/components/PageContainerTitleWithBack';
import {
  deleteApplicationsId,
  getApplicationsIdDeletePreview,
} from '@/services/EADAF/api/applications';
import { getApiData, isApiSuccess } from '@/utils/apiResponse';
import { SYSTEM_APPLICATION_CODE } from './Schemas';

const { Text, Paragraph } = Typography;

const ApplicationDeletePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const listPath = '/service_provider';

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<API.ApplicationDeletePreview | null>(null);
  const [deleteBizdata, setDeleteBizdata] = useState(true);
  const [dropPhysicalTables, setDropPhysicalTables] = useState(false);
  const [deleteBuckets, setDeleteBuckets] = useState(false);

  const loadPreview = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await getApplicationsIdDeletePreview({ id });
      if (!isApiSuccess(res)) {
        message.error(res.message || '加载删除预览失败');
        navigate(listPath, { replace: true });
        return;
      }
      const data = getApiData<API.ApplicationDeletePreview>(res);
      if (!data?.application) {
        message.error('应用不存在');
        navigate(listPath, { replace: true });
        return;
      }
      if (data.application.code === SYSTEM_APPLICATION_CODE) {
        message.warning('系统内置应用不可删除');
        navigate(listPath, { replace: true });
        return;
      }
      setPreview(data);
    } catch {
      message.error('加载删除预览失败');
      navigate(listPath, { replace: true });
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const counts = preview?.cascade?.counts;
  const scopeCodes = preview?.cascade?.entityScopeCodes || [];
  const bizdataTotal =
    (counts?.entities || 0) +
    (counts?.apiServices || 0) +
    (counts?.pipelines || 0) +
    (counts?.metrics || 0) +
    (counts?.webhooks || 0) +
    (counts?.hooks || 0) +
    (counts?.enums || 0);

  const handleSubmit = () => {
    if (!id || !preview?.application) return;
    const app = preview.application;
    const bucketCount = preview.bucketCount || 0;
    const objectCount = preview.objectCount || 0;

    const parts: string[] = [];
    if (deleteBizdata) {
      parts.push(
        `将按 scope [${scopeCodes.join(', ') || '未配置'}] 级联删除业务数据` +
          `（实体 ${counts?.entities ?? 0}、API ${counts?.apiServices ?? 0}、` +
          `管道 ${counts?.pipelines ?? 0}、指标 ${counts?.metrics ?? 0}、` +
          `物化记录 ${counts?.materializations ?? 0} 等）` +
          (dropPhysicalTables ? '，并 DROP 已物化的物理表/集合' : '（不 DROP 物理表）'),
      );
    } else {
      parts.push('仅删除应用记录，保留数据模型 / API / 物化等业务数据。');
    }
    if (deleteBuckets) {
      parts.push(
        `同时删除归属 Bucket ${bucketCount} 个及文件 ${objectCount} 个（系统内置 Bucket 跳过）。`,
      );
    }

    modal.confirm({
      title: '最终确认删除',
      content: (
        <div>
          <Paragraph>
            即将永久删除应用「{app.name}」（{app.code}）。
          </Paragraph>
          {parts.map((p) => (
            <Paragraph key={p}>{p}</Paragraph>
          ))}
          <Paragraph type="danger" style={{ marginBottom: 0 }}>
            此操作不可撤销，请再次确认。
          </Paragraph>
        </div>
      ),
      okText: '确认删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        setSubmitting(true);
        try {
          const res = await deleteApplicationsId(
            { id },
            { deleteBizdata, dropPhysicalTables, deleteBuckets },
          );
          if (!isApiSuccess(res)) {
            message.error({ content: res.message || '删除失败', duration: 30 });
            return;
          }
          const data = getApiData<{
            cascade?: { deletedEntities?: number; deletedApiServices?: number };
            deletedBuckets?: number;
            deletedObjects?: number;
            skippedSystemBuckets?: number;
          }>(res);
          const bits: string[] = ['应用已删除'];
          if (deleteBizdata && data?.cascade) {
            bits.push(
              `业务数据：实体 ${data.cascade.deletedEntities ?? 0}、API ${data.cascade.deletedApiServices ?? 0}`,
            );
          }
          if (deleteBuckets && data) {
            bits.push(
              `Bucket ${data.deletedBuckets ?? 0}、文件 ${data.deletedObjects ?? 0}` +
                (data.skippedSystemBuckets
                  ? `（跳过系统 Bucket ${data.skippedSystemBuckets}）`
                  : ''),
            );
          }
          message.success(bits.join('；'));
          navigate(listPath, { replace: true });
        } catch {
          message.error({ content: '删除失败', duration: 30 });
        } finally {
          setSubmitting(false);
        }
      },
    });
  };

  const buckets = preview?.buckets || [];
  const app = preview?.application;
  const cascadeRows = [
    { key: 'entities', label: '数据模型（实体）', value: counts?.entities ?? 0 },
    { key: 'materializations', label: '物化记录', value: counts?.materializations ?? 0 },
    { key: 'apiServices', label: 'API 服务', value: counts?.apiServices ?? 0 },
    { key: 'pipelines', label: '采集管道', value: counts?.pipelines ?? 0 },
    { key: 'metrics', label: '指标', value: counts?.metrics ?? 0 },
    { key: 'webhooks', label: 'Outbound Webhook', value: counts?.webhooks ?? 0 },
    { key: 'hooks', label: '自动化 Hook', value: counts?.hooks ?? 0 },
    { key: 'enums', label: '枚举', value: counts?.enums ?? 0 },
    { key: 'scopeDocs', label: 'Scope 文档', value: counts?.scopeDocs ?? 0 },
    { key: 'dedicatedSkills', label: '仅本应用的专用 Skill', value: counts?.dedicatedSkills ?? 0 },
    { key: 'exclusiveTools', label: '仅被这些 Skill 使用的 Tool', value: counts?.exclusiveTools ?? 0 },
  ];

  return (
    <PageContainer
      title={
        <PageContainerTitleWithBack title="删除应用" backTo={listPath} />
      }
    >
      <Spin spinning={loading}>
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="warning"
            showIcon
            message="删除应用后不可恢复"
            description="默认会按应用配置的 bizdata_scope_codes / api_data_scope 级联删除数据模型、API、管道、指标等（与导出命中规则一致）。Bucket 与物理物化表需单独勾选。"
          />

          <Card size="small" title="应用信息" loading={loading && !app}>
            {app ? (
              <Space orientation="vertical" size={4}>
                <Text>
                  名称：<Text strong>{app.name}</Text>
                </Text>
                <Text>
                  编码：<Text code>{app.code}</Text>
                </Text>
                <Text type="secondary">ID：{app.application_id}</Text>
                <Text type="secondary">
                  Scope：{scopeCodes.length ? scopeCodes.join(', ') : '未配置（将不会命中业务数据）'}
                </Text>
              </Space>
            ) : null}
          </Card>

          <Card size="small" title={`Scope 业务数据（合计命中约 ${bizdataTotal} 项）`}>
            <Table
              size="small"
              rowKey="key"
              pagination={false}
              dataSource={cascadeRows}
              columns={[
                { title: '类型', dataIndex: 'label' },
                {
                  title: '数量',
                  dataIndex: 'value',
                  width: 100,
                  render: (v: number) => v,
                },
              ]}
            />
            {(counts?.lockedEntities || 0) > 0 ? (
              <Alert
                style={{ marginTop: 12 }}
                type="info"
                showIcon
                message={`其中 ${counts?.lockedEntities} 个实体当前已锁定；级联删除时会自动解锁后删除。`}
              />
            ) : null}
            <div style={{ marginTop: 16 }}>
              <Checkbox
                checked={deleteBizdata}
                onChange={(e) => {
                  setDeleteBizdata(e.target.checked);
                  if (!e.target.checked) setDropPhysicalTables(false);
                }}
              >
                同时删除 Scope 命中的数据模型、API、管道、指标、Webhook、Hook，以及仅绑定本应用的专用 Skill 和只被它们使用的 Tool
              </Checkbox>
              <div style={{ color: '#888', fontSize: 12, marginTop: 4, marginLeft: 24 }}>
                匹配规则与「应用导出」一致：优先 bizdata_scope_codes，否则回退 api_data_scope.domainCodes。
              </div>
              <div style={{ marginTop: 12, marginLeft: 24 }}>
                <Checkbox
                  checked={dropPhysicalTables}
                  disabled={!deleteBizdata || !(counts?.materializations)}
                  onChange={(e) => setDropPhysicalTables(e.target.checked)}
                >
                  同时 DROP 已物化的物理表 / 集合（不可恢复）
                </Checkbox>
                <div style={{ color: '#888', fontSize: 12, marginTop: 4, marginLeft: 24 }}>
                  仅删除元数据时，外部库中的物理表仍会保留；勾选此项才会真正 DROP。
                </div>
              </div>
            </div>
          </Card>

          <Card
            size="small"
            title={`来源应用 Bucket（${preview?.bucketCount ?? 0}） / 文件对象（${preview?.objectCount ?? 0}）`}
          >
            <Table
              size="small"
              rowKey={(r) => r.bucketId || r.code || String(Math.random())}
              pagination={false}
              dataSource={buckets}
              locale={{ emptyText: '该应用下没有归属的 Bucket' }}
              columns={[
                { title: '编码', dataIndex: 'code', width: 160 },
                { title: '名称', dataIndex: 'name' },
                {
                  title: '文件数',
                  dataIndex: 'objectCount',
                  width: 90,
                  render: (v: number) => v ?? 0,
                },
                {
                  title: '说明',
                  width: 120,
                  render: (_, r) => (r.isSystem ? '系统内置（不可删）' : '可随应用删除'),
                },
              ]}
            />
            <div style={{ marginTop: 16 }}>
              <Checkbox
                checked={deleteBuckets}
                disabled={!buckets.some((b) => !b.isSystem)}
                onChange={(e) => setDeleteBuckets(e.target.checked)}
              >
                同时删除来源应用的 Bucket 及 Bucket 下的文件
              </Checkbox>
              <div style={{ color: '#888', fontSize: 12, marginTop: 4, marginLeft: 24 }}>
                仅影响上表中归属本应用的 Bucket；系统内置 Bucket 即使勾选也会跳过。
              </div>
            </div>
          </Card>

          <Space>
            <Button onClick={() => navigate(listPath)}>取消</Button>
            <Button type="primary" danger loading={submitting} onClick={handleSubmit}>
              提交删除
            </Button>
          </Space>
        </Space>
      </Spin>
    </PageContainer>
  );
};

export default ApplicationDeletePage;
