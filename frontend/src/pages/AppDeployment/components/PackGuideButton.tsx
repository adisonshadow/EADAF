import { getPackGuide } from '@/services/EADAF/api/appDeployment';
import { message } from '@/utils/antdAppApis';
import { getApiData, isApiSuccess } from '@/utils/apiResponse';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { XMarkdown } from '@ant-design/x-markdown';
import '@ant-design/x-markdown/themes/light.css';
import { Button, Modal, Spin } from 'antd';
import React, { useState } from 'react';

const TITLE: Record<string, string> = {
  install: '安装包使用说明',
  upgrade: '升级包使用说明',
  patch: '补丁包使用说明',
};

/** 种类旁的帮助按钮：全屏打开将打进包里的那份使用说明。 */
const PackGuideButton: React.FC<{
  target: 'platform' | 'app';
  kind?: string;
}> = ({ target, kind }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [markdown, setMarkdown] = useState('');
  const currentKind = kind || 'install';

  const openGuide = async () => {
    setOpen(true);
    setLoading(true);
    setMarkdown('');
    try {
      const response = await getPackGuide(target, currentKind);
      if (!isApiSuccess(response)) {
        message.error(response?.message || '读取使用说明失败');
        return;
      }
      const data = getApiData<{ markdown?: string }>(response);
      setMarkdown(data?.markdown || '');
    } catch {
      message.error('读取使用说明失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        type="link"
        size="small"
        htmlType="button"
        icon={<QuestionCircleOutlined />}
        onClick={() => void openGuide()}
        style={{ paddingInline: 4, height: 'auto' }}
      >
        使用说明
      </Button>
      <Modal
        open={open}
        title={TITLE[currentKind] || '使用说明'}
        footer={null}
        onCancel={() => setOpen(false)}
        width="100vw"
        style={{ top: 0, margin: 0, paddingBottom: 0, maxWidth: '100vw' }}
        styles={{
          content: {
            height: '100vh',
            borderRadius: 0,
            display: 'flex',
            flexDirection: 'column',
          },
          body: { flex: 1, overflow: 'auto' },
        }}
      >
        {loading ? (
          <Spin />
        ) : (
          <XMarkdown content={markdown} openLinksInNewTab escapeRawHtml />
        )}
      </Modal>
    </>
  );
};

export default PackGuideButton;
