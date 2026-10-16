import { ArrowLeftOutlined, CopyOutlined } from '@ant-design/icons';
import { XMarkdown } from '@ant-design/x-markdown';
import '@ant-design/x-markdown/themes/light.css';
import { Alert, Button, Spin, Tag, Typography } from 'antd';
import { message } from '@/utils/antdAppApis';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getApplicationsPublicApiCatalog } from '@/services/EADAF/api/applicationsPublic';
import {
  buildApiSkillMarkdownUrl,
  buildApplicationApiDocsPath,
} from '@/utils/applicationApiDocsUrl';
import { getApiData, getApiErrorMessage, isApiSuccess } from '@/utils/apiResponse';
import './index.css';

const { Text } = Typography;

function parseSkillVersion(markdown: string): string | null {
  const match = markdown.match(/^---[\s\S]*?\nversion:\s*['"]?([^'"\n]+)['"]?/m);
  return match ? match[1].trim() : null;
}

const ApiSkillPublicPage: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState('');
  const [appName, setAppName] = useState('');

  const skillMarkdownUrl = useMemo(
    () => (code ? buildApiSkillMarkdownUrl(code) : ''),
    [code],
  );

  const skillVersion = useMemo(() => parseSkillVersion(markdown), [markdown]);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [catalogRes, skillRes] = await Promise.all([
          getApplicationsPublicApiCatalog(code, { skipErrorHandler: true }),
          fetch(buildApiSkillMarkdownUrl(code)),
        ]);
        if (cancelled) return;
        if (!isApiSuccess(catalogRes)) {
          setError(getApiErrorMessage(catalogRes, '加载 API Skill 失败'));
          return;
        }
        if (!skillRes.ok) {
          const errText = await skillRes.text().catch(() => '');
          setError(errText || `加载 API Skill 失败（${skillRes.status}）`);
          return;
        }
        const catalog = getApiData(catalogRes);
        setAppName(catalog?.application?.name || code);
        setMarkdown(await skillRes.text());
      } catch (err) {
        if (!cancelled) setError(getApiErrorMessage(err, '加载 API Skill 失败'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const handleCopyUrl = useCallback(() => {
    if (!skillMarkdownUrl) return;
    navigator.clipboard
      ?.writeText(skillMarkdownUrl)
      .then(() => message.success('已复制 API Skill URL'))
      .catch(() => message.error('复制失败，请手动复制'));
  }, [skillMarkdownUrl]);

  const handleCopyMarkdown = useCallback(() => {
    if (!markdown) return;
    navigator.clipboard
      ?.writeText(markdown)
      .then(() => message.success('已复制 SKILL.md 全文'))
      .catch(() => message.error('复制失败，请手动复制'));
  }, [markdown]);

  if (loading) {
    return (
      <div className="application-api-catalog" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" description="加载 API Skill..." />
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
            {appName} · API SKILL
          </h1>
          <p className="application-api-catalog__header-sub">
            供 AI / 集成方读取的 EADAF API 调用约定（SKILL.md）
            {skillVersion ? (
              <>
                {' · '}
                <Tag color="blue" style={{ verticalAlign: 'middle' }}>v{skillVersion}</Tag>
              </>
            ) : null}
          </p>
        </div>
        <div className="application-api-catalog__header-actions">
          <Button
            type="primary"
            ghost
            size="small"
            icon={<CopyOutlined />}
            onClick={handleCopyUrl}
            disabled={!skillMarkdownUrl}
          >
            复制 Skill URL
          </Button>
          <Button
            type="primary"
            ghost
            size="small"
            icon={<CopyOutlined />}
            onClick={handleCopyMarkdown}
            disabled={!markdown}
          >
            复制全文
          </Button>
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
        <main className="application-api-catalog__content application-api-catalog__skill">
          {skillMarkdownUrl ? (
            <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
              机器可读地址：<Text code copyable>{skillMarkdownUrl}</Text>
            </Text>
          ) : null}
          <div className="application-api-catalog__skill-body x-markdown-light">
            <XMarkdown content={markdown} openLinksInNewTab escapeRawHtml />
          </div>
        </main>
      </div>
    </div>
  );
};

export default ApiSkillPublicPage;
