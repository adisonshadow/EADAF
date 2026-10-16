import { ApiOutlined, ArrowLeftOutlined, PartitionOutlined } from '@ant-design/icons';
import { Alert, Button, Collapse, Spin, Tag, Tree, Typography } from 'antd';
import type { DataNode } from 'antd/es/tree';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getApplicationsPublicApiCatalog,
  type ApplicationApiCatalogTreeNode,
  type OutboundWebhookCatalogItem,
} from '@/services/EADAF/api/applicationsPublic';
import { getApiData, getApiErrorMessage, isApiSuccess } from '@/utils/apiResponse';
import { buildApplicationApiDocsPath } from '@/utils/applicationApiDocsUrl';
import './index.css';

const { Text, Paragraph } = Typography;

function methodClass(method?: string) {
  return `application-api-catalog__method application-api-catalog__method--${(method || 'post').toLowerCase()}`;
}

function collectApiCodes(nodes: ApplicationApiCatalogTreeNode[]): string[] {
  const codes: string[] = [];
  const walk = (items: ApplicationApiCatalogTreeNode[]) => {
    items.forEach((node) => {
      if (node.isApiNode) codes.push(node.code);
      if (node.children?.length) walk(node.children);
    });
  };
  walk(nodes);
  return codes;
}

function toTreeNodes(items: ApplicationApiCatalogTreeNode[]): DataNode[] {
  return items.map((item) => ({
    key: item.code,
    title: item.isApiNode ? (
      <span>
        <ApiOutlined style={{ marginRight: 6, color: '#1677ff' }} />
        {item.name}
      </span>
    ) : (
      <span>
        <PartitionOutlined style={{ marginRight: 6 }} />
        <Text strong>{item.name}</Text>
        {item.serviceCount != null ? (
          <Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
            ({item.serviceCount})
          </Text>
        ) : null}
      </span>
    ),
    selectable: !!item.isApiNode,
    isLeaf: !!item.isApiNode,
    children: item.children?.length ? toTreeNodes(item.children) : undefined,
  }));
}

function OutboundWebhookDetail({ item }: { item: OutboundWebhookCatalogItem }) {
  const responseConfig = item.responseConfig;
  const exceptionRules = responseConfig?.exception?.rules || [];

  return (
    <div className="application-api-catalog__detail">
      <h1 className="application-api-catalog__service-title">{item.name || item.code}</h1>
      <div className="application-api-catalog__service-meta">
        <div>
          <Text code>{item.code}</Text>
          {item.status ? <Tag style={{ marginLeft: 8 }}>{item.status}</Tag> : null}
        </div>
        {item.description ? <Paragraph style={{ marginTop: 8 }}>{item.description}</Paragraph> : null}
        <div style={{ marginTop: 12 }}>
          <div className="application-api-catalog__operation-head" style={{ cursor: 'default' }}>
            <span className={methodClass(item.httpMethod)}>{item.httpMethod || 'POST'}</span>
            <span className="application-api-catalog__path">{item.targetUrl}</span>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <Text type="secondary">触发方式：</Text>
          <Text>{item.triggerType || 'api_hook'}</Text>
          {item.triggerApiServiceCode ? (
            <>
              <Text type="secondary" style={{ margin: '0 8px' }}>·</Text>
              <Text type="secondary">绑定业务 API：</Text>
              <Text code>{item.triggerApiServiceCode}</Text>
            </>
          ) : null}
        </div>
        <div style={{ marginTop: 8 }}>
          <Text type="secondary">鉴权：</Text>
          <Text>
            {!item.authType || item.authType === 'none'
              ? '无'
              : `${item.authType}${item.authSecretSet ? '（已配置密钥）' : ''}${
                item.authKeyName ? ` · ${item.authKeyName}` : ''
              }${item.authSendMode ? ` · ${item.authSendMode}` : ''}`}
          </Text>
        </div>
      </div>

      <Collapse
        style={{ marginTop: 16 }}
        defaultActiveKey={['request', 'response']}
        items={[
          {
            key: 'request',
            label: '请求契约',
            children: (
              <>
                {item.requestStructure ? (
                  <>
                    <Text strong style={{ display: 'block', marginBottom: 8 }}>请求结构（TypeScript）</Text>
                    <pre className="application-api-catalog__code-block">{item.requestStructure}</pre>
                  </>
                ) : (
                  <Text type="secondary">未配置请求结构</Text>
                )}
                {item.requestExample ? (
                  <>
                    <Text strong style={{ display: 'block', margin: '16px 0 8px' }}>请求 Demo（JSON）</Text>
                    <pre className="application-api-catalog__code-block">{item.requestExample}</pre>
                  </>
                ) : null}
              </>
            ),
          },
          {
            key: 'response',
            label: '响应契约与异常规则',
            children: (
              <>
                {responseConfig?.success?.example != null ? (
                  <>
                    <Text strong style={{ display: 'block', marginBottom: 8 }}>成功 Example</Text>
                    <pre className="application-api-catalog__code-block">
                      {JSON.stringify(responseConfig.success.example, null, 2)}
                    </pre>
                  </>
                ) : null}
                {responseConfig?.exception?.example != null ? (
                  <>
                    <Text strong style={{ display: 'block', margin: '16px 0 8px' }}>异常 Example</Text>
                    <pre className="application-api-catalog__code-block">
                      {JSON.stringify(responseConfig.exception.example, null, 2)}
                    </pre>
                  </>
                ) : null}
                <div style={{ marginTop: 12 }}>
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>异常判定规则</Text>
                  {exceptionRules.length ? (
                    exceptionRules.map((rule) => <Tag key={rule}>{rule}</Tag>)
                  ) : (
                    <Text type="secondary">未配置字段规则</Text>
                  )}
                  {responseConfig?.httpStatusAsException !== false ? (
                    <Tag color="orange" style={{ marginLeft: 4 }}>HTTP 非 2xx</Tag>
                  ) : null}
                </div>
              </>
            ),
          },
        ]}
      />
    </div>
  );
}

