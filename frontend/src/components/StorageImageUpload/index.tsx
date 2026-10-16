import { PlusOutlined } from '@ant-design/icons';
import { Upload, Space, Typography } from 'antd';
import { message } from '@/utils/antdAppApis';
import type { UploadFile, UploadProps } from 'antd';
import ImgCrop from 'antd-img-crop';
import React, { useEffect, useRef, useState } from 'react';
import { SYSTEM_STORAGE_BUCKET_CODE } from '@/constants/storage';
import { postStorageObjectUpload } from '@/services/EADAF/api/storage';
import { isApiSuccess, getApiData } from '@/utils/apiResponse';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import { isSvgFile, prepareLogoUploadFile } from '@/utils/prepareLogoUploadFile';

const { Text } = Typography;

export interface StorageImageUploadProps {
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  /** 压缩长边上限（像素） */
  maxEdge?: number;
  aspect?: number;
  uploadLabel?: string;
  hint?: React.ReactNode;
}

const StorageImageUpload: React.FC<StorageImageUploadProps> = ({
  value,
  onChange,
  disabled,
  maxEdge = 648,
  aspect = 1,
  uploadLabel = '上传图片',
  hint,
}) => {
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const blobUrlRef = useRef<string | undefined>(undefined);

  const revokeBlob = () => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = undefined;
    }
  };

  useEffect(() => {
    const previewUrl = resolveMediaUrl(value);
    if (previewUrl) {
      setFileList([
        {
          uid: value || '-1',
          name: 'image',
          status: 'done',
          url: previewUrl,
        },
      ]);
      revokeBlob();
    } else if (!blobUrlRef.current) {
      setFileList([]);
    }
  }, [value]);

  useEffect(() => () => revokeBlob(), []);

  const customRequest: UploadProps['customRequest'] = async ({ file, onSuccess, onError }) => {
    try {
      const prepared = await prepareLogoUploadFile(file as File, maxEdge);
      revokeBlob();
      const localUrl = URL.createObjectURL(prepared);
      blobUrlRef.current = localUrl;
      setFileList([
        {
          uid: 'uploading',
          name: prepared.name,
          status: 'uploading',
          url: localUrl,
        },
      ]);

      const fd = new FormData();
      fd.append('file', prepared);
      fd.append('bucketCode', SYSTEM_STORAGE_BUCKET_CODE);
      const res = await postStorageObjectUpload(fd);
      if (!isApiSuccess(res)) {
        message.error('上传失败');
        revokeBlob();
        setFileList([]);
        onError?.(new Error('上传失败'));
        return;
      }
      const data = getApiData<API.StorageObject>(res);
      if (!data?.objectId) {
        revokeBlob();
        setFileList([]);
        onError?.(new Error('无效响应'));
        return;
      }

      const previewUrl = resolveMediaUrl(data.objectId) || localUrl;
      setFileList([
        {
          uid: data.objectId,
          name: data.name || 'image',
          status: 'done',
          url: previewUrl,
        },
      ]);
      onChange?.(data.objectId);
      onSuccess?.(data);
      message.success('上传成功');
    } catch (error) {
      revokeBlob();
      setFileList([]);
      onError?.(error as Error);
      message.error('上传失败');
    }
  };

  const beforeUpload: UploadProps['beforeUpload'] = (file) => {
    const isImage = file.type.startsWith('image/') || isSvgFile(file);
    if (!isImage) {
      message.error('只能上传图片文件');
      return Upload.LIST_IGNORE;
    }
    return true;
  };

  const uploadNode = (
    <ImgCrop
      rotationSlider
      aspect={aspect}
      quality={0.9}
      fillColor="transparent"
      beforeCrop={(file) => !isSvgFile(file)}
    >
      <Upload
        listType="picture-card"
        fileList={fileList}
        maxCount={1}
        disabled={disabled}
        customRequest={customRequest}
        beforeUpload={beforeUpload}
        onRemove={() => {
          revokeBlob();
          setFileList([]);
          onChange?.('');
          return true;
        }}
        accept="image/*,.svg"
      >
        {fileList.length >= 1 ? null : (
          <div>
            <PlusOutlined />
            <div style={{ marginTop: 8 }}>{uploadLabel}</div>
          </div>
        )}
      </Upload>
    </ImgCrop>
  );

  if (!hint) {
    return uploadNode;
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {uploadNode}
      <Text type="secondary" style={{ fontSize: 12 }}>
        {hint}
      </Text>
    </Space>
  );
};

export default StorageImageUpload;
