import { create } from 'zustand';
import type { AppSettings, ClassColors, Role, RoutineSelection, SessionUser } from './types';

/* ============================================================
 * Global UI state — theme, settings, auth & routine selection.
 * ============================================================ */

const NEW_COLORS: ClassColors = {
  theory: '#1d4ed8',
  lab: '#16a34a',
  guest: '#7c3aed',
  ged: '#0e7490',
  nfe: '#0f766e',
  agriculture: '#65a30d',
  cancelled: '#dc2626',
  rescheduled: '#d97706',
};

/* legacy palette from before the 2026 redesign — migrated in place */
const LEGACY_COLORS: Record<string, string> = {
  theory: '#15803d', lab: '#7c3aed', guest: '#db2777', ged: '#0369a1',
  nfe: '#b45309', agriculture: '#0d9488', cancelled: '#dc2626', rescheduled: '#d97706',
};

export const DEFAULT_SETTINGS: AppSettings = {
  universityName: 'Daffodil International University',
  departmentName: 'Department of Pharmacy',
  universityTagline: 'Liberal Arts College · Savar, Dhaka',
  colors: NEW_COLORS,
};

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem('diu.app.settings');
    if (raw) {
      const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      const c = parsed.colors as Record<string, string>;
      if (c && Object.keys(LEGACY_COLORS).every((k) => c[k] === LEGACY_COLORS[k])) {
        parsed.colors = { ...NEW_COLORS };
        localStorage.setItem('diu.app.settings', JSON.stringify(parsed));
      }
      return parsed;
    }
  } catch { /* noop */ }
  return DEFAULT_SETTINGS;
}

function loadPrefs<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw != null) return JSON.parse(raw) as T;
  } catch { /* noop */ }
  return fallback;
}

interface AppStore {
  settings: AppSettings;
  setSettings: (s: Partial<AppSettings>) => void;
  resetSettings: () => void;

  dark: boolean;
  toggleDark: () => void;

  user: SessionUser | null;
  setUser: (u: SessionUser | null) => void;

  selection: RoutineSelection | null;
  setSelection: (sel: RoutineSelection) => void;
}

export const useApp = create<AppStore>((set, get) => ({
  settings: loadSettings(),
  setSettings: (s) => {
    const next = { ...get().settings, ...s, colors: { ...get().settings.colors, ...(s.colors ?? {}) } };
    localStorage.setItem('diu.app.settings', JSON.stringify(next));
    set({ settings: next });
  },
  resetSettings: () => {
    localStorage.removeItem('diu.app.settings');
    set({ settings: DEFAULT_SETTINGS });
  },

  dark: loadPrefs<boolean>('diu.theme.dark', false),
  toggleDark: () => {
    const next = !get().dark;
    localStorage.setItem('diu.theme.dark', JSON.stringify(next));
    set({ dark: next });
  },

  user: null,
  setUser: (u) => set({ user: u }),

  selection: loadPrefs<RoutineSelection | null>('diu.selection', null),
  setSelection: (sel) => {
    localStorage.setItem('diu.selection', JSON.stringify(sel));
    set({ selection: sel });
  },
}));

export function useRole(): Role | 'anon' {
  return useApp((s) => s.user?.role ?? 'anon');
}