const OutboundWebhooksDocsPage: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appName, setAppName] = useState('');
  const [webhooks, setWebhooks] = useState<OutboundWebhookCatalogItem[]>([]);
  const [tree, setTree] = useState<ApplicationApiCatalogTreeNode[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | undefined>();

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getApplicationsPublicApiCatalog(code, { skipErrorHandler: true });
        if (cancelled) return;
        if (!isApiSuccess(res)) {
          setError(getApiErrorMessage(res, '加载提交外部 API 失败'));
          return;
        }
        const data = getApiData(res);
        setAppName(data?.application?.name || code);
        const list = data?.outboundWebhooks || [];
        const treeData = data?.outboundWebhookTree || [];
        setWebhooks(list);
        setTree(treeData);
        const leafCodes = collectApiCodes(treeData);
        const first = leafCodes[0] || list[0]?.code;
        setSelectedCode(first);
      } catch (err) {
        if (!cancelled) setError(getApiErrorMessage(err, '加载提交外部 API 失败'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const treeNodes = useMemo(() => toTreeNodes(tree), [tree]);
  const selected = useMemo(
    () => webhooks.find((w) => w.code === selectedCode),
    [webhooks, selectedCode],
  );

  if (loading) {
    return (
      <div className="application-api-catalog" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" description="加载关联提交外部 API..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="application-api-catalog" style={{ padding: 24 }}>
        <Alert type="error" showIcon message={error} />
      </div>
    );
  }

  return (
    <div className="application-api-catalog">
      <header className="application-api-catalog__header">
        <div className="application-api-catalog__header-main">
          <h1 className="application-api-catalog__header-title">
            {appName} · 关联提交外部 API
          </h1>
          <p className="application-api-catalog__header-sub">
            EADAF 在业务 API 成功后主动调用的外部接口契约（出站；不进入 apis.json）
          </p>
        </div>
        <div className="application-api-catalog__header-actions">
          <Button
            type="primary"
            ghost
            size="small"
            icon={<ArrowLeftOutlined />}
            onClick={() => code && navigate(buildApplicationApiDocsPath(code))}
          >
            返回 API 文档
          </Button>
        </div>
      </header>

      <div className="application-api-catalog__body">
        <aside className="application-api-catalog__sidebar application-api-catalog__tree">
          {treeNodes.length ? (
            <Tree
              showLine
              defaultExpandAll
              motion={false}
              selectedKeys={selectedCode ? [selectedCode] : []}
              treeData={treeNodes}
              onSelect={(keys) => {
                const key = keys[0] as string | undefined;
                if (key) setSelectedCode(key);
              }}
            />
          ) : (
            <Text type="secondary">
              暂无关联的提交外部 API，请在应用「API 配置 → 提交外部API配置」中勾选
            </Text>
          )}
        </aside>
        <main className="application-api-catalog__content">
          {selected ? (
            <OutboundWebhookDetail item={selected} />
          ) : (
            <Text type="secondary">请从左侧选择一项提交外部 API</Text>
          )}
        </main>
      </div>
    </div>
  );
};

export default OutboundWebhooksDocsPage;
