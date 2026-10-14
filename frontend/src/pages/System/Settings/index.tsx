import { PageContainer } from '@ant-design/pro-components';
import { Tabs } from 'antd';
import React from 'react';
import {
  ApiServiceSettingsTab,
  BackupSettingsTab,
  GeneralSettingsTab,
  MetadataSettingsTab,
} from './tabs';

/**
 * 系统设置。
 * 注意：「应用数据导出/导入」「EADAF数据导出/导入」已迁到导航「应用部署」下，
 * 不再作为系统设置 Tab；设置里只保留通用 / 元数据 / API 服务 / 备份。
 */
const SystemSettingsPage: React.FC = () => {
  return (
    <PageContainer title={<></>}>
      <Tabs
        items={[
          {
            key: 'general',
            label: '通用',
            children: <GeneralSettingsTab />,
          },
          {
            key: 'metadata',
            label: '元数据',
            children: <MetadataSettingsTab />,
          },
          {
            key: 'api-service',
            label: 'API 服务',
            children: <ApiServiceSettingsTab />,
          },
          { key: 'backup', label: '备份', children: <BackupSettingsTab /> },
        ]}
      />
    </PageContainer>
  );
};

export default SystemSettingsPage;
