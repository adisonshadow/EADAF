import { ConfigProvider, theme } from 'antd';
import React, { useEffect, useState } from 'react';
import Lottie from 'react-lottie-player';
import { Helmet } from '@/components/Helmet';
import { Footer } from '@/components';
import bigdataLottie from '@/assets/lotties/bigdata-2.json';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import {
  resolveLoginTheme,
  type SsoLoginPageStyle,
} from '@/utils/ssoLoginPage';
import { useUiTheme } from '@/theme/uiTheme';

interface AuthPageFrameProps {
  shortName: string;
  loginPage?: SsoLoginPageStyle | null;
  /** SSO 应用配置尚未返回时为 true，此时不渲染默认侧栏动画，避免先闪默认再换成配置素材 */
  asidePending?: boolean;
  helmetTitle?: string;
  children: React.ReactNode;
}

function useCustomLottieData(url?: string, pending?: boolean) {
  const [data, setData] = useState<object | null>(null);
  const [ready, setReady] = useState(!url);

  useEffect(() => {
    if (pending) {
      setData(null);
      setReady(false);
      return;
    }
    if (!url) {
      setData(null);
      setReady(true);
      return;
    }

    let cancelled = false;
    setData(null);
    setReady(false);

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error('lottie fetch failed');
        return res.json();
      })
      .then((json) => {
        if (!cancelled && json && typeof json === 'object') {
          setData(json);
        }
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [url, pending]);

  return { data, ready };
}

const AuthPageFrame: React.FC<AuthPageFrameProps> = ({
  shortName,
  loginPage,
  asidePending = false,
  helmetTitle,
  children,
}) => {
  const { resolved: uiResolved } = useUiTheme();
  const [, setSchemeTick] = useState(0);
  /** SSO 登录页可单独指定主题；未指定时跟随系统设置「界面主题」 */
  const ssoTheme = loginPage?.theme;

  useEffect(() => {
    // 仅 SSO 显式选「跟随系统」时在此监听；否则用 UiTheme 已解析结果
    if (ssoTheme !== 'system' || typeof window === 'undefined' || !window.matchMedia) {
      return;
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSchemeTick((n) => n + 1);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [ssoTheme]);

  const resolvedTheme = ssoTheme ? resolveLoginTheme(ssoTheme) : uiResolved;
  const largeText = Boolean(loginPage?.large_text);
  const asideKind = loginPage?.aside_kind || 'lottie';
  const customLottieUrl =
    !asidePending && asideKind === 'lottie' ? resolveMediaUrl(loginPage?.aside_lottie) : undefined;
  const customImageUrl =
    !asidePending && asideKind === 'image' ? resolveMediaUrl(loginPage?.aside_image) : undefined;
  const { data: customLottieData, ready: customLottieReady } = useCustomLottieData(
    customLottieUrl,
    asidePending,
  );

  const useCustomImage = Boolean(customImageUrl);
  const useCustomLottie = Boolean(customLottieData);
  /** 配置未回或自定义 Lottie 未就绪前，不渲染默认侧栏，避免先闪原始图再换成配置素材 */
  const asideReady = !asidePending && (useCustomImage || customLottieReady);
  const showDefaultAside = asideReady && !useCustomImage && !useCustomLottie;

  const pageClass = [
    'auth-page',
    largeText ? 'auth-page--large-text' : '',
    useCustomImage ? 'auth-page--custom-image' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <ConfigProvider
      theme={{
        algorithm: resolvedTheme === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1890ff',
          fontSize: largeText ? 16 : 14,
        },
      }}
    >
      <div className={pageClass} data-theme={resolvedTheme}>
        {helmetTitle ? (
          <Helmet>
            <title>{helmetTitle}</title>
          </Helmet>
        ) : null}
        <div className="auth-bg">
          {showDefaultAside ? (
            <img src="/images/bg.svg" alt="" className="bg-image" />
          ) : null}
          {useCustomImage ? (
            <img src={customImageUrl} alt="" className="aside-media" />
          ) : null}
          {showDefaultAside ? (
            <div className="bg-text">
              <div className="title">{shortName}</div>
            </div>
          ) : null}
          {useCustomLottie ? (
            <Lottie
              key="custom-lottie"
              className="lottie-bg"
              animationData={customLottieData ?? undefined}
              loop
              play
            />
          ) : null}
          {showDefaultAside ? (
            <Lottie
              key="default-lottie"
              className="lottie-bg"
              animationData={bigdataLottie}
              loop
              play
            />
          ) : null}
        </div>
        <div className="auth-content">
          {children}
          <Footer />
        </div>
      </div>
    </ConfigProvider>
  );
};

export default AuthPageFrame;
