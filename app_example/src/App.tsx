import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AIChatProvider } from '@eadaf/ai-base';
import '@eadaf/ai-base/style.css';
import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './routes';
import { ChatSessionGroupProvider } from './ChatSessionGroupProvider';

/**
 * 雨伞品牌厂商 · 电商独立站销售管理系统（示例应用 app_example）
 *
 * - 业务数据、登录、AI 能力全部复用 EADAF：示例只写前端页面；
 * - 右侧 AI 助手通过 EADAF 的 Skill/Tool 查询同一份销售 Demo 数据（SQLite）；
 * - applicationId / scopeSlug 见 app_example/.env.example，在 EADAF 管理台注册对应应用与 Scope。
 */
const SYSTEM_PROMPT_PREFIX = [
  '你是「雨伞品牌厂商电商独立站销售管理系统」的 AI 助手，已接入 EADAF 后端的销售 Demo 数据（伞品、会员、订单、售后工单）。',
  '遇到订单、售后、统计类问题，必须先调用 Tool 取数再回答，禁止声称无法访问数据库或 CRM。',
].join('\n');

const PROMPT_ITEMS = [
  { key: '1', description: '查询订单 SO202501001 的详情' },
  { key: '2', description: '统计各状态订单数量和金额' },
  { key: '3', description: '列出所有待处理（open）的售后工单' },
  { key: '4', description: '按类型统计售后工单分布' },
  { key: '5', description: '哪些伞品库存低于 20 把？' },
];

export default function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <BrowserRouter>
        <ChatSessionGroupProvider>
          <AIChatProvider
            config={{
              apiBase: import.meta.env.VITE_API_BASE,
              scopeSlug: import.meta.env.VITE_DEMO_SCOPE_SLUG,
              systemPromptPrefix: SYSTEM_PROMPT_PREFIX,
              applicationId:
                import.meta.env.VITE_SSO_APPLICATION_ID || '77777777-7777-4777-8777-777777777701',
              welcome: {
                title: '你好，我是独立站 AI 助手',
                description:
                  '我能查订单、看售后、算销量。点击页面上的 @ 可把订单/会员加进引用，再直接提问。',
              },
              prompts: PROMPT_ITEMS,
            }}
          >
            <AppRoutes />
          </AIChatProvider>
        </ChatSessionGroupProvider>
      </BrowserRouter>
    </ConfigProvider>
  );
}
