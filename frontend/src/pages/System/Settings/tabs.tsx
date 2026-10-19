import { Alert, Button, Card, Input, Modal, Segmented, Space, Switch, Table, Typography, Upload } from 'antd';
import type { UploadFile } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { message, modal } from '@/utils/antdAppApis';
import React, { useCallback, useEffect, useState } from 'react';
import { Cron } from 'react-js-cron';
import 'react-js-cron/dist/styles.css';
import {
  getSystemBackups,
  getSystemFeatures,
  postSystemBackupRestore,
  postSystemBackupRun,
  putSystemFeatures,
} from '@/services/EADAF/api/system';
import { useInitialState } from '@/providers/InitialStateProvider';
import { getApiData, isApiSuccess } from '@/utils/apiResponse';
import { formatCronSummary } from '@/utils/cron';
import { useUiTheme, type UiThemePreference } from '@/theme/uiTheme';
import {
  PRO_TABLE_DENSITY_OPTIONS,
  useProTableDensity,
  type ProTableDensity,
} from '@/theme/proTableDensity';

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const DEFAULT_AUTO_BACKUP_CRON = '0 3 * * *';

const UI_THEME_OPTIONS: { label: string; value: UiThemePreference }[] = [
  { label: '跟随系统', value: 'system' },
  { label: '浅色', value: 'light' },
  { label: '深色', value: 'dark' },
];

export const GeneralSettingsTab: React.FC = () => {
  const { preference, setPreference } = useUiTheme();
  const { density, setDensity } = useProTableDensity();

  return (
    <Card>
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <Typography.Text strong>界面主题</Typography.Text>
            <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
              仅保存在本浏览器；跟随系统时会随操作系统浅色/深色自动切换
            </div>
          </div>
          <Segmented
            options={UI_THEME_OPTIONS}
            value={preference}
            onChange={(value) => setPreference(value as UiThemePreference)}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <Typography.Text strong>表格密度</Typography.Text>
            <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
              统一应用到站内所有数据表格（工具栏已不再提供密度按钮）；仅保存在本浏览器
            </div>
          </div>
          <Segmented
            options={PRO_TABLE_DENSITY_OPTIONS}
            value={density}
            onChange={(value) => setDensity(value as ProTableDensity)}
          />
        </div>
      </Space>
    </Card>
  );
};

/** react-js-cron 中文本地化文案 */
const AUTO_BACKUP_CRON_LOCALE = {
  everyText: '每',
  emptyMonths: '每月',
  emptyMonthDays: '每天',
  emptyMonthDaysShort: '每天',
  emptyWeekDays: '每周',
  emptyWeekDaysShort: '每周',
  emptyHours: '每小时',
  emptyMinutes: '每分钟',
  emptyMinutesForHourPeriod: '每分钟',
  yearOption: '年',
  monthOption: '月',
  weekOption: '周',
  dayOption: '天',
  hourOption: '小时',
  minuteOption: '分钟',
  rebootOption: '重启',
  prefixPeriod: '每',
  prefixMonths: '',
  prefixMonthDays: '',
  prefixWeekDays: '',
  prefixWeekDaysForMonthAndYearPeriod: '',
  prefixHours: '',
  prefixMinutes: '',
  prefixMinutesForHourPeriod: '在',
  suffixMinutesForHourPeriod: '分钟',
  errorInvalidCron: '无效的 cron 表达式',
  clearButtonText: '清除',
};

