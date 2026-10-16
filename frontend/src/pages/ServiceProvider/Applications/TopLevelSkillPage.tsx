import { BulbOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { Alert, Button, Collapse, Form, Space, Spin, Tag, Typography } from 'antd';
import { message } from '@/utils/antdAppApis';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import MilkdownCrepeEditor from '@/components/MilkdownCrepeEditor';
import PageContainerTitleWithBack from '@/components/PageContainerTitleWithBack';
import {
  getApplicationsIdTopLevelSkill,
  putApplicationsIdTopLevelSkill,
} from '@/services/EADAF/api/applications';
import { request } from '@/utils/request';
import { getApiData, isApiSuccess } from '@/utils/apiResponse';

const { Text, Paragraph } = Typography;

interface CapabilitySkill {
  name: string;
  slug: string;
  description?: string;
  isGlobal?: boolean;
  isDedicated?: boolean;
}

interface CapabilityTool {
  name: string;
  slug: string;
  functionName: string;
  executionType?: string;
}

const ApplicationTopLevelSkillPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applicationName, setApplicationName] = useState('');
  const [editorKey, setEditorKey] = useState(0);
  const [capabilitySkills, setCapabilitySkills] = useState<CapabilitySkill[]>([]);
  const [capabilityTools, setCapabilityTools] = useState<CapabilityTool[]>([]);

  const listPath = '/service_provider';

  const loadCapabilities = useCallback(async (applicationId: string) => {
    try {
      const res = await request<{ data?: { skills?: CapabilitySkill[]; tools?: CapabilityTool[] } }>(
        '/api/v1/ai/capabilities',
        {
          method: 'GET',
          params: { applicationId },
        },
      );
      const data = res?.data;
      setCapabilitySkills(data?.skills || []);
      setCapabilityTools(data?.tools || []);
    } catch {
      setCapabilitySkills([]);
      setCapabilityTools([]);
    }
  }, []);

  const loadDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [skillRes] = await Promise.all([
        getApplicationsIdTopLevelSkill({ id }),
        loadCapabilities(id),
      ]);
      if (!isApiSuccess(skillRes)) {
        message.error('加载失败');
        return;
      }
      const data = getApiData<{
        applicationName?: string;
        contentMarkdown?: string;
      }>(skillRes);
      setApplicationName(data?.applicationName || '');
      form.setFieldsValue({ contentMarkdown: data?.contentMarkdown || '' });
      setEditorKey((k) => k + 1);
    } finally {
      setLoading(false);
    }
  }, [form, id, loadCapabilities]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const handleSubmit = async () => {
    if (!id) return;
    const values = await form.validateFields();
    setSaving(true);
    try {
      const res = await putApplicationsIdTopLevelSkill(
        { id },
        { contentMarkdown: values.contentMarkdown || '' },
      );
      if (!isApiSuccess(res)) {
        message.error('保存失败');
        return;
      }
      message.success('保存成功');
      const data = getApiData<{ applicationName?: string }>(res);
      if (data?.applicationName) {
        setApplicationName(data.applicationName);
      }
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer
      title={
        <PageContainerTitleWithBack
          title={`${applicationName || '应用'} — 应用顶层SKILL编辑`}
          backTo={listPath}
        />
      }
      extra={
        <Space>
          <Button type="primary" loading={saving} onClick={handleSubmit}>
            保存
          </Button>
        </Space>
      }
    >
      <Spin spinning={loading}>
        <Alert
          type="info"
          showIcon
          icon={<BulbOutlined />}
          message="应用顶层 SKILL"
          description="用于描述本应用 Skill / Tool 的使用方法与编排说明。每个应用最多一份，可不配置；未配置时 AI Chat 将跳过此段说明。"
          style={{ marginBottom: 16 }}
        />
        <Form form={form} layout="vertical">
          <Form.Item name="contentMarkdown" label="顶层 Skill 内容">
            <MilkdownCrepeEditor
              editorKey={editorKey}
              placeholder="在此编写本应用的 Skill / Tool 使用说明…"
              minHeight={360}
            />
          </Form.Item>
        </Form>

        <Collapse
          style={{ marginTop: 24 }}
          items={[
            {
              key: 'capabilities',
              label: '本应用可用 Skill / Tool（参考）',
              children: (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <div>
                    <Text strong>Skill（{capabilitySkills.length}）</Text>
                    {capabilitySkills.length ? (
                      <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                        {capabilitySkills.map((skill) => (
                          <li key={skill.slug}>
                            <Text>{skill.name}</Text>{' '}
                            <Text type="secondary">({skill.slug})</Text>
                            {skill.isGlobal ? <Tag style={{ marginLeft: 8 }}>全局</Tag> : null}
                            {skill.isDedicated ? (
                              <Tag color="blue" style={{ marginLeft: 8 }}>
                                专用
                              </Tag>
                            ) : null}
                            {skill.description ? (
                              <Paragraph type="secondary" style={{ marginBottom: 4 }}>
                                {skill.description}
                              </Paragraph>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <Paragraph type="secondary">暂无可用 Skill</Paragraph>
                    )}
                  </div>
                  <div>
                    <Text strong>Tool（{capabilityTools.length}）</Text>
                    {capabilityTools.length ? (
                      <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                        {capabilityTools.map((tool) => (
                          <li key={tool.slug}>
                            <Text>{tool.name}</Text>{' '}
                            <Text type="secondary">
                              ({tool.functionName || tool.slug})
                            </Text>
                            {tool.executionType ? (
                              <Tag style={{ marginLeft: 8 }}>{tool.executionType}</Tag>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <Paragraph type="secondary">暂无 Tool 列表</Paragraph>
                    )}
                  </div>
                </Space>
              ),
            },
          ]}
        />
      </Spin>
    </PageContainer>
  );
};

export default ApplicationTopLevelSkillPage;
