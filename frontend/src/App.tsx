import { Suspense } from 'react';
import { App as AntdApp, ConfigProvider, Spin, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AIChatProvider } from '@eadaf/ai-base';
import '@eadaf/ai-base/style.css';
import { BrowserRouter } from 'react-router-dom';
import { NuqsAdapter } from 'nuqs/adapters/react-router/v7';
import { eadafHostToolsPlugin } from '@/ai/eadafHostToolsPlugin';
import { ChatSessionGroupProvider } from '@/ai/ChatSessionGroupProvider';
import { createAIChatConfig } from '@/config/aiChat';
import { InitialStateProvider } from '@/providers/InitialStateProvider';
import AppRoutes from '@/routes';
import { setupAIMutationRouter } from '@/ai/toolMutation';
import { AntdAppApiBridge } from '@/utils/antdAppApis';
import { setupAiToolDevLogger } from '@/utils/aiToolDevLogger';
import { setupAiToolInvokeFileLogger } from '@/utils/toolInvokeFileLogger';
import { SyncUiThemeWithAiBase } from '@/theme/SyncUiThemeWithAiBase';
import { UiThemeProvider, useUiTheme } from '@/theme/uiTheme';
import { ProTableDensityProvider } from '@/theme/proTableDensity';

setupAiToolDevLogger();
setupAiToolInvokeFileLogger();
setupAIMutationRouter();

const originalError = console.error;
console.error = (...args) => {
  if (
    args[0]?.includes?.('is deprecated') ||
    args[0]?.includes?.('net::ERR_FILE_NOT_FOUND') ||
    args[0]?.includes?.('[antd: ConfigProvider]') ||
    args[0]?.includes?.('[antd: Tabs] `indicatorSize`') ||
    args[0]?.includes?.(
      'Unchecked runtime.lastError: The message port closed before a response was received.',
    )
  ) {
    return;
  }
  originalError.call(console, ...args);
};

/** AI getToken 高频调用，勿走带 console.log 的 getAuth */
const aiChatConfig = createAIChatConfig(() => localStorage.getItem('token'));

function ThemedApp() {
  const { resolved } = useUiTheme();

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: resolved === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1890ff',
        },
      }}
    >
      <AntdApp>
        <AntdAppApiBridge>
          <InitialStateProvider>
            <BrowserRouter>
              <NuqsAdapter>
                <ChatSessionGroupProvider>
                  <AIChatProvider config={aiChatConfig} plugins={[eadafHostToolsPlugin]}>
                    <SyncUiThemeWithAiBase />
                    <Suspense
                      fallback={
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            height: '100vh',
                          }}
                        >
                          <Spin size="large" />
                        </div>
                      }
                    >
                      <AppRoutes />
                    </Suspense>
                  </AIChatProvider>
                </ChatSessionGroupProvider>
              </NuqsAdapter>
            </BrowserRouter>
          </InitialStateProvider>
        </AntdAppApiBridge>
      </AntdApp>
    </ConfigProvider>
  );
}

export default function App() {
  return (
    <UiThemeProvider>
      <ProTableDensityProvider>
        <ThemedApp />
      </ProTableDensityProvider>
    </UiThemeProvider>
  );
}
