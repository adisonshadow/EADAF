import { getHealth } from '@/services/EADAF/api/health';
import { getAuthCheck, postAuthLogin } from '@/services/EADAF/api/auth';
import { getApplicationsSsoId } from '@/services/EADAF/api/applicationsSso';
import { getCaptcha } from '@/services/EADAF/api/captcha';
import { history } from '@/utils/navigation';
import { useInitialState } from '@/providers/InitialStateProvider';
import { Modal, Form, Input, Button, Card, Space, Spin, Result, Alert } from 'antd';
import { message, modal } from '@/utils/antdAppApis';
import Lottie from 'react-lottie-player';
import React, { useState, useRef, useEffect } from 'react';
import SliderCaptchaComponent, { SliderCaptchaRef } from '@/components/SliderCaptcha';
import loadingLottie from '@/assets/lotties/loading.json';
import './index.scss';
import { saveAuth, saveSsoAuth, getSsoAuth, clearSsoAuth, clearAuth, checkTokenValid, parseAuthUser, getSsoSid, saveSsoSid } from '@/utils/auth';
import { getApiErrorMessage } from '@/utils/apiResponse';
import { normalizeUploadFileId } from '@/utils/image';
import {
  resolveBrandingDisplay,
  resolveLoginPageDescription,
  resolveSsoBrandingDisplay,
} from '@/utils/appBranding';
import AuthPageFrame from '@/components/AuthPageFrame';

interface LoginParams {
  username: string;
  password: string;
  type?: string;
  captcha_data?: {
    captcha_id: string;
  };
}

interface UserInfo {
  user_id: string;
  username: string;
  name: string;
  avatar: string | null;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
  email: string;
  phone: string | null;
  status: 'ACTIVE' | 'DISABLED' | 'LOCKED' | 'ARCHIVED';
  department_id: string | null;
  must_change_password?: boolean;
}

interface ApplicationInfo {
  application_id?: string;
  name?: string;
  code?: string;
  logo_url?: string | null;
  description?: string | null;
  sso_enabled?: boolean;
  sso_config?: {
    redirect_uri?: string;
    protocol?: string;
    currentTimestamp?: string;
    secret?: string;
    redirect_mode?: 'POST_REDIRECT' | 'HEADER_REDIRECT';
    salt?: string;
    base_url?: string;
    client_id?: string;
    client_secret?: string;
    issuer?: string;
    frontend_url?: string;
    login_page?: API.SsoLoginPageStyle;
    /** 该应用登录页是否要求人类验证（滑块）；false 时登录直接进行 */
    login_verify_enabled?: boolean;
  };
}

interface SsoErrorInfo {
  message: string;
}

interface LoginResponse {
  code?: number;
  message?: string;
  data?: {
    token?: string;
    refresh_token?: string;
    expires_in?: string;
    user_id?: string;
    need_captcha?: boolean;
    must_change_password?: boolean;
    sso?: {
      application_id?: string;
      application_name?: string;
      application_code?: string;
      sso_config?: API.SSOConfig;
    };
  };
}

/** 从 `/oauth/authorize?client_id=...` 这类地址里取 client_id（原始 / 再解码一次都试）。 */
function extractOauthClientId(raw: string | null): string | null {
  if (!raw) return null;
  const candidates = [raw];
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded !== raw) candidates.push(decoded);
  } catch {
    // 已经是解码过的字符串，跳过
  }
  for (const candidate of candidates) {
    try {
      const clientId = new URL(candidate, window.location.origin).searchParams.get('client_id');
      if (clientId) return clientId;
    } catch {
      // 不是合法 URL，继续试下一个
    }
  }
  return null;
}

/**
 * 登录页该按哪个应用换肤。
 *
 * - 旧式 SSO：URL 直接带 `app=<application_id>`；
 * - 授权码流程（BFF / PKCE）：`/oauth/authorize` 未登录时只把本页地址塞进 `redirect`，
 *   登录页自身没有 `app`。此时从 `redirect` 的 `client_id`（= application_id）反推，
 *   否则登录页永远渲染平台默认皮肤（标题、副标题、Logo、侧栏、主题全丢）。
 *
 * 注意只用于皮肤：是否走「应用密钥签发 + 旧式 SSO 跳转」仍只看 URL 上的 `app`。
 */
