import type {
  AIBaseClientOptions,
  AIBaseModelInfo,
  AIBaseScope,
  AIBaseSkill,
  AIBaseTool,
  ToolInvokeResult,
} from '../types';
import { extractAiChatErrorMessage } from '../utils/formatAiChatError';
import { withEadafAppParam } from '../utils/eadafAppParam';
import { getActiveTurnId } from '../observability/turnTrace';

function resolveBaseUrl(baseUrl?: string) {
  return (baseUrl || '/api').replace(/\/$/, '');
}

export class AIBaseClient {
  private baseUrl: string;
  private getToken: () => string | null;
  /** EADAF 应用 ID：请求要带 ?app= 才能用应用密钥验签（SSO 用户 JWT） */
  private applicationId?: string;

  constructor(options: AIBaseClientOptions = {}) {
    this.baseUrl = resolveBaseUrl(options.baseUrl);
    this.getToken = options.getToken || (() => localStorage.getItem('token'));
    this.applicationId = options.applicationId;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers as HeadersInit);
    headers.set('Content-Type', 'application/json');
    const token = this.getToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    const turnId = getActiveTurnId();
    if (turnId && !headers.has('X-AIBase-TurnId')) {
      headers.set('X-AIBase-TurnId', turnId);
    }

    const response = await fetch(withEadafAppParam(`${this.baseUrl}${path}`, this.applicationId), {
      ...init,
      headers,
    });

    const json = await response.json();
    if (!response.ok || json.error) {
      throw new Error(
        extractAiChatErrorMessage(json.error?.message || json.message || `Request failed: ${response.status}`),
      );
    }
    return json as T;
  }

  async listModels(): Promise<AIBaseModelInfo[]> {
    const res = await this.request<{ data: AIBaseModelInfo[] }>('/v1/ai/models');
    return res.data || [];
  }

  async getCapabilities(options?: { scopeSlug?: string; applicationId?: string }) {
    const params = new URLSearchParams();
    if (options?.scopeSlug) params.set('scopeSlug', options.scopeSlug);
    if (options?.applicationId) params.set('applicationId', options.applicationId);
    const query = params.toString();
    const res = await this.request<{ data: Record<string, unknown> }>(
      `/v1/ai/capabilities${query ? `?${query}` : ''}`,
    );
    return res.data;
  }

  async getScopeTools(scopeSlug: string): Promise<{ scope: AIBaseScope; tools: AIBaseTool[] }> {
    const res = await this.request<{ data: { scope: AIBaseScope; tools: AIBaseTool[] } }>(
      `/v1/ai/scopes/${encodeURIComponent(scopeSlug)}/tools`,
    );
    return res.data;
  }

  async loadSkill(skillSlug: string): Promise<AIBaseSkill> {
    const res = await this.request<{ data: AIBaseSkill }>(
      `/v1/ai/skills/${encodeURIComponent(skillSlug)}`,
    );
    return res.data;
  }

  /**
   * 批量获取多个 Skill 详情（含 Tool 列表）：一次请求替代 N 次 loadSkill。
   * 对应后端 GET /v1/ai/skills?slugs=a,b,c。
   */
  async loadSkills(slugs: string[]): Promise<AIBaseSkill[]> {
    if (!slugs.length) return [];
    const res = await this.request<{ data: AIBaseSkill[] }>(
      `/v1/ai/skills?slugs=${encodeURIComponent(slugs.join(','))}`,
    );
    return res.data || [];
  }

  async invokeServerTool(functionName: string, args: Record<string, unknown>): Promise<ToolInvokeResult> {
    const res = await this.request<{ data: ToolInvokeResult }>('/v1/ai/tools/invoke', {
      method: 'POST',
      body: JSON.stringify({ functionName, arguments: args }),
    });
    return res.data;
  }
}
