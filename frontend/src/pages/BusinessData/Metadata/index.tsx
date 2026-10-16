import { DatabaseOutlined } from '@ant-design/icons';
import { Button, Card, Col, Form, Input, Row, Select, Space, Splitter, Table } from 'antd';
import { message } from '@/utils/antdAppApis';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAISurface, useAIChatPrompts, useChatReference } from '@eadaf/ai-base';
import { buildMetadataPrompts } from '@/ai/pageChatPrompts';
import {
  getBizdataMetadataTable,
  getBizdataMetadataTables,
  postBizdataMetadataSyncFromSchema,
  putBizdataMetadataTable,
  putBizdataMetadataTableFields,
} from '@/services/EADAF/api/businessData';
import { getApiData, isApiSuccess, parseApiListResponse } from '@/utils/apiResponse';
import CodePathTreeTable from '../components/CodePathTreeTable';
import {
  buildCodeScopeReference,
  buildMetadataTableReference,
} from '@/ai/chatReferenceBuilders';
import { useDataStandardOptions } from '../components/useDataStandardOptions';

const MetadataCatalogPage: React.FC = () => {
  const [allTables, setAllTables] = useState<API.BizdataMetadataTable[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [targetType, setTargetType] = useState<string | undefined>();
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [detail, setDetail] = useState<API.BizdataMetadataTable | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [tableForm] = Form.useForm();
  const { options: standardOptions } = useDataStandardOptions();
  const { references } = useChatReference();
  const chatPrompts = useMemo(
    () => buildMetadataPrompts(references, detail?.code),
    [references, detail?.code],
  );
  useAIChatPrompts(chatPrompts);

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const response = await getBizdataMetadataTables({ page: 1, size: 500 });
      const { items } = parseApiListResponse<API.BizdataMetadataTable>(response);
      setAllTables(items);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const filteredTables = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    return allTables.filter((item) => {
      if (targetType && item.targetType !== targetType) return false;
      if (!k) return true;
      return (
        item.code?.toLowerCase().includes(k) ||
        item.metadataCode?.toLowerCase().includes(k) ||
        item.businessMeaning?.toLowerCase().includes(k)
      );
    });
  }, [allTables, keyword, targetType]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await getBizdataMetadataTable(id);
      if (isApiSuccess(res)) {
        const data = getApiData<API.BizdataMetadataTable>(res);
        setDetail(data || null);
        tableForm.setFieldsValue({
          metadataCode: data?.metadataCode,
          standardId: data?.standardId,
          businessMeaning: data?.businessMeaning,
          status: data?.status,
        });
      }
    } finally {
      setDetailLoading(false);
    }
  }, [tableForm]);

  useEffect(() => {
    if (selectedId) {
      void loadDetail(selectedId);
    } else {
      setDetail(null);
      tableForm.resetFields();
    }
  }, [loadDetail, selectedId, tableForm]);

  useAISurface({
    id: 'bizdata.metadata-catalog',
    domain: 'bizdata',
    label: '元数据目录',
    read: () => ({
      selectedTableId: selectedId,
      selectedCode: detail?.code,
      fieldCount: detail?.fields?.length ?? 0,
    }),
    refresh: () => {
      void loadList();
      if (selectedId) void loadDetail(selectedId);
    },
    applyMutation: (mutation) => {
      if (mutation.domain === 'bizdata' && mutation.type.startsWith('metadata.')) {
        void loadList();
        if (selectedId) void loadDetail(selectedId);
      }
    },
  });

  const handleSaveTable = async () => {
    if (!selectedId) return;
    const values = await tableForm.validateFields();
    setSaving(true);
    try {
      const res = await putBizdataMetadataTable(selectedId, values);
      if (isApiSuccess(res)) {
        message.success('表级元数据已保存');
        await loadDetail(selectedId);
        await loadList();
      } else {
        message.error(res.message || '保存失败');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSaveFields = async () => {
    if (!selectedId || !detail?.fields) return;
    setSaving(true);
    try {
      const res = await putBizdataMetadataTableFields(selectedId, detail.fields);
      if (isApiSuccess(res)) {
        message.success('字段元数据已保存');
        await loadDetail(selectedId);
      } else {
        message.error(res.message || '保存失败');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await postBizdataMetadataSyncFromSchema();
      if (isApiSuccess(res)) {
        message.success('已从数据模型同步元数据骨架');
        await loadList();
        if (selectedId) await loadDetail(selectedId);
      } else {
        message.error(res.message || '同步失败');
      }
    } finally {
      setSyncing(false);
    }
  };

  const updateField = (index: number, patch: Partial<API.BizdataMetadataField>) => {
    if (!detail?.fields) return;
    const next = detail.fields.map((f, i) => (i === index ? { ...f, ...patch } : f));
    setDetail({ ...detail, fields: next });
  };

  return (
    <div style={{ height: 'calc(100vh - 56px)' }}>
      <Splitter style={{ height: '100%' }}>
        <Splitter.Panel defaultSize="40%" min={300} max="50%">
          <div style={{ height: '100%', overflow: 'auto', paddingRight: 8 }}>
            <CodePathTreeTable<API.BizdataMetadataTable>
              items={filteredTables}
              loading={listLoading}
              selectedId={selectedId}
              onSelect={(item) => item.id && setSelectedId(item.id)}
              nameColumnTitle="Scope / 逻辑元数据"
              getLeafLabel={(item, segment) => {
                const leafSegment = (item.code || '').split(':').slice(-1)[0] || segment;
                return leafSegment;
              }}
              leafIcon={<DatabaseOutlined />}
              emptyText="暂无元数据，可点击「从模型同步」"
              getLeafReference={buildMetadataTableReference}
              getScopeReference={buildCodeScopeReference}
              toolbar={
                <Space wrap style={{ padding: '8px' }}>
                  <Input
                    allowClear
                    placeholder="搜索编码/元数据编码"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    style={{ width: 120 }}
                  />
                  <Select
                    allowClear
                    placeholder="类型"
                    value={targetType}
                    onChange={setTargetType}
                    style={{ width: 120 }}
                    options={[
                      { label: '数据实体', value: 'entity' },
                      { label: '指标', value: 'metric' },
                      { label: '枚举', value: 'enum' },
                    ]}
                  />
                  <Button className="btn-function" loading={syncing} onClick={() => void handleSync()}>
                    从模型同步
                  </Button>
                </Space>
              }
            />
          </div>
        </Splitter.Panel>
        <Splitter.Panel>
          <div style={{ height: '100%', overflow: 'auto', paddingLeft: 4 }}>
            <Card
              title={detail ? `元数据：${detail.code}` : '元数据详情'}
              loading={detailLoading}
              extra={
                detail && (
                  <Space>
                    <Button onClick={() => void handleSaveTable()} loading={saving}>
                      保存表级
                    </Button>
                    <Button type="primary" onClick={() => void handleSaveFields()} loading={saving}>
                      保存字段
                    </Button>
                  </Space>
                )
              }
            >
              {!detail ? (
                <div style={{ color: '#888' }}>请从左侧选择一条逻辑元数据记录</div>
              ) : (
                <>
                  <Form form={tableForm} layout="vertical">
                    <Row gutter={16}>
                      <Col span={12}>
                        <Form.Item name="metadataCode" label="表级元数据编码">
                          <Input />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name="standardId" label="数据标准">
                          <Select allowClear options={standardOptions} />
                        </Form.Item>
                      </Col>
                      <Col span={24}>
                        <Form.Item name="businessMeaning" label="业务释义">
                          <Input.TextArea rows={2} />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name="status" label="状态">
                          <Select
                            options={[
                              { label: '启用', value: 'enabled' },
                              { label: '停用', value: 'disabled' },
                            ]}
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                  </Form>

                  <Table
                    size="small"
                    rowKey="id"
                    style={{ marginTop: 16 }}
                    dataSource={detail.fields || []}
                    pagination={false}
                    columns={[
                      { title: '字段', dataIndex: 'fieldKey', width: 120 },
                      {
                        title: '元数据编码',
                        dataIndex: 'metadataCode',
                        render: (v, _, index) => (
                          <Input
                            size="small"
                            value={v}
                            onChange={(e) => updateField(index, { metadataCode: e.target.value })}
                          />
                        ),
                      },
                      {
                        title: '数据标准',
                        dataIndex: 'standardId',
                        width: 200,
                        render: (v, _, index) => (
                          <Select
                            size="small"
                            allowClear
                            style={{ width: '100%' }}
                            value={v}
                            options={standardOptions}
                            onChange={(val) => updateField(index, { standardId: val })}
                          />
                        ),
                      },
                      {
                        title: '业务释义',
                        dataIndex: 'businessMeaning',
                        render: (v, _, index) => (
                          <Input
                            size="small"
                            value={v}
                            onChange={(e) => updateField(index, { businessMeaning: e.target.value })}
                          />
                        ),
                      },
                      {
                        title: '敏感等级',
                        dataIndex: 'sensitivityLevel',
                        width: 100,
                        render: (v, _, index) => (
                          <Input
                            size="small"
                            value={v}
                            onChange={(e) => updateField(index, { sensitivityLevel: e.target.value })}
                          />
                        ),
                      },
                    ]}
                  />
                </>
              )}
            </Card>
          </div>
        </Splitter.Panel>
      </Splitter>
    </div>
  );
};

export default MetadataCatalogPage;
