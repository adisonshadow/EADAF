import { DeleteOutlined, DownloadOutlined, EyeOutlined, PauseCircleOutlined, PlayCircleOutlined, ScissorOutlined, UploadOutlined } from '@ant-design/icons';
import { ActionType, PageContainer, ProColumns } from '@ant-design/pro-components';
import { UnifiedProTable } from '@/components/UnifiedProTable';
import { UrlSyncedProTable } from '@/components/UrlSyncedProTable';
import { Button, Image, Input, Modal, Progress, Select, Space, Table, Upload, Tooltip, Typography } from 'antd';
import { message, modal } from '@/utils/antdAppApis';
import React, { useRef, useState, useMemo } from 'react';
import { useAIChatPrompts, useChatReference } from '@eadaf/ai-base';
import { buildStorageBrowserPrompts } from '@/ai/pageChatPrompts';
import { buildStorageObjectReference } from '@/ai/chatReferenceBuilders';
import { augmentColumnsWithChatReference } from '@/utils/augmentColumnsWithChatReference';
import { getApplications } from '@/services/EADAF/api/applications';
import {
  deleteStorageObject,
  getStorageBuckets,
  getStorageCropUrl,
  getStorageDownloadUrl,
  getStorageObjects,
  getStoragePreviewUrl,
} from '@/services/EADAF/api/storage';
import { resolveApiUrl } from '@/constants/env';
import { DEFAULT_PRO_TABLE_OPTIONS } from '@/constants/proTable';
import { useProTableSearchCollapse } from '@/hooks/useProTableSearchCollapse';
import { TABLE_ACTION_COLUMN_BASE, TableActionButton, TableActions } from '@/components/TableActions';
import { isApiSuccess, parseApiListResponse } from '@/utils/apiResponse';
import { request } from '@/utils/request';
import { startStorageTusUpload, type TusUploadHandle } from '@/utils/tusStorageUpload';

type ObjectRecord = API.StorageObject;

const BROWSER_FILTER_KEYS = ['name', 'bucketId', 'mimeType', 'applicationId'] as const;

async function loadBucketSelectOptions() {
  const res = await getStorageBuckets({ size: 200 });
  const { items } = parseApiListResponse<API.StorageBucket>(res);
  return items
    .filter((bucket): bucket is API.StorageBucket & { bucketId: string } => Boolean(bucket.bucketId))
    .map((bucket) => ({
      label: bucket.name || bucket.code || bucket.bucketId,
      value: bucket.bucketId,
    }));
}

async function loadApplicationSelectOptions() {
  const res = await getApplications({ size: -1 });
  const { items } = parseApiListResponse<API.Application>(res);
  return items
    .filter((app): app is API.Application & { application_id: string } => Boolean(app.application_id))
    .map((app) => ({
      label: app.name || app.code || app.application_id,
      value: app.application_id,
    }));
}

