import { Button, Space, Spin, Typography } from 'antd';
import { message } from '@/utils/antdAppApis';
import React, { useEffect, useState } from 'react';
import MilkdownCrepeEditor from '@/components/MilkdownCrepeEditor';
import {
  getBusinessDataScopeDoc,
  putBusinessDataScopeDoc,
} from '@/services/EADAF/api/businessData';
import { getApiData, getApiErrorMessage, isApiSuccess } from '@/utils/apiResponse';

interface ScopeDocPanelProps {
  scopeCode: string;
  onClose?: () => void;
  onSaved?: (doc: API.BusinessDataScopeDoc) => void;
}

const HEADER_HEIGHT = 36;
const EDITOR_BOTTOM_GAP = 6;

const ScopeDocPanel: React.FC<ScopeDocPanelProps> = ({ scopeCode, onClose, onSaved }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contentMarkdown, setContentMarkdown] = useState('');
  const [editorKey, setEditorKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await getBusinessDataScopeDoc({ code: scopeCode });
        if (cancelled) return;
        if (!isApiSuccess(res)) {
          message.error(getApiErrorMessage(res, '加载 Scope 业务说明失败'));
          setContentMarkdown('');
          return;
        }
        const data = getApiData<API.BusinessDataScopeDoc>(res);
        setContentMarkdown(data?.contentMarkdown || '');
        setEditorKey(Date.now());
      } catch (error) {
        if (!cancelled) {
          message.error(getApiErrorMessage(error, '加载 Scope 业务说明失败'));
          setContentMarkdown('');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [scopeCode]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await putBusinessDataScopeDoc({
        code: scopeCode,
        contentMarkdown,
      });
      if (!isApiSuccess(res)) {
        message.error(getApiErrorMessage(res, '保存失败'));
        return;
      }
      const data = getApiData<API.BusinessDataScopeDoc>(res);
      message.success('业务说明已保存');
      if (data) onSaved?.(data);
    } catch (error) {
      message.error(getApiErrorMessage(error, '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '0 4px',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: HEADER_HEIGHT,
          flexShrink: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          padding: '0 10px',
        }}
      >
        <Typography.Text strong>业务说明 · {scopeCode}</Typography.Text>
        <Space size="small">
          {onClose ? (
            <Button size="small" onClick={onClose}>
              关闭
            </Button>
          ) : null}
          <Button size="small" type="primary" loading={saving} disabled={loading} onClick={() => void handleSave()}>
            保存
          </Button>
        </Space>
      </div>
      <div
        style={{
          height: `calc(100% - ${HEADER_HEIGHT + EDITOR_BOTTOM_GAP}px)`,
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {loading ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spin />
          </div>
        ) : (
          <MilkdownCrepeEditor
            editorKey={editorKey}
            value={contentMarkdown}
            onChange={setContentMarkdown}
            placeholder="在此编写 Scope 业务说明…"
            minHeight={0}
            style={{ height: '100%', minHeight: '100%' }}
          />
        )}
      </div>
    </div>
  );
};

export default ScopeDocPanel;