export const BackupSettingsTab: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [backupDir, setBackupDir] = useState('');
  const [backupDirIsCustom, setBackupDirIsCustom] = useState(false);
  const [defaultBackupDir, setDefaultBackupDir] = useState('');
  const [backupDirModalOpen, setBackupDirModalOpen] = useState(false);
  const [draftBackupDir, setDraftBackupDir] = useState('');
  const [savingBackupDir, setSavingBackupDir] = useState(false);
  const [items, setItems] = useState<API.SystemBackupItem[]>([]);
  const [autoBackupModalOpen, setAutoBackupModalOpen] = useState(false);
  const [autoBackupSaving, setAutoBackupSaving] = useState(false);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
  const [autoBackupCron, setAutoBackupCron] = useState(DEFAULT_AUTO_BACKUP_CRON);
  const [draftEnabled, setDraftEnabled] = useState(false);
  const [draftCron, setDraftCron] = useState(DEFAULT_AUTO_BACKUP_CRON);
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [restoreFileList, setRestoreFileList] = useState<UploadFile[]>([]);
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getSystemBackups();
      if (isApiSuccess(res)) {
        const data = getApiData<API.SystemBackupList>(res);
        setBackupDir(data?.backupDir || '');
        setItems(data?.items || []);
      }
      const featRes = await getSystemFeatures();
      if (isApiSuccess(featRes)) {
        const data = getApiData<API.SystemFeatures>(featRes);
        setAutoBackupEnabled(Boolean(data?.autoBackupEnabled));
        setAutoBackupCron(data?.autoBackupCron || DEFAULT_AUTO_BACKUP_CRON);
        setBackupDirIsCustom(Boolean(data?.backupDirIsCustom));
        setDefaultBackupDir(data?.defaultBackupDir || '');
        if (data?.backupDir) setBackupDir(data.backupDir);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRun = async () => {
    setRunning(true);
    try {
      const res = await postSystemBackupRun();
      if (isApiSuccess(res)) {
        message.success('备份已完成');
        await load();
      } else {
        message.error(res.message || '备份失败');
      }
    } finally {
      setRunning(false);
    }
  };

  const openAutoBackupModal = () => {
    setDraftEnabled(autoBackupEnabled);
    setDraftCron(autoBackupCron || DEFAULT_AUTO_BACKUP_CRON);
    setAutoBackupModalOpen(true);
  };

  const handleSaveAutoBackup = async () => {
    setAutoBackupSaving(true);
    try {
      const res = await putSystemFeatures({
        autoBackupEnabled: draftEnabled,
        autoBackupCron: draftCron,
      });
      if (isApiSuccess(res)) {
        const data = getApiData<API.SystemFeatures>(res);
        setAutoBackupEnabled(Boolean(data?.autoBackupEnabled));
        setAutoBackupCron(data?.autoBackupCron || DEFAULT_AUTO_BACKUP_CRON);
        setAutoBackupModalOpen(false);
        message.success('已保存');
      } else {
        message.error(res.message || '保存失败');
      }
    } finally {
      setAutoBackupSaving(false);
    }
  };

  const openBackupDirModal = () => {
    // 自定义过就回填当前目录，否则留空（占位符提示默认目录）
    setDraftBackupDir(backupDirIsCustom ? backupDir : '');
    setBackupDirModalOpen(true);
  };

  const handleSaveBackupDir = async () => {
    setSavingBackupDir(true);
    try {
      const res = await putSystemFeatures({ backupDir: draftBackupDir.trim() });
      if (isApiSuccess(res)) {
        const data = getApiData<API.SystemFeatures>(res);
        setBackupDirIsCustom(Boolean(data?.backupDirIsCustom));
        if (data?.backupDir) setBackupDir(data.backupDir);
        setBackupDirModalOpen(false);
        message.success(draftBackupDir.trim() ? '备份目录已切换' : '已恢复默认备份目录');
        await load();
      } else {
        message.error(res.message || '保存失败');
      }
    } catch {
      // 目录校验失败（如不可写）已由请求拦截器弹出后端返回的提示，这里保持弹窗打开即可
    } finally {
      setSavingBackupDir(false);
    }
  };

  const handleRestore = () => {
    const file = restoreFileList[0]?.originFileObj as File | undefined;
    if (!file) {
      message.warning('请先选择 .dump 备份文件');
      return;
    }
    modal.confirm({
      title: '确认恢复数据？',
      content: `将用「${file.name}」覆盖当前数据库数据，此操作不可撤销，请确认已提前备份。`,
      okText: '确认恢复',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        setRestoring(true);
        try {
          const res = await postSystemBackupRestore(file);
          if (isApiSuccess(res)) {
            message.success('数据恢复完成');
            setRestoreModalOpen(false);
            setRestoreFileList([]);
          } else {
            message.error(res.message || '恢复失败');
          }
        } finally {
          setRestoring(false);
        }
      },
    });
  };

  return (
    <Card
      loading={loading}
      extra={
        <Space>
          <Button type="primary" loading={running} onClick={() => void handleRun()}>
            立即备份
          </Button>
          <Button onClick={openAutoBackupModal}>自动备份</Button>
          <Button danger onClick={() => setRestoreModalOpen(true)}>
            恢复数据
          </Button>
        </Space>
      }
    >
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        备份目录：{backupDir || '-'}
        {backupDirIsCustom ? '（自定义）' : ''}
        <Button type="link" size="small" style={{ paddingInline: 4 }} onClick={openBackupDirModal}>
          修改
        </Button>
        {autoBackupEnabled && (
          <>
            <br />
            自动备份已开启，周期：
            {formatCronSummary(autoBackupCron)}
          </>
        )}
      </Typography.Paragraph>
      <Table
        rowKey="name"
        size="small"
        pagination={false}
        dataSource={items}
        columns={[
          { title: '文件名', dataIndex: 'name' },
          {
            title: '大小',
            dataIndex: 'size',
            width: 100,
            render: (v: number) => formatSize(v),
          },
          {
            title: '时间',
            dataIndex: 'createdAt',
            width: 180,
            render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
          },
        ]}
      />

      <Modal
        title="自动备份设置"
        open={autoBackupModalOpen}
        onCancel={() => setAutoBackupModalOpen(false)}
        onOk={() => void handleSaveAutoBackup()}
        confirmLoading={autoBackupSaving}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Typography.Text strong>自动备份</Typography.Text>
              <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
                开启后，服务端将按下方周期自动执行数据库备份
              </div>
            </div>
            <Switch checked={draftEnabled} onChange={setDraftEnabled} />
          </div>
          <div>
            <Typography.Text strong>备份周期</Typography.Text>
            <div style={{ color: '#888', fontSize: 12, margin: '4px 0 8px' }}>
              支持可视化点选或直接输入标准 cron 表达式（分 时 日 月 周）
            </div>
            <Cron
              value={draftCron}
              setValue={setDraftCron}
              disabled={!draftEnabled}
              defaultPeriod="day"
              allowEmpty="never"
              locale={AUTO_BACKUP_CRON_LOCALE}
            />
          </div>
        </Space>
      </Modal>

      <Modal
        title="修改备份目录"
        open={backupDirModalOpen}
        onCancel={() => setBackupDirModalOpen(false)}
        onOk={() => void handleSaveBackupDir()}
        confirmLoading={savingBackupDir}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <div style={{ color: '#888', fontSize: 12 }}>
            「立即备份」与自动备份都会写入该目录。目录不存在会自动创建，保存时会先写探针文件验证权限。
            留空表示使用后端默认目录
            {defaultBackupDir ? `（${defaultBackupDir}）` : ''}。
          </div>
          <Input
            value={draftBackupDir}
            onChange={(e) => setDraftBackupDir(e.target.value)}
            placeholder={defaultBackupDir || '如 D:\\EADAF_backups 或 /data/backups'}
            allowClear
          />
          <div style={{ color: '#888', fontSize: 12, lineHeight: 1.8 }}>
            <div>
              Linux 部署提示：该目录必须对服务运行用户可写，否则自动备份会在凌晨静默失败。
              建议先用 root 建好目录并授权：
            </div>
            <Typography.Text code style={{ fontSize: 12 }}>
              {'mkdir -p /data/eadaf-backups && chown <运行用户>:<运行组> /data/eadaf-backups'}
            </Typography.Text>
            <div>
              容器部署时还需把该目录挂载进容器（如 <Typography.Text code style={{ fontSize: 12 }}>-v /data/eadaf-backups:/data/db-backup</Typography.Text>），
              并在容器 env 里把 DB_BACKUP_DIR 指向挂载路径。
            </div>
          </div>
          <div style={{ color: '#888', fontSize: 12, lineHeight: 1.8 }}>
            <div>
              双机备份（可选）：这里只保证备份落在本机目录。若要在另一台机器/异地再留一份，
              可用 rsync 定时把整个目录同步过去（先配好 SSH 免密，再用 cron 或 systemd timer 触发）：
            </div>
            <Typography.Text code style={{ fontSize: 12 }}>
              {'rsync -avz --delete /data/eadaf-backups/ backup@10.0.0.2:/data/eadaf-backups/'}
            </Typography.Text>
            <div>
              注意 <Typography.Text code style={{ fontSize: 12 }}>--delete</Typography.Text> 会删除对端多余文件，
              请确认目标目录专用于本系统备份；不想删可去掉该参数（对端会累积旧文件）。
            </div>
          </div>
          <div style={{ color: '#888', fontSize: 12 }}>
            切换目录后，原目录里的历史备份不再列出（文件仍在，可手工拷回）。
          </div>
        </Space>
      </Modal>

      <Modal
        title="恢复数据"
        open={restoreModalOpen}
        onCancel={() => setRestoreModalOpen(false)}
        onOk={handleRestore}
        confirmLoading={restoring}
        okText="确认恢复"
        okButtonProps={{ danger: true }}
        cancelText="取消"
        destroyOnHidden
      >
        <Alert
          type="warning"
          showIcon
          message="恢复操作将覆盖当前数据库中的现有数据"
          description="请确认已提前备份。恢复期间请勿操作系统，执行完成后数据将回退到备份文件的状态。"
          style={{ marginBottom: 12 }}
        />
        <Upload.Dragger
          accept=".dump"
          maxCount={1}
          fileList={restoreFileList}
          beforeUpload={() => false}
          onChange={({ fileList }) => setRestoreFileList(fileList)}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽 .dump 备份文件到此处</p>
          <p className="ant-upload-hint">仅支持本系统备份产生的 .dump 格式文件</p>
        </Upload.Dragger>
      </Modal>
    </Card>
  );
};

