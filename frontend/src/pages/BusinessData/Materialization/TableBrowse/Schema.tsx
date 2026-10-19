import { PageContainer } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import { UnifiedProTable } from '@/components/UnifiedProTable';
import { Alert, Spin, Tag, Typography } from 'antd';
import { message } from '@/utils/antdAppApis';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import PageContainerTitleWithBack from '@/components/PageContainerTitleWithBack';
import { getMaterializedTableSchema } from '@/services/EADAF/api/businessData';
import { getApiData, getApiErrorMessage, isApiSuccess } from '@/utils/apiResponse';

function formatDbType(dbType?: string) {
  if (dbType === 'mongodb') return 'MongoDB';
  if (dbType === 'redis') return 'Redis';
  if (dbType === 'postgresql') return 'PostgreSQL';
  if (dbType === 'mysql') return 'MySQL';
  return dbType || '-';
}

const TableSchemaPage: React.FC = () => {
  const navigate = useNavigate();
  const { entityId } = useParams<{ entityId: string }>();
  const [searchParams] = useSearchParams();
  const connectionId = searchParams.get('connectionId') || undefined;
  const [loading, setLoading] = useState(true);
  const [schema, setSchema] = useState<API.MaterializedTableSchema | null>(null);

  useEffect(() => {
    if (!entityId || !connectionId) {
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const res = await getMaterializedTableSchema(entityId, { connectionId });
        if (isApiSuccess(res)) {
          setSchema(getApiData(res) || null);
        } else {
          message.error(getApiErrorMessage(res, '加载表结构失败'));
        }
      } catch (error) {
        message.error(getApiErrorMessage(error, '加载表结构失败'));
      } finally {
        setLoading(false);
      }
    })();
  }, [entityId, connectionId]);

  const columns: ProColumns<API.MaterializedTableColumn>[] = useMemo(
    () => [
      { title: '字段名', dataIndex: 'name', width: 160 },
      {
        title: '类型',
        dataIndex: 'type',
        width: 140,
        render: (_, r) => <Tag>{r.type}</Tag>,
      },
      {
        title: '可空',
        dataIndex: 'nullable',
        width: 72,
        render: (_, r) => (r.nullable ? '是' : '否'),
      },
      {
        title: '默认值',
        dataIndex: 'default',
        ellipsis: true,
        render: (_, r) => (r.default != null && r.default !== '' ? String(r.default) : '-'),
      },
      { title: '说明', dataIndex: 'comment', ellipsis: true },
    ],
    [],
  );

  if (!connectionId) {
    return (
      <PageContainer>
        <Alert type="error" showIcon title="缺少 connectionId 参数" />
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title={
        <PageContainerTitleWithBack
          title={schema ? `${schema.entityLabel} · 表结构` : '表结构'}
        />
      }
    >
      <Spin spinning={loading}>
        {schema && (
          <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
            {schema.connectionName} · {formatDbType(schema.dbType)} · {schema.targetSchema}.
            {schema.tableName}
          </Typography.Paragraph>
        )}
        <UnifiedProTable<API.MaterializedTableColumn>
          rowKey="name"
          search={false}
          options={false}
          pagination={false}
          columns={columns}
          dataSource={schema?.columns || []}
          scroll={{ x: 720 }}
        />
      </Spin>
    </PageContainer>
  );
};

export default TableSchemaPage;
