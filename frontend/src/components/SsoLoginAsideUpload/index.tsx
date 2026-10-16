import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Space, Typography, Upload, theme } from 'antd';
import { message } from '@/utils/antdAppApis';
import type { UploadProps } from 'antd';
import React, { useState } from 'react';
import Lottie from 'react-lottie-player';
import { SYSTEM_STORAGE_BUCKET_CODE } from '@/constants/storage';
import { postStorageObjectUpload } from '@/services/EADAF/api/storage';
import { isApiSuccess, getApiData } from '@/utils/apiResponse';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import { isSvgFile } from '@/utils/prepareLogoUploadFile';
import type { SsoLoginAsideKind } from '@/utils/ssoLoginPage';

const { Text } = Typography;

const MAX_FILE_BYTES = 8 * 1024 * 1024;

interface SsoLoginAsideUploadProps {
  value?: string | null;
  onChange?: (value: string) => void;
  kind: SsoLoginAsideKind;
  disabled?: boolean;
}

async function assertLottieJson(file: File): Promise<boolean> {
  try {
    const text = await file.text();
    const json = JSON.parse(text) as { layers?: unknown };
    return Boolean(json && typeof json === 'object' && Array.isArray(json.layers));
  } catch {
    return false;
  }
}

const SsoLoginAsideUpload: React.FC<SsoLoginAsideUploadProps> = ({
  value,
  onChange,
  kind,
  disabled,
}) => {
  const { token } = theme.useToken();
  const [uploading, setUploading] = useState(false);
  const previewUrl = resolveMediaUrl(value);

  const customRequest: UploadProps['customRequest'] = async ({ file, onSuccess, onError }) => {
    try {
      setUploading(true);
      const fd = new FormData();
      fd.append('file', file as File);
      fd.append('bucketCode', SYSTEM_STORAGE_BUCKET_CODE);
      const res = await postStorageObjectUpload(fd);
      if (!isApiSuccess(res)) {
        message.error('上传失败');
        onError?.(new Error('上传失败'));
        return;
      }
      const data = getApiData<API.StorageObject>(res);
      if (!data?.objectId) {
        onError?.(new Error('无效响应'));
        return;
      }
      onChange?.(data.objectId);
      onSuccess?.(data);
      message.success('上传成功');
    } catch (error) {
      onError?.(error as Error);
      message.error('上传失败');
    } finally {
      setUploading(false);
    }
  };

  const beforeUpload: UploadProps['beforeUpload'] = async (file) => {
    if (file.size > MAX_FILE_BYTES) {
      message.error('文件大小不能超过 8MB');
      return Upload.LIST_IGNORE;
    }
    if (kind === 'lottie') {
      const nameOk = file.name.toLowerCase().endsWith('.json');
      const typeOk =
        !file.type || file.type === 'application/json' || file.type === 'text/plain';
      if (!nameOk && !typeOk) {
        message.error('请上传 Lottie JSON 文件');
        return Upload.LIST_IGNORE;
      }
      const valid = await assertLottieJson(file);
      if (!valid) {
        message.error('不是有效的 Lottie JSON（需包含 layers）');
        return Upload.LIST_IGNORE;
      }
      return true;
    }
    const isImage = file.type.startsWith('image/') || isSvgFile(file);
    if (!isImage) {
      message.error('请上传图片文件（支持 SVG）');
      return Upload.LIST_IGNORE;
    }
    return true;
  };

  const previewBoxStyle: React.CSSProperties = {
    width: 200,
    height: 160,
    border: `1px dashed ${token.colorBorder}`,
    borderRadius: token.borderRadiusLG,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#212747',
  };

  return (
    <Space orientation="vertical" size={8} style={{ width: '100%' }}>
      <div style={previewBoxStyle}>
        {kind === 'lottie' && previewUrl ? (
          <Lottie path={previewUrl} play loop style={{ width: '100%', height: '100%' }} />
        ) : kind === 'image' && previewUrl ? (
          <img
            src={previewUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ) : (
          <Text type="secondary" style={{ padding: 16, textAlign: 'center' }}>
            未上传，登录页将使用默认动画
          </Text>
        )}
      </div>
      <Space>
        <Upload
          accept={kind === 'lottie' ? '.json,application/json' : 'image/*,.svg'}
          showUploadList={false}
          maxCount={1}
          disabled={disabled || uploading}
          customRequest={customRequest}
          beforeUpload={beforeUpload}
        >
          <Button icon={<PlusOutlined />} loading={uploading} disabled={disabled}>
            {kind === 'lottie' ? '选择 Lottie JSON' : '选择图片'}
          </Button>
        </Upload>
        {value ? (
          <Button
            type="link"
            danger
            icon={<DeleteOutlined />}
            disabled={disabled}
            onClick={() => onChange?.('')}
          >
            移除
          </Button>
        ) : null}
      </Space>
      <Text type="secondary" style={{ fontSize: 12 }}>
        {kind === 'lottie'
          ? `上传 Bodymovin / Lottie JSON，不超过 8MB。存储于「${SYSTEM_STORAGE_BUCKET_CODE}」`
          : `支持 jpg、png、gif、webp、SVG，不超过 8MB。存储于「${SYSTEM_STORAGE_BUCKET_CODE}」`}
      </Text>
    </Space>
  );
};

export default SsoLoginAsideUpload;