function resolveLoginSkinAppId(urlParams: URLSearchParams): string | null {
  return urlParams.get('app') || extractOauthClientId(urlParams.get('redirect'));
}

const LoginPage: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [loginParams, setLoginParams] = useState<LoginParams | null>(null);
  const [captchaId, setCaptchaId] = useState<string>('');
  const [applicationInfo, setApplicationInfo] = useState<ApplicationInfo | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [redirectMessage, setRedirectMessage] = useState('');
  const [ssoError, setSsoError] = useState<SsoErrorInfo | null>(null);
  const [isApplicationInfoLoaded, setIsApplicationInfoLoaded] = useState(false);
  const captchaRef = useRef<SliderCaptchaRef>(null);
  const ssoRedirectStartedRef = useRef(false);
  const { refresh, initialState } = useInitialState();

  /** 刚从登出中转页过来：显示"已退出"，且不自动 SSO（见 SSO 方案计划 现象 1） */
  const loggedOut = new URLSearchParams(window.location.search).get('logged_out') === '1';

  // 独立的SSO回调方法（显式传入 SSO 应用信息，避免闭包读取到过期的 applicationInfo）
  const submitSsoCallback = (
    ssoAppInfo: ApplicationInfo,
    userInfo: UserInfo,
    token: string,
    refreshToken?: string,
  ) => {
    console.log('submitSsoCallback', ssoAppInfo, userInfo, token, refreshToken);
    if (!ssoAppInfo?.sso_enabled || !ssoAppInfo?.sso_config?.redirect_uri) {
      console.warn('SSO 配置不完整，跳过跳转');
      return;
    }

    const { redirect_uri, protocol, currentTimestamp, secret, redirect_mode } = ssoAppInfo.sso_config;
    
    if (protocol === 'OIDC') {
      // 检查跳转模式
      if (redirect_mode === 'HEADER_REDIRECT') {
        // 302重定向模式：通过URL参数传递JWT信息
        console.log('使用302重定向模式跳转到:', redirect_uri);
        
        // 构建包含JWT信息的URL
        const url = new URL(redirect_uri);
        url.searchParams.set('access_token', token);
        if (refreshToken) {
          url.searchParams.set('refresh_token', refreshToken);
        }
        url.searchParams.set('token_type', 'Bearer');
        url.searchParams.set('expires_in', '3600');
        
        // 添加state参数
        const stateParam = new URLSearchParams(window.location.search).get('state');
        if (stateParam) {
          url.searchParams.set('state', stateParam);
        }
        
        // 添加验证信息
        url.searchParams.set('verify', JSON.stringify({
          timestamp: currentTimestamp || "null",
          public_secret: secret,
          expires_in: 600,
        }));
        
        // 添加用户信息
        url.searchParams.set('user_info', JSON.stringify({
          user_id: userInfo.user_id,
          username: userInfo.username,
          name: userInfo.name,
          email: userInfo.email,
          phone: userInfo.phone,
          gender: userInfo.gender,
          status: userInfo.status,
          avatar: normalizeUploadFileId(userInfo.avatar),
          department_id: userInfo.department_id
        }));
        
        console.log('302重定向URL:', url.toString());
        window.location.href = url.toString();
        return;
      }
      
      // POST跳转模式（默认）：使用表单提交
      // 创建一个隐藏的表单来提交 POST 请求
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = redirect_uri;
      form.enctype = 'application/x-www-form-urlencoded';
      form.style.display = 'none';

      // 添加 IdP 信息
      const idpInput = document.createElement('input');
      idpInput.type = 'hidden';
      idpInput.name = 'idp';
      idpInput.value = 'EADAF';
      form.appendChild(idpInput);

      // 添加 Access Token
      const accessTokenInput = document.createElement('input');
      accessTokenInput.type = 'hidden';
      accessTokenInput.name = 'access_token';
      accessTokenInput.value = token;
      form.appendChild(accessTokenInput);

      // 添加 Refresh Token
      const refreshTokenInput = document.createElement('input');
      refreshTokenInput.type = 'hidden';
      refreshTokenInput.name = 'refresh_token';
      refreshTokenInput.value = refreshToken || '';
      form.appendChild(refreshTokenInput);

      // 添加 Token Type
      const tokenTypeInput = document.createElement('input');
      tokenTypeInput.type = 'hidden';
      tokenTypeInput.name = 'token_type';
      tokenTypeInput.value = 'Bearer';
      form.appendChild(tokenTypeInput);

      // 添加过期时间
      const expiresInInput = document.createElement('input');
      expiresInInput.type = 'hidden';
      expiresInInput.name = 'expires_in';
      expiresInInput.value = '3600'; // 默认1小时，可以根据实际情况调整
      form.appendChild(expiresInInput);

      // 添加 state 参数
      const stateInput = document.createElement('input');
      stateInput.type = 'hidden';
      stateInput.name = 'state';
      stateInput.value = new URLSearchParams(window.location.search).get('state') || '';
      form.appendChild(stateInput);

      // 添加合法性验证信息
      const verifyInput = document.createElement('input');
      verifyInput.type = 'hidden';
      verifyInput.name = 'verify';
      verifyInput.value = JSON.stringify({
        timestamp: currentTimestamp || "null",
        public_secret: secret,
        expires_in: 600,
      });
      form.appendChild(verifyInput);

      // 添加用户信息
      const userInfoInput = document.createElement('input');
      userInfoInput.type = 'hidden';
      userInfoInput.name = 'user_info';
      userInfoInput.value = JSON.stringify({
        user_id: userInfo.user_id,
        username: userInfo.username,
        name: userInfo.name,
        email: userInfo.email,
        phone: userInfo.phone,
        gender: userInfo.gender,
        status: userInfo.status,
        avatar: normalizeUploadFileId(userInfo.avatar),
        department_id: userInfo.department_id
      });
      form.appendChild(userInfoInput);

      // 将表单添加到文档并提交
      document.body.appendChild(form);
      // 打印表单中的所有值
      const formData = new FormData(form);
      console.log('Form data:');
      for (const [key, value] of formData.entries()) {
        console.log(`${key}: ${value}`);
      }
      form.submit();
    }
  };

  const resolveSsoError = (error: unknown): SsoErrorInfo => ({
    message: getApiErrorMessage(error, 'SSO 登录失败'),
  });

  const performSsoRedirect = async (
    appId: string,
    userInfo: UserInfo,
    token: string,
    refreshToken?: string,
  ) => {
    try {
      const response = await getApplicationsSsoId({ id: appId }, { skipErrorHandler: true });
      if (response.code === 200 && response.data?.sso_enabled && response.data?.sso_config?.redirect_uri) {
        setSsoError(null);
        submitSsoCallback(response.data, userInfo, token, refreshToken);
        return;
      }
      setSsoError({
        message: getApiErrorMessage(response, 'SSO 登录失败'),
      });
      ssoRedirectStartedRef.current = false;
    } catch (error) {
      console.error('SSO 跳转失败:', error);
      setSsoError(resolveSsoError(error));
      ssoRedirectStartedRef.current = false;
    }
  };

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await getHealth();
        if (response.code !== 200) {
          modal.error({
            title: '系统异常',
            content: '系统服务暂时不可用，请稍后再试',
            okText: '确定',
          });
          return;
        }

        // 检查数据库状态
        if (response.data?.database?.status === 'error') {
          modal.error({
            title: '数据库异常',
            content: response.data.database.message || '数据库连接异常，请稍后再试',
            okText: '确定',
          });
          return;
        }
        
      } catch (error) {
        modal.error({
          title: '网络异常',
          content: '无法连接到服务器，请检查网络连接',
          okText: '确定',
        });
      }
    };

    const fetchApplicationInfo = async () => {
      const urlParams = new URL(window.location.href).searchParams;
      const skinAppId = resolveLoginSkinAppId(urlParams);
      if (!skinAppId) {
        setIsApplicationInfoLoaded(true);
        return;
      }
      if (isApplicationInfoLoaded) {
        return;
      }
      // 旧式 SSO（URL 带 app）取不到应用要报错；
      // 只是按 redirect 的 client_id 换肤时，失败不该挡住登录表单，退回平台默认皮肤即可
      const isLegacySso = Boolean(urlParams.get('app'));
      try {
        const response = await getApplicationsSsoId({ id: skinAppId }, { skipErrorHandler: true });
        if (response.code === 200 && response.data) {
          setApplicationInfo(response.data);
          if (isLegacySso) setSsoError(null);
        } else if (isLegacySso) {
          setSsoError({
            message: getApiErrorMessage(response, 'SSO 登录失败'),
          });
        }
      } catch (error) {
        if (isLegacySso) setSsoError(resolveSsoError(error));
      } finally {
        setIsApplicationInfoLoaded(true);
      }
    };

    const checkUserLoginStatus = async () => {
      try {
        setIsCheckingAuth(true);
        // 刚从 /auth/logout 中转过来（或应用登出带 logged_out=1）：明确是「已退出」状态，
        // 不要再判定"已登录"，否则会被静默 SSO 登回去（见 SSO 方案计划 现象 1）
        if (new URLSearchParams(window.location.search).get('logged_out') === '1') {
          return;
        }
        const urlParams = new URL(window.location.href).searchParams;
        const appId = urlParams.get('app');
        // SSO 页：本地若是应用密钥签发的 token，check 必须带 app
        const isTokenValid = await checkTokenValid(appId);

        if (isTokenValid) {
          setIsLoggedIn(true);
          if (!appId) {
            setRedirectMessage('您已登录，正在打开管理界面……');
          }
        }
      } catch (error) {
        console.error('检查登录状态失败:', error);
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkHealth();
    fetchApplicationInfo();
    checkUserLoginStatus();
  }, []); // 移除依赖项，避免循环调用

  // 已登录用户的 SSO / 管理台跳转（等待 applicationInfo 加载完成且无 SSO 错误后再执行）
  useEffect(() => {
    // 已退出（logged_out=1）：停在登录表单，等用户主动发起登录
    if (new URLSearchParams(window.location.search).get('logged_out') === '1') {
      return;
    }
    if (!isLoggedIn || isCheckingAuth || ssoRedirectStartedRef.current || ssoError) {
      return;
    }

    const urlParams = new URL(window.location.href).searchParams;
    const appId = urlParams.get('app');

    if (!appId) {
      ssoRedirectStartedRef.current = true;
      const timer = setTimeout(() => {
        history.push('/');
      }, 1500);
      return () => clearTimeout(timer);
    }

    if (!isApplicationInfoLoaded) {
      return;
    }

    setRedirectMessage(
      applicationInfo?.name
        ? `您已登录，正在打开 ${applicationInfo.name} 应用……`
        : '您已登录，正在打开应用……',
    );

    ssoRedirectStartedRef.current = true;
    const timer = setTimeout(async () => {
      try {
        // SSO JWT 按应用密钥签发，check 必须带 app
        const userData = parseAuthUser(
          await getAuthCheck({ app: appId }, { skipErrorHandler: true }),
        );
        if (!userData) {
          message.error('获取用户信息失败');
          ssoRedirectStartedRef.current = false;
          return;
        }
        const userInfo: UserInfo = {
          user_id: userData.user_id,
          username: userData.username,
          name: userData.name,
          avatar: userData.avatar,
          gender: userData.gender,
          email: userData.email,
          phone: userData.phone,
          status: userData.status,
          department_id: userData.department_id,
        };
        // 必须用该应用的 token：平台 token 的签名与 app 不同，交给业务侧会被拒
        const { token, refreshToken } = getSsoAuth(appId);
        if (!token) {
          // 没有该应用的 token 就不要拿着平台 token 去跳转（业务侧必然 401）
          ssoRedirectStartedRef.current = false;
          return;
        }
        await performSsoRedirect(appId, userInfo, token, refreshToken);
      } catch (error) {
        console.error('SSO 自动跳转失败:', error);
        setSsoError(resolveSsoError(error));
        ssoRedirectStartedRef.current = false;
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [isLoggedIn, isCheckingAuth, isApplicationInfoLoaded, applicationInfo, ssoError]);

  const handleLoginSuccess = async (userInfo: UserInfo, token: string, refreshToken?: string) => {
    const urlParams = new URL(window.location.href).searchParams;
    const appId = urlParams.get('app');
    try {
      // SSO 登录时 JWT 是按【应用密钥】签发的，只对「带 app 参数」的请求有效；
      // EADAF 管理台的全局会话校验不带 app（用平台密钥验签），把它写进同一个
      // localStorage.token 会把管理台会话覆盖成无效 token，随后 401 → 清会话 →
      // 回登录页。所以应用 token 存到独立键，绝不占用平台会话位。
      if (appId) {
        saveSsoAuth(appId, token, refreshToken);
      } else {
        saveAuth(token, refreshToken);
      }

      // SSO：JWT 按应用密钥签发，check 必须带 app
      if (appId) {
        const userData = parseAuthUser(
          await getAuthCheck({ app: appId }, { skipErrorHandler: true }),
        );
        if (!userData) {
          clearSsoAuth(appId);
          message.error('登录失败，请重试');
          return;
        }
        const updatedUserInfo: UserInfo = {
          user_id: userData.user_id || '',
          username: userInfo.username,
          name: userData.name || userInfo.username,
          avatar: normalizeUploadFileId(userData.avatar),
          gender: userData.gender as UserInfo['gender'],
          email: userData.email || '',
          phone: userData.phone || null,
          status: userData.status as UserInfo['status'],
          department_id: userData.department_id || null,
          must_change_password: userData.must_change_password,
        };
        if (updatedUserInfo.must_change_password) {
          message.info('首次登录请先修改默认密码');
          await refresh();
          history.replace('/account/center');
          return;
        }
        await performSsoRedirect(appId, updatedUserInfo, token, refreshToken);
        return;
      }

      // 平台登录：一次 refresh 拉齐 user / menu / departments，避免竞态覆盖
      const next = await refresh();
      if (next?.currentUser?.must_change_password) {
        message.info('首次登录请先修改默认密码');
        history.replace('/account/center');
        return;
      }

      const redirect = urlParams.get('redirect');
      if (redirect) {
        try {
          history.replace(decodeURIComponent(redirect));
        } catch {
          history.replace('/member_org');
        }
      } else {
        history.replace('/member_org');
      }
    } catch (error) {
      // 同一层原因：SSO 请求失败也不能去清管理台会话（那正是"EADAF 掉登录"的现象）
      if (appId) {
        clearSsoAuth(appId);
      } else {
        clearAuth();
      }
      message.error('登录失败，请重试');
    }
  };

  const handleLogin = async (loginData: LoginParams) => {
    try {
      setLoading(true);
      // SSO：URL 带 app 时必须把 application_id 传给登录接口，
      // 否则 JWT 用平台密钥签发，而业务侧 /auth/check?app= 用应用密钥验签会 401。
      const urlParams = new URL(window.location.href).searchParams;
      const appId = urlParams.get('app');
      // 授权码流程的登录页没有 app：把「这页属于哪个应用」单独告诉后端，
      // 只用于判定人类验证（否则会按平台全局开关弹滑块，忽略应用自己的设置）
      const skinAppId = appId ? null : resolveLoginSkinAppId(urlParams);
      const loginPayload = appId
        ? { ...loginData, application_id: appId, sid: getSsoSid() || undefined }
        : {
          ...loginData,
          ...(skinAppId ? { login_app_id: skinAppId } : {}),
          sid: getSsoSid() || undefined,
        };
      const msg = await postAuthLogin(loginPayload) as LoginResponse;

      // 后端把这次登录并入（或新建）该浏览器的会话；存下来供下次登录/登出复用
      if ((msg.data as { sid?: string } | undefined)?.sid) {
        saveSsoSid((msg.data as { sid?: string }).sid);
      }

      if (msg.data?.token) {
        message.success('登录成功！');
        setShowCaptcha(false);

        // SSO 响应里的应用信息先写入，后续 handleLoginSuccess 再 check + 跳转
        if (msg.data?.sso && appId) {
          const ssoInfo = msg.data.sso;
          setApplicationInfo({
            application_id: ssoInfo.application_id,
            name: ssoInfo.application_name,
            sso_enabled: true,
            sso_config: {
              redirect_uri: ssoInfo.sso_config?.redirect_uri,
              protocol: ssoInfo.sso_config?.protocol,
              currentTimestamp:
                ssoInfo.sso_config?.currentTimestamp != null
                  ? String(ssoInfo.sso_config.currentTimestamp)
                  : undefined,
              secret: ssoInfo.sso_config?.secret,
              redirect_mode: ssoInfo.sso_config?.redirect_mode,
              salt: ssoInfo.sso_config?.salt,
              base_url: ssoInfo.sso_config?.base_url,
              client_id: ssoInfo.sso_config?.client_id,
              client_secret: ssoInfo.sso_config?.client_secret,
              issuer: ssoInfo.sso_config?.issuer,
              frontend_url: ssoInfo.sso_config?.frontend_url,
              login_page: ssoInfo.sso_config?.login_page || applicationInfo?.sso_config?.login_page,
              login_verify_enabled: ssoInfo.sso_config?.login_verify_enabled,
            },
          });
        }

        const userInfo: UserInfo = {
          user_id: msg.data.user_id || '',
          username: loginData.username,
          name: loginData.username,
          avatar: null,
          gender: null,
          email: '',
          phone: null,
          status: 'ACTIVE',
          department_id: null,
        };
        await handleLoginSuccess(userInfo, msg.data.token, msg.data.refresh_token);
        return true;
      } else if (msg.data?.need_captcha) {
        // 该应用配置了「不需要人类验证」时，服务端不会再返回 need_captcha；
        // 这里再兜一层：拿不到明确要求就不弹滑块，避免多余的一次滑动。
        const verifyRequired = msg.data?.sso?.sso_config?.login_verify_enabled
          ?? applicationInfo?.sso_config?.login_verify_enabled;
        if (verifyRequired === false) {
          message.error(msg.message || '登录失败');
          return false;
        }
        setLoginParams(loginData);
        const response = await getCaptcha();
        if (!response.data?.captcha_id) {
          message.error('获取验证码失败，请重试！');
        } else {
          setCaptchaId(response.data.captcha_id);
          setShowCaptcha(true);
        }
      } else {
        message.error(msg.message || '登录失败');
      }
      return false;
    } catch (error) {
      message.error('登录失败，请稍后重试');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (values: LoginParams) => {
    await handleLogin(values);
  };

  const handleCaptchaSuccess = async (duration: number, trail: { x?: number; y?: number; timestamp?: number }[]) => {
    if (!loginParams || !captchaId) return;

    // 滑块验证已通过。先关弹窗再登录，避免窗口停在「验证成功」上，让人以为没通过。
    setShowCaptcha(false);

    try {
      const loginData = {
        ...loginParams,
        captcha_data: {
          captcha_id: captchaId,
        },
      };

      const success = await handleLogin(loginData);
      if (!success) {
        captchaRef.current?.reset();
      }
    } catch (error: any) {
      captchaRef.current?.reset();
      message.error(error.response?.data?.message || '登录失败', 20);
    }
  };

  // 皮肤按「URL 的 app，或 redirect 里 /oauth/authorize 的 client_id」取；
  // SSO 流程本身仍只看 app（见文件顶部 resolveLoginSkinAppId 的说明）
  const skinAppId = resolveLoginSkinAppId(new URLSearchParams(window.location.search));
  const isSsoSkin = Boolean(skinAppId);
  const branding = isSsoSkin ? applicationInfo : initialState?.appBranding;
  const { name: pageTitle, shortName: pageShortName, logo: pageLogo } = isSsoSkin
    ? resolveSsoBrandingDisplay(applicationInfo)
    : resolveBrandingDisplay(branding);
  const isLoadingSsoContext = isCheckingAuth || (isSsoSkin && !isApplicationInfoLoaded);
  const loginPageStyle = isSsoSkin ? applicationInfo?.sso_config?.login_page : undefined;
  const loginSubtitle = isSsoSkin
    ? loginPageStyle?.subtitle?.trim() || undefined
    : resolveLoginPageDescription(false);

  const AuthPageContainer = ({ children }: { children: React.ReactNode }) => (
    <AuthPageFrame
      shortName={pageShortName}
      loginPage={loginPageStyle}
      asidePending={isSsoSkin && !isApplicationInfoLoaded}
      helmetTitle={`登录- ${pageTitle}`}
    >
      {children}
    </AuthPageFrame>
  );

  const renderSsoError = () => (
    <Card className="auth-card" variant="borderless">
      <Result
        status="error"
        title={ssoError?.message || 'SSO 登录失败'}
        subTitle={undefined}
        extra={[
          <Button type="primary" key="retry" onClick={() => window.location.reload()}>
            重试
          </Button>,
        ]}
      />
    </Card>
  );

  // 正在检查登录状态或加载 SSO 应用配置
  if (isLoadingSsoContext) {
    return (
      <AuthPageContainer>
        <Card className="auth-card" variant="borderless">
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin size="large" />
            <div className="auth-status-text" style={{ marginTop: 20 }}>
              {isSsoSkin ? '正在加载 SSO 应用配置...' : '正在检查登录状态...'}
            </div>
          </div>
        </Card>
      </AuthPageContainer>
    );
  }

  if (ssoError) {
    return (
      <AuthPageContainer>
        {renderSsoError()}
      </AuthPageContainer>
    );
  }

  // 如果已登录且无 SSO 错误，显示重定向提示
  if (isLoggedIn) {
    return (
      <AuthPageContainer>
        <Card className="auth-card" variant="borderless">
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Lottie
              style={{ width: '80px', height: '80px', margin: '0 auto 20px' }}
              animationData={loadingLottie}
              loop
              play
            />
            <div className="auth-status-title" style={{ marginBottom: 10 }}>
              {redirectMessage}
            </div>
            <div className="auth-status-text">
              请稍候，正在为您跳转...
            </div>
          </div>
        </Card>
      </AuthPageContainer>
    );
  }

  return (
    <AuthPageContainer>
      <Card className="auth-card" variant="borderless">
        <Space orientation="vertical" size="large" style={{ width: '100%' }}>
          {loggedOut ? (
            <Alert
              type="success"
              showIcon
              message="您已退出登录"
              description="如需继续使用，请重新登录。"
            />
          ) : null}

          <div className="auth-header">
            <img src={pageLogo} alt={pageTitle} className="logo" />
            <div className="title">{pageTitle}</div>
            {loginSubtitle ? <div className="description">{loginSubtitle}</div> : null}
          </div>

          <Form
            form={form}
            name="login"
            initialValues={{
              autoLogin: true,
              username: 'admin',
              password: '123456',
            }}
            onFinish={async (values) => {
              await handleSubmit(values as LoginParams);
            }}
            size="large"
          >
            <Form.Item
              name="username"
              rules={[
                {
                  required: true,
                  message: '请输入用户名!',
                },
              ]}
            >
              <Input
                placeholder="用户名"
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[
                {
                  required: true,
                  message: '请输入密码！',
                },
              ]}
            >
              <Input.Password
                placeholder="密码"
              />
            </Form.Item>

            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading} block>
                登录
              </Button>
            </Form.Item>

            <div className="d-flex justify-content-end">
                <Button type="link" onClick={() => {
                  const urlParams = new URLSearchParams(window.location.search);
                  const appId = urlParams.get('app');
                  history.push(`/auth/reset-password${appId ? `?app=${appId}` : ''}`);
                }}>
                  忘记密码？
                </Button>
            </div>
          </Form>
        </Space>
      </Card>

      <Modal
        title="需验证您是真人操作"
        open={showCaptcha}
        footer={null}
        closable={true}
        maskClosable={false}
        onCancel={() => {
          setShowCaptcha(false);
          captchaRef.current?.reset();
        }}
      >
        <SliderCaptchaComponent
          ref={captchaRef}
          onSuccess={handleCaptchaSuccess}
          onClose={() => setShowCaptcha(false)}
          captchaId={captchaId}
        />
      </Modal>
    </AuthPageContainer>
  );
};

export default LoginPage;