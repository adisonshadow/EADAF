import { Button, Popover, Typography } from 'antd';
import { DatabaseOutlined } from '@ant-design/icons';
import React, { useEffect, useMemo, useState } from 'react';
import { getBusinessDataSchema } from '@/services/EADAF/api/businessData';
import { getApiData, isApiSuccess } from '@/utils/apiResponse';
import './index.css';

const { Text } = Typography;

function parseRefEntityCode(refEntity: string) {
  const raw = String(refEntity || '').trim();
  if (!raw) return '';
  return raw.startsWith('@') ? raw.slice(1) : raw;
}

function pgTypeToTsType(field: API.BusinessDataField) {
  const pgType = String(field.typeormConfig?.type || 'varchar').toLowerCase();
  if (['int', 'integer', 'bigint', 'smallint', 'numeric', 'decimal', 'float', 'double', 'real'].some((t) => pgType.includes(t))) {
    return 'number';
  }
  if (pgType.includes('bool')) return 'boolean';
  if (pgType.includes('json')) return 'Record<string, unknown>';
  if (pgType.includes('uuid')) return 'string';
  if (pgType.includes('timestamp') || pgType.includes('date')) return 'string';
  return 'string';
}

function buildEntityInterface(entity?: API.BusinessDataEntity | null) {
  if (!entity) return '// 未找到对应实体';
  const name = `${entity.code?.split(':').pop() || 'Entity'}Record`;
  const fields = entity.fields || [];
  if (!fields.length) {
    return `interface ${name} {\n  [key: string]: unknown;\n}`;
  }
  const lines = [`interface ${name} {`];
  fields.forEach((field) => {
    const key = field.fieldKey;
    if (!key) return;
    const label = field.columnInfo?.label || key;
    const nullable = field.typeormConfig?.nullable !== false && key !== 'id';
    lines.push(`  /** ${label} */`);
    lines.push(`  ${key}${nullable ? '?' : ''}: ${pgTypeToTsType(field)};`);
  });
  lines.push('}');
  return lines.join('\n');
}

function RefEntityButton({ refEntity }: { refEntity: string }) {
  const [entities, setEntities] = useState<API.BusinessDataEntity[]>([]);
  const entityCode = parseRefEntityCode(refEntity);
  const entity = useMemo(
    () => entities.find((item) => item.code === entityCode),
    [entities, entityCode],
  );

  useEffect(() => {
    void (async () => {
      const res = await getBusinessDataSchema();
      if (isApiSuccess(res)) {
        const schema = getApiData<API.BusinessDataSchema>(res);
        setEntities(schema?.entities || []);
      }
    })();
  }, []);

  const interfaceText = buildEntityInterface(entity);

  return (
    <Popover
      trigger="click"
      title={
        <span>
          <DatabaseOutlined style={{ marginRight: 6 }} />
          {entity?.label || entityCode || refEntity}
        </span>
      }
      content={(
        <div className="response-document-panel__entity-popover">
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            实体 code: <Text code>{entityCode || refEntity}</Text>
          </Text>
          <pre className="response-document-panel__entity-interface">{interfaceText}</pre>
        </div>
      )}
    >
      <Button type="link" size="small" className="response-document-panel__ref-btn">
        {refEntity}
      </Button>
    </Popover>
  );
}

function JsonTreeNode({
  data,
  indent = 0,
}: {
  data: unknown;
  indent?: number;
}) {
  const pad = '  '.repeat(indent);

  if (data == null || typeof data !== 'object') {
    return <span>{JSON.stringify(data)}</span>;
  }

  if (Array.isArray(data)) {
    if (!data.length) return <span>[]</span>;
    return (
      <span>
        {'[\n'}
        {data.map((item, index) => (
          <React.Fragment key={index}>
            {pad}  
            <JsonTreeNode data={item} indent={indent + 1} />
            {index < data.length - 1 ? ',\n' : '\n'}
          </React.Fragment>
        ))}
        {pad}]
      </span>
    );
  }

  const record = data as Record<string, unknown>;
  if (record.$refEntity && typeof record.$refEntity === 'string' && Object.keys(record).length === 1) {
    return <RefEntityButton refEntity={record.$refEntity} />;
  }

  const entries = Object.entries(record);
  if (!entries.length) return <span>{'{}'}</span>;

  return (
    <span>
      {'{\n'}
      {entries.map(([key, value], index) => (
        <React.Fragment key={key}>
          {pad}  
          <span className="response-document-panel__json-key">&quot;{key}&quot;</span>
          {': '}
          {key === '$refEntity' && typeof value === 'string' ? (
            <RefEntityButton refEntity={value} />
          ) : (
            <JsonTreeNode data={value} indent={indent + 1} />
          )}
          {index < entries.length - 1 ? ',\n' : '\n'}
        </React.Fragment>
      ))}
      {pad}
      {'}'}
    </span>
  );
}

export function ResponseSchemaViewer({ value }: { value: unknown }) {
  return (
    <pre className="response-document-panel__viewer">
      <JsonTreeNode data={value} />
    </pre>
  );
}

export function ResponseExampleViewer({ value }: { value: unknown }) {
  return (
    <pre className="response-document-panel__viewer">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
