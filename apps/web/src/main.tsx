import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { del, get, set } from 'idb-keyval';
import { App } from './App';
import { QUERY_CACHE_KEY } from './api/cache';
import './styles.css';

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
          /*
           * What a session needs to start without a signal: the workouts, the
           * catalogue, and who is signed in.
           *
           * `me` has to be here. Sign-in is required, so without a cached user
           * an offline app decides you are signed out and shows the sign-in
           * screen — in a gym, with no way to get past it. A network failure
           * leaves the cached user in place; a real 401 resolves to null and
           * signs you out properly.
           *
           * History is left out: it is cheap to refetch, and a stale count is
           * more confusing than none.
           */
          shouldDehydrateQuery: (query) => {
            const root = query.queryKey[0];
            return (
              root === 'me' || root === 'workouts' || root === 'workout' || root === 'exercises'
            );
          },
        },
      }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </PersistQueryClientProvider>
  </StrictMode>,
);
