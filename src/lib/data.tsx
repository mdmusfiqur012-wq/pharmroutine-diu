import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './db';
import type { Database } from './types';

/* ============================================================
 * DataProvider — loads the whole relational database once and
 * exposes a refresh() for mutation pages (admin CRUD).
 * ============================================================ */

interface DataCtx {
  db: Database | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  online: boolean;
}

const Ctx = createContext<DataCtx>({ db: null, loading: true, error: null, refresh: async () => {}, online: false });

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<Database | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const data = await api.fetchAll();
      setDb(data);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <Ctx.Provider value={{ db, loading, error, refresh, online: Boolean((import.meta as any).env?.VITE_SUPABASE_URL) }}>
      {children}
    </Ctx.Provider>
  );
}

export function useData(): DataCtx {
  return useContext(Ctx);
}
