import { PageContainer } from '@ant-design/pro-components';
import { Tabs } from 'antd';
import React from 'react';
import {
  ApiServiceSettingsTab,
  BackupSettingsTab,
  GeneralSettingsTab,
} from './tabs';

/**
 * 系统设置。
 * 注意：「应用数据导出/导入」「EADAF数据导出/导入」已迁到导航「应用部署」下，
 * 不再作为系统设置 Tab；设置里只保留通用 / API 服务 / 备份。
 * 「是否启用元数据」在通用设置的「系统」分组里，跟在三员管理后面。
 * 「登录有效期」是系统分组下面的独立卡片。
 * 通用设置分五项：系统（当前版本、三员、元数据、浏览器 API Key）、
 * 登录有效期、样式（界面主题、表格密度）、
 * 文件存储（图片/文档/视频上限、图片格式与 WebP 压缩）、日志（大小与保留时间）。
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
