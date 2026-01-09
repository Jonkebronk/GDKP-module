// Build version: 2026-01-09-v2 - PWA removed
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0, // Data is immediately stale - enables instant refetch on invalidation
      gcTime: 5 * 60 * 1000, // Keep unused data in cache for 5 minutes (was cacheTime)
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 1,
    },
    mutations: {
      retry: 0, // Don't retry failed mutations
    },
  },
});

// Export for use in socket hooks
export { queryClient };

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
