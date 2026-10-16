// @ts-ignore
/* eslint-disable */
import { request } from '@/utils/request';

/** 获取验证码 获取登录验证码图片 GET /api/v1/captcha */
export async function getCaptcha(options?: { [key: string]: any }) {
  return request<{
    code?: number;
    message?: string;
    data?: { captcha_id?: string; bg_url?: string; puzzle_url?: string };
  }>('/api/v1/captcha', {
    method: 'GET',
    ...(options || {}),
  });
}

/** 验证滑块位置 验证用户滑动轨迹 POST /api/v1/captcha/verify */
export async function postCaptchaVerify(
  body: {
    /** 验证码ID */
    captcha_id: string;
    /** 滑动持续时间（毫秒） */
    duration: number;
    /** 滑动轨迹 */
    trail: { x?: number; y?: number; timestamp?: number }[];
  },
  options?: { [key: string]: any },
) {
  return request<{
    code?: number;
    message?: string;
    data?: {
      verified?: boolean;
      reason?: string;
      details?: {
        trajectory?: { score?: number; reason?: string[] };
        velocity?: { score?: number; reason?: string[] };
        repetition?: { score?: number; reason?: string[] };
        totalScore?: number;
      };
    };
  }>('/api/v1/captcha/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}
