import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { del, get, set } from 'idb-keyval';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { QUERY_CACHE_KEY, shouldPersist } from './api/cache';
import './styles.css';

/*
 * Take a new version as soon as it is available, reloading once it is in
 * control. Without this the precached shell keeps serving the previous build
 * until the second visit after a deploy, which makes a fix look like it did
 * not work.
 */
registerSW({ immediate: true });

const DAY = 1000 * 60 * 60 * 24;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A phone in a gym loses signal constantly; refetching on every focus
      // would mean a spinner every time the screen wakes.
      refetchOnWindowFocus: false,
      retry: 1,
      gcTime: 7 * DAY,
    },
  },
});

/**
 * The query cache is kept in IndexedDB, not localStorage: workouts and the
 * exercise catalogue together are larger than localStorage comfortably holds,
 * and writing them synchronously would block the main thread mid-session.
 */
const persister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => get(key).then((value) => value ?? null),
    setItem: (key, value) => set(key, value),
    removeItem: (key) => del(key),
  },
  key: QUERY_CACHE_KEY,
  throttleTime: 2000,
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 7 * DAY,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => shouldPersist(query.queryKey, query.state.data),
        },
      }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </PersistQueryClientProvider>
  </StrictMode>,
);
