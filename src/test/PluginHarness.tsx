import React from 'react';
import PluginProvider from '../context/pluginContext';
import { usePlugin } from '../context/pluginContext';

const ReadyGate: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { isReady } = usePlugin();
  return isReady ? <>{children}</> : null;
};

const PluginHarness: React.FC<React.PropsWithChildren> = ({ children }) => {
  const ai = {
    enabled: true,
    model: 'gpt-4o-2024-08-06' as const,          
    apiKey: import.meta.env.VITE_OPENAI_API_KEY as string,
  };
  const props = {
    baseUrl: import.meta.env.VITE_API_URL,
    tenantId: import.meta.env.VITE_API_ACCOUNT_ID,
    accountId: import.meta.env.VITE_API_ACCOUNT_ID,
    userName: import.meta.env.VITE_API_USERNAME,
    token: import.meta.env.VITE_API_TOKEN,
    authUser: import.meta.env.VITE_API_AUTH_USER,
    accountGroup: import.meta.env.VITE_ACCOUNT_GROUP,
    ai: ai
  };
  return (
    <PluginProvider {...props}>
      <ReadyGate>{children}</ReadyGate>
    </PluginProvider>
  );
};

export default PluginHarness;
