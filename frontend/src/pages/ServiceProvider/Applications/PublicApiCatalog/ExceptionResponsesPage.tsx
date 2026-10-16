import { ArrowLeftOutlined } from '@ant-design/icons';
import { Alert, Button, Spin, Tag, Typography } from 'antd';
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getApplicationsPublicApiCatalog } from '@/services/EADAF/api/applicationsPublic';
import { getApiData, getApiErrorMessage, isApiSuccess } from '@/utils/apiResponse';
import { buildApplicationApiDocsPath } from '@/utils/applicationApiDocsUrl';
import './index.css';

const { Text, Paragraph } = Typography;

function codeColor(code: number): string {
  if (code >= 500) return '#f93e3e';
  if (code >= 400) return '#fca130';
  return '#61affe';
}

const ExceptionResponsesPublicPage: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exceptionResponses, setExceptionResponses] = useState<API.ExceptionResponseDocItem[]>([]);
  const [appName, setAppName] = useState<string>('');

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
          setError(getApiErrorMessage(res, '加载异常响应失败'));
          return;
        }
        const data = getApiData(res);
        setAppName(data?.application?.name || code);
        setExceptionResponses(data?.exceptionResponses || []);
      } catch (err) {
        if (!cancelled) setError(getApiErrorMessage(err, '加载异常响应失败'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (loading) {
    return (
      <div className="application-api-catalog" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" description="加载异常响应..." />
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
            {appName} · 异常响应
          </h1>
          <p className="application-api-catalog__header-sub">
            所有 API 共享的异常响应契约（全局通用）
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
        <main className="application-api-catalog__content">
          {exceptionResponses.length === 0 ? (
            <Alert type="info" showIcon message="暂无已配置的异常响应" />
          ) : (
            exceptionResponses.map((er) => (
              <div key={er.code} className="application-api-catalog__operation" style={{ marginBottom: 16 }}>
                <div className="application-api-catalog__operation-head" style={{ cursor: 'default' }}>
                  <span
                    className="application-api-catalog__method"
                    style={{ background: codeColor(er.code), minWidth: 48 }}
                  >
                    {er.code}
                  </span>
                  <Text strong style={{ fontSize: 16 }}>{er.title}</Text>
                </div>
                <div className="application-api-catalog__operation-body">
                  {er.description ? (
                    <Paragraph type="secondary" style={{ marginBottom: 12 }}>{er.description}</Paragraph>
                  ) : null}
                  <Text strong style={{ display: 'block', marginBottom: 4 }}>
                    Schema
                    <Tag style={{ marginLeft: 8 }}>application/json</Tag>
                  </Text>
                  <pre className="application-api-catalog__schema">
                    {JSON.stringify(er.schema || {}, null, 2)}
                  </pre>
                  {er.example != null ? (
                    <>
                      <Text strong style={{ display: 'block', marginTop: 16, marginBottom: 4 }}>
                        Example
                      </Text>
                      <pre className="application-api-catalog__schema">
                        {JSON.stringify(er.example, null, 2)}
                      </pre>
                    </>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </main>
      </div>
    </div>
  );
};

export default ExceptionResponsesPublicPage;