function formatSize(size?: number) {
  if (!size) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

async function fetchStorageBlob(objectId: string, preview: boolean): Promise<Blob> {
  const path = preview ? getStoragePreviewUrl(objectId) : getStorageDownloadUrl(objectId);
  const blob = await request<Blob>(path, { responseType: 'blob', skipErrorHandler: true });
  if (blob.type?.includes('application/json')) {
    const text = await blob.text();
    try {
      const err = JSON.parse(text) as { message?: string };
      throw new Error(err.message || '请求失败');
    } catch (e) {
      if (e instanceof Error && e.message !== '请求失败') throw e;
      throw new Error('请求失败');
    }
  }
  return blob;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const BrowserPage: React.FC = () => {
  const actionRef = useRef<ActionType | undefined>(undefined);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [cropGuideOpen, setCropGuideOpen] = useState(false);
  const [demoObjectId, setDemoObjectId] = useState('');
  const [demoW, setDemoW] = useState('200');
  const [demoH, setDemoH] = useState('200');
  const [demoFit, setDemoFit] = useState<'cover' | 'contain'>('contain');
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [previewName, setPreviewName] = useState<string>();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [uploadingBucketCode, setUploadingBucketCode] = useState<string>();
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploadFilename, setUploadFilename] = useState<string>();
  const [uploadPaused, setUploadPaused] = useState(false);
  const uploadHandleRef = useRef<TusUploadHandle | null>(null);
  const { references } = useChatReference();
  const chatPrompts = useMemo(() => buildStorageBrowserPrompts(references), [references]);
  useAIChatPrompts(chatPrompts);
  const search = useProTableSearchCollapse('file-storage.browser');

  const demoCropUrl = useMemo(() => {
    const objectId = demoObjectId.trim() || '{objectId}';
    const params: { w?: number; h?: number; fit?: typeof demoFit } = {};
    const w = Number.parseInt(demoW, 10);
    const h = Number.parseInt(demoH, 10);
    if (!Number.isNaN(w) && w > 0) params.w = w;
    if (!Number.isNaN(h) && h > 0) params.h = h;
    if (demoFit) params.fit = demoFit;
    const path = getStorageCropUrl(objectId, params);
    return demoObjectId.trim() ? resolveApiUrl(path) : path;
  }, [demoObjectId, demoW, demoH, demoFit]);

  const closePreview = () => {
    setPreviewOpen(false);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(undefined);
    setPreviewName(undefined);
  };

  const handlePreview = async (record: ObjectRecord) => {
    if (!record.objectId) return;
    try {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(undefined);
      }
      const blob = await fetchStorageBlob(record.objectId, true);
      const url = URL.createObjectURL(blob);
      setPreviewName(record.name || '图片预览');
      setPreviewUrl(url);
      setPreviewOpen(true);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '预览失败');
    }
  };

  const handleDownload = async (record: ObjectRecord) => {
    if (!record.objectId) return;
    try {
      const blob = await fetchStorageBlob(record.objectId, false);
      triggerBlobDownload(blob, record.name || 'download');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '下载失败');
    }
  };

  const handleDelete = (record: ObjectRecord) => {
    if (!record.objectId) return;
    modal.confirm({
      title: '确认删除该文件？',
      content: record.name
        ? `将永久删除「${record.name}」及其存储对象，此操作不可恢复。`
        : '将永久删除该记录及其存储对象，此操作不可恢复。',
      okText: '删除',
      okType: 'danger',
      onOk: async () => {
        const res = await deleteStorageObject(record.objectId!);
        if (!isApiSuccess(res)) {
          message.error('删除失败');
          return;
        }
        message.success('已删除');
        actionRef.current?.reload();
      },
    });
  };

  return (
    <PageContainer pageHeaderRender={() => <></>}>
      <UrlSyncedProTable<ObjectRecord>
        headerTitle="文件浏览器"
        actionRef={actionRef}
        rowKey="objectId"
        scroll={{ x: 1280 }}
        search={search}
        options={DEFAULT_PRO_TABLE_OPTIONS}
        urlFilterKeys={[...BROWSER_FILTER_KEYS]}
        toolBarRender={() => [
          <Button key="upload" type="primary" className="btn-gradient-primary" icon={<UploadOutlined />} onClick={() => setUploadOpen(true)}>
            上传文件
          </Button>,
          <Button key="crop-guide" icon={<ScissorOutlined />} onClick={() => setCropGuideOpen(true)}>
            自动裁剪
          </Button>,
        ]}
        request={async (params) => {
          const res = await getStorageObjects({
            page: params.current,
            size: params.pageSize,
            keyword: (params.name as string) || (params.keyword as string) || undefined,
            bucketId: (params.bucketId as string) || undefined,
            mimeType: (params.mimeType as string) || undefined,
            applicationId: (params.applicationId as string) || undefined,
          });
          const { items, total, success } = parseApiListResponse<ObjectRecord>(res);
          return { data: items, total, success };
        }}
        columns={[
          { title: '资源 ID', dataIndex: 'objectId', copyable: true, ellipsis: true, width: 120, hideInSearch: true },
          ...augmentColumnsWithChatReference<ObjectRecord>(
            [{
              title: '资源名称',
              dataIndex: 'name',
              ellipsis: true,
              width: 200,
              fieldProps: { placeholder: '按文件名搜索' },
            } as ProColumns<ObjectRecord>],
            'name',
            buildStorageObjectReference,
          ),
          {
            title: '类型',
            dataIndex: 'mimeType',
            width: 140,
            fieldProps: { placeholder: '如 image/png' },
          },
          {
            title: 'Bucket',
            dataIndex: 'bucketId',
            width: 140,
            valueType: 'select',
            fieldProps: { showSearch: true, optionFilterProp: 'label', allowClear: true, placeholder: '选择 Bucket' },
            request: loadBucketSelectOptions,
            render: (_, r) => r.bucket?.name || r.bucket?.code || '-',
          },
          {
            title: '来源应用',
            dataIndex: 'applicationId',
            width: 160,
            valueType: 'select',
            fieldProps: { showSearch: true, optionFilterProp: 'label', allowClear: true, placeholder: '选择应用' },
            request: loadApplicationSelectOptions,
            render: (_, r) => r.application?.name || '-',
          },
          {
            title: '来源用户',
            dataIndex: 'createdBy',
            width: 100,
            hideInSearch: true,
            render: (_, r) => r.creator?.username || r.creator?.name || '-',
          },
          {
            title: '大小',
            dataIndex: 'size',
            width: 90,
            hideInSearch: true,
            render: (_, r) => formatSize(r.size),
          },
          { title: '相对路径', dataIndex: 'relativePath', copyable: true, ellipsis: true, width: 220, hideInSearch: true },
          { title: '创建时间', dataIndex: 'createdAt', valueType: 'dateTime', width: 170, hideInSearch: true },
          {
            ...TABLE_ACTION_COLUMN_BASE,
            dataIndex: 'option',
            width: 96,
            render: (_, record) => (
              <TableActions>
                {record.mimeType?.startsWith('image/') ? (
                  <TableActionButton
                    title="预览"
                    icon={<EyeOutlined />}
                    onClick={() => void handlePreview(record)}
                  />
                ) : null}
                <TableActionButton
                  title="下载"
                  icon={<DownloadOutlined />}
                  onClick={() => void handleDownload(record)}
                />
                <TableActionButton
                  title="删除"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleDelete(record)}
                />
              </TableActions>
            ),
          },
        ]}
      />

      {previewUrl && (
        <Image
          wrapperStyle={{ display: 'none' }}
          src={previewUrl}
          preview={{
            visible: previewOpen,
            src: previewUrl,
            toolbarRender: () => previewName ? <span style={{ padding: '0 8px' }}>{previewName}</span> : null,
            onVisibleChange: (visible) => {
              if (!visible) closePreview();
              else setPreviewOpen(true);
            },
          }}
        />
      )}

      <Modal
        title="上传文件"
        open={uploadOpen}
        footer={null}
        onCancel={() => {
          if (uploadingBucketCode) {
            message.warning('正在上传，请等待完成或暂停后再关闭');
            return;
          }
          setUploadOpen(false);
        }}
        destroyOnHidden
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Typography.Text type="secondary">
            支持断点续传；超过 100MB 必须走此通道。刷新页面后可继续未完成的同一文件。
          </Typography.Text>
          {uploadingBucketCode ? (
            <div>
              <Typography.Text ellipsis>{uploadFilename} 上传中</Typography.Text>
              <Progress percent={uploadPercent} status={uploadPaused ? 'exception' : 'active'} />
              <Space>
                {uploadPaused ? (
                  <Button
                    size="small"
                    icon={<PlayCircleOutlined />}
                    onClick={() => {
                      uploadHandleRef.current?.start();
                      setUploadPaused(false);
                    }}
                  >
                    继续
                  </Button>
                ) : (
                  <Button
                    size="small"
                    icon={<PauseCircleOutlined />}
                    onClick={() => {
                      uploadHandleRef.current?.pause();
                      setUploadPaused(true);
                    }}
                  >
                    暂停
                  </Button>
                )}
              </Space>
            </div>
          ) : null}
          <UnifiedProTable
            search={false}
            options={false}
            pagination={false}
            rowKey="bucketId"
            scroll={{ x: 'max-content' }}
            request={async () => {
              const res = await getStorageBuckets({ size: 200 });
              const { items } = parseApiListResponse<API.StorageBucket>(res);
              return { data: items, success: true };
            }}
            columns={[
              { title: '编码', dataIndex: 'code' },
              { title: '名称', dataIndex: 'name' },
              {
                ...TABLE_ACTION_COLUMN_BASE,
                width: 80,
                render: (_, row) => (
                  <TableActions>
                    <Tooltip title="选择文件">
                      <Upload
                        showUploadList={false}
                        disabled={!row.code || Boolean(uploadingBucketCode)}
                        customRequest={async ({ file, onSuccess, onError }) => {
                          if (!row.code) {
                            message.error('该 Bucket 缺少编码，无法上传');
                            onError?.(new Error('missing bucketCode'));
                            return;
                          }
                          const raw = file as File;
                          setUploadingBucketCode(row.code);
                          setUploadFilename(raw.name);
                          setUploadPercent(0);
                          setUploadPaused(false);
                          try {
                            const { handle, done } = startStorageTusUpload({
                              file: raw,
                              bucketCode: row.code,
                              onProgress: (progress) => setUploadPercent(progress.percent),
                            });
                            uploadHandleRef.current = handle;
                            handle.start();
                            const object = await done;
                            message.success(object.name ? `上传成功：${object.name}` : '上传成功');
                            setUploadOpen(false);
                            actionRef.current?.reload();
                            onSuccess?.(object);
                          } catch (e) {
                            message.error(e instanceof Error ? e.message : '上传失败');
                            onError?.(e as Error);
                          } finally {
                            uploadHandleRef.current = null;
                            setUploadingBucketCode(undefined);
                            setUploadPercent(0);
                            setUploadFilename(undefined);
                            setUploadPaused(false);
                          }
                        }}
                      >
                        <Button
                          type="link"
                          size="small"
                          icon={<UploadOutlined />}
                          loading={uploadingBucketCode === row.code}
                          disabled={!row.code || Boolean(uploadingBucketCode)}
                        />
                      </Upload>
                    </Tooltip>
                  </TableActions>
                ),
              },
            ]}
          />
        </Space>
      </Modal>

      <Modal
        title="图片自动裁剪与缓存 API"
        open={cropGuideOpen}
        onCancel={() => setCropGuideOpen(false)}
        footer={[
          <Button key="close" type="primary" onClick={() => setCropGuideOpen(false)}>
            知道了
          </Button>,
        ]}
        width={720}
        destroyOnHidden
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Typography.Paragraph style={{ marginBottom: 0 }}>
            在 URL 中传入<strong>资源 ID</strong>（本页列表「资源 ID」列）与裁剪参数，即可获取指定尺寸的 webp 图片。
            服务端首次生成后会写入 MinIO 缓存，相同参数再次请求直接返回缓存文件。
          </Typography.Paragraph>

          <Typography.Title level={5} style={{ margin: 0 }}>
            URL 模板
          </Typography.Title>
          <Typography.Paragraph copyable code style={{ marginBottom: 0 }}>
            /api/v1/storage/objects/&#123;objectId&#125;/crop?w=200&amp;h=200&amp;fit=contain
          </Typography.Paragraph>

          <Typography.Title level={5} style={{ margin: 0 }}>
            两种用法
          </Typography.Title>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li>
              <strong>同时指定 w、h</strong>：用 <Typography.Text code>fit</Typography.Text> 选择模式。
              <Typography.Text code>cover</Typography.Text> = 覆盖裁剪到精确宽高；
              <Typography.Text code>contain</Typography.Text> = 按原图比例缩放以适配框内（取 w 或 h 中更紧的一边，另一边按比例算出，不留白边，输出未必等于 w×h）。
            </li>
            <li>
              <strong>只指定 w 或 h</strong>：按原图宽高比自动计算另一边，忽略 <Typography.Text code>fit</Typography.Text>。
            </li>
          </ol>

          <Typography.Title level={5} style={{ margin: 0 }}>
            查询参数
          </Typography.Title>
          <Table
            size="small"
            pagination={false}
            rowKey="name"
            dataSource={[
              { name: 'w', desc: '目标宽度（像素），1–4096；与 h 均未传时默认 480' },
              { name: 'h', desc: '目标高度（像素），1–4096' },
              {
                name: 'fit',
                desc: '仅同时指定 w、h 时生效：cover（覆盖裁剪）| contain（按比例适配，默认；不留白）',
              },
            ]}
            columns={[
              { title: '参数', dataIndex: 'name', width: 72 },
              { title: '说明', dataIndex: 'desc' },
            ]}
          />

          <Typography.Title level={5} style={{ margin: 0 }}>
            URL 拼装
          </Typography.Title>
          <Space wrap style={{ width: '100%' }}>
            <Input
              placeholder="资源 ID（UUID）"
              value={demoObjectId}
              onChange={(e) => setDemoObjectId(e.target.value)}
              style={{ width: 280 }}
              allowClear
            />
            <Input
              placeholder="w"
              value={demoW}
              onChange={(e) => setDemoW(e.target.value)}
              style={{ width: 72 }}
            />
            <Input
              placeholder="h"
              value={demoH}
              onChange={(e) => setDemoH(e.target.value)}
              style={{ width: 72 }}
            />
            <Select
              value={demoFit}
              onChange={setDemoFit}
              style={{ width: 120 }}
              options={[
                { value: 'contain', label: 'contain' },
                { value: 'cover', label: 'cover' },
              ]}
            />
          </Space>
          <Typography.Paragraph copyable code style={{ marginBottom: 0, wordBreak: 'break-all' }}>
            {demoCropUrl}
          </Typography.Paragraph>

          <Typography.Title level={5} style={{ margin: 0 }}>
            使用注意
          </Typography.Title>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>仅支持 <Typography.Text code>image/*</Typography.Text> 类型；响应固定为 <Typography.Text code>image/webp</Typography.Text>。</li>
            <li>鉴权与预览相同：公开 Bucket 可匿名；私有 Bucket 需携带 JWT（用户或应用 Token）。</li>
            <li>可直接用于 <Typography.Text code>&lt;img src=&quot;...&quot; /&gt;</Typography.Text>；内置 API 编码为 <Typography.Text code>storage:object:crop</Typography.Text>。</li>
            <li>裁剪结果缓存在 MinIO，对象键前缀为 <Typography.Text code>img-crop-cache/</Typography.Text>。</li>
          </ul>
        </Space>
      </Modal>
    </PageContainer>
  );
};

export default BrowserPage;