export const MetadataSettingsTab: React.FC = () => {
  const { initialState, setInitialState } = useInitialState();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [metadataEnabled, setMetadataEnabled] = useState(
    initialState?.systemFeatures?.metadataEnabled ?? false,
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getSystemFeatures();
      if (isApiSuccess(res)) {
        const data = getApiData<API.SystemFeatures>(res);
        setMetadataEnabled(Boolean(data?.metadataEnabled));
        setInitialState((prev) =>
          prev
            ? {
                ...prev,
                systemFeatures: { ...prev.systemFeatures, ...data },
              }
            : prev,
        );
      }
    } finally {
      setLoading(false);
    }
  }, [setInitialState]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (checked: boolean) => {
    setSaving(true);
    try {
      const res = await putSystemFeatures({ metadataEnabled: checked });
      if (isApiSuccess(res)) {
        const data = getApiData<API.SystemFeatures>(res);
        setMetadataEnabled(Boolean(data?.metadataEnabled));
        setInitialState((prev) =>
          prev
            ? {
                ...prev,
                systemFeatures: { ...prev.systemFeatures, metadataEnabled: Boolean(data?.metadataEnabled) },
              }
            : prev,
        );
        message.success('已保存');
      } else {
        message.error(res.message || '保存失败');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card loading={loading}>
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <Typography.Text strong>应用元数据</Typography.Text>
            <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
              开启后，业务数据菜单将显示「数据标准」与「元数据」，并可在模型/指标/枚举中编辑元数据
            </div>
          </div>
          <Switch
            checked={metadataEnabled}
            loading={saving}
            onChange={(checked) => void handleSave(checked)}
          />
        </div>
      </Space>
    </Card>
  );
};

export const ApiServiceSettingsTab: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [allowWriteOperations, setAllowWriteOperations] = useState(false);
  const [testAutoRollback, setTestAutoRollback] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getSystemFeatures();
      if (isApiSuccess(res)) {
        const data = getApiData<API.SystemFeatures>(res);
        setAllowWriteOperations(Boolean(data?.apiServiceAllowWriteOperations));
        setTestAutoRollback(data?.apiServiceTestAutoRollback !== false);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (
    key: 'apiServiceAllowWriteOperations' | 'apiServiceTestAutoRollback',
    checked: boolean,
  ) => {
    setSavingKey(key);
    try {
      const res = await putSystemFeatures({ [key]: checked });
      if (isApiSuccess(res)) {
        const data = getApiData<API.SystemFeatures>(res);
        setAllowWriteOperations(Boolean(data?.apiServiceAllowWriteOperations));
        setTestAutoRollback(data?.apiServiceTestAutoRollback !== false);
        message.success('已保存');
      } else {
        message.error(res.message || '保存失败');
      }
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <Card loading={loading}>
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <Typography.Text strong>API 测试中允许写操作</Typography.Text>
            <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
              仅作用于 API 服务测试页的「执行测试」，不影响已发布 API 的线上调用。
              <br />
              开启：测试页可对 create / update / delete 等写操作真实执行 SQL（含未绑定实体表的自定义 SQL 服务）。
              <br />
              关闭：上述写操作在测试页仅校验参数结构，不执行 SQL。
            </div>
          </div>
          <Switch
            checked={allowWriteOperations}
            loading={savingKey === 'apiServiceAllowWriteOperations'}
            onChange={(checked) => void handleSave('apiServiceAllowWriteOperations', checked)}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <Typography.Text strong>API 测试中写操作自动回滚</Typography.Text>
            <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
              仅当「API 测试中允许写操作」已开启时生效；同样只影响测试页，不影响已发布 API。
              <br />
              开启（默认）：测试页写操作在事务内执行，结束后自动回滚，测试数据不落库。
              <br />
              关闭：测试页写操作执行后会提交事务，测试数据会写入数据库，请谨慎使用。
            </div>
          </div>
          <Switch
            checked={testAutoRollback}
            disabled={!allowWriteOperations}
            loading={savingKey === 'apiServiceTestAutoRollback'}
            onChange={(checked) => void handleSave('apiServiceTestAutoRollback', checked)}
          />
        </div>
      </Space>
    </Card>
  );
};
