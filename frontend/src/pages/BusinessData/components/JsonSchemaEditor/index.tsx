import Editor from '@monaco-editor/react';
import { Button } from 'antd';
import { message } from '@/utils/antdAppApis';
import React, { useEffect, useState } from 'react';
import { patchBusinessDataEntity } from '@/services/EADAF/api/businessData';

interface JsonSchemaEditorProps {
  entity: API.BusinessDataEntity;
  onSaved: () => void;
}

const JsonSchemaEditor: React.FC<JsonSchemaEditorProps> = ({ entity, onSaved }) => {
  const [value, setValue] = useState('{}');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(JSON.stringify(entity.jsonSchema || {}, null, 2));
  }, [entity]);

  const handleSave = async () => {
    try {
      const parsed = JSON.parse(value);
      setSaving(true);
      await patchBusinessDataEntity(entity.id!, { jsonSchema: parsed });
      message.success('JSON Schema 已保存');
      onSaved();
    } catch {
      message.error('JSON 格式无效');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Button type="primary" loading={saving} onClick={handleSave} style={{ marginBottom: 12 }}>
        保存 JSON Schema
      </Button>
      <Editor
        height="400px"
        defaultLanguage="json"
        value={value}
        onChange={(v) => setValue(v || '{}')}
        options={{ minimap: { enabled: false }, fontSize: 13 }}
      />
    </div>
  );
};

export default JsonSchemaEditor;
