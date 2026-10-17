import defaultSettings from '../../config/defaultSettings';
import { getSystemBranding, type AppBranding } from '@/services/EADAF/api/systemBranding';
import { resolveMediaUrl } from '@/utils/mediaUrl';

export type { AppBranding };

/** SSO 第三方应用无 Logo 时的默认图 */
export const SSO_DEFAULT_LOGO = '/images/robot.svg';

export interface BrandingDisplay {
  name: string;
  shortName: string;
  logo: string;
  description?: string;
}

export function resolveBrandingDisplay(branding?: AppBranding | null): BrandingDisplay {
  const name = branding?.name?.trim() || defaultSettings.title || 'EADAF';
  const shortName = branding?.code?.trim() || name;
  return {
    name,
    shortName,
    logo: resolveMediaUrl(branding?.logo_url) || defaultSettings.logo || '/images/EADAF-logo.png',
    description: branding?.description?.trim() || undefined,
  };
}

/** SSO 登录：仅使用第三方应用品牌，Logo 缺失时用 robot.svg */
export function resolveSsoBrandingDisplay(ssoApp?: AppBranding | null): BrandingDisplay {
  const name = ssoApp?.name?.trim() || '应用';
  const shortName = ssoApp?.code?.trim() || name;
  return {
    name,
    shortName,
    logo: resolveMediaUrl(ssoApp?.logo_url) || SSO_DEFAULT_LOGO,
    description: ssoApp?.description?.trim() || undefined,
  };
}

/** SSO 应用优先，缺失字段回退到系统应用配置（管理台登录用） */
export function mergeAppBranding(
  ssoApp?: AppBranding | null,
  systemApp?: AppBranding | null,
): AppBranding | undefined {
  if (ssoApp?.application_id || ssoApp?.name) {
    return {
      ...systemApp,
      ...ssoApp,
      name: ssoApp.name || systemApp?.name,
      code: ssoApp.code || systemApp?.code,
      logo_url: ssoApp.logo_url ?? systemApp?.logo_url,
      description: ssoApp.description ?? systemApp?.description,
    };
  }
  return systemApp || undefined;
}

/** 平台登录页默认副标题；SSO 登录页仅使用 login_page.subtitle，不回退到应用描述 */
export function resolveLoginPageDescription(ssoEnabled?: boolean): string {
  return ssoEnabled ? '请使用统一身份认证登录' : '请使用用户名和密码登录';
}

export async function fetchSystemBranding(): Promise<AppBranding | undefined> {
  try {
    const response = await getSystemBranding({ skipErrorHandler: true });
    if (response.code === 200 && response.data) {
      return response.data;
    }
  } catch {
    // 使用 defaultSettings 兜底
  }
  return undefined;
}

export function applyDocumentBranding(display: BrandingDisplay) {
  if (typeof document === 'undefined') return;
  const iconLink = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (iconLink && display.logo) {
    iconLink.href = display.logo;
  }
}
