import React, { useState } from 'react';
import { NavLink, Navigate, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { Icon, Modal, type IconName, useToast } from '../lib/ui';
import { useApp } from '../lib/store';
import { api } from '../lib/db';
import { useData } from '../lib/data';

/* ============================================================
 * Shared admin building blocks: guarded shell, sub-navigation,
 * generic CRUD table + form modal.
 * ============================================================ */

const ADMIN_NAV: { to: string; icon: IconName; label: string; end?: boolean }[] = [
  { to: '/admin', icon: 'home', label: 'Dashboard', end: true },
  { to: '/admin/routines', icon: 'calendar', label: 'Routine Entries' },
  { to: '/admin/generator', icon: 'zap', label: 'Smart Routine Generator' },
  { to: '/admin/offdays', icon: 'clock', label: 'Batch Off Days' },
  { to: '/admin/courses', icon: 'book', label: 'Courses' },
  { to: '/admin/faculty', icon: 'users', label: 'Faculty' },
  { to: '/admin/rooms', icon: 'door', label: 'Rooms' },
  { to: '/admin/batches', icon: 'award', label: 'Batches & Groups' },
  { to: '/admin/catalog', icon: 'layers', label: 'Semesters · Days · Slots' },
  { to: '/admin/announcements', icon: 'bell', label: 'Announcements' },
  { to: '/admin/settings', icon: 'settings', label: 'Settings & Colors' },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const role = useApp((s) => s.user?.role);
  const loc = useLocation();
  if (role !== 'admin') return <Navigate to="/login" replace state={{ from: loc.pathname }} />;

  return (
    <div className="animate-fade-in">
      <div className="mb-5 flex items-center gap-2.5">
        <span className="grad-icon-tile flex h-9 w-9 items-center justify-center rounded-xl"><Icon name="shield" /></span>
        <div>
          <h1 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">Administrator Dashboard</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Manage semesters, batches, routines, off days, faculty, courses, rooms & announcements.</p>
        </div>
      </div>
      <div className="no-print mb-6 flex gap-1.5 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5 scroll-thin dark:border-slate-800 dark:bg-slate-900">
        {ADMIN_NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              clsx(
                'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors',
                isActive ? 'grad-pill text-white shadow-glow-blue' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
              )
            }
          >
            <Icon name={n.icon} className="h-3.5 w-3.5" /> {n.label}
          </NavLink>
        ))}
      </div>
      {children}
    </div>
  );
}

/* ---------------- Generic CRUD table ---------------- */

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
}

export function CrudTable<T extends { id: string }>({
  rows, columns, onEdit, onDelete, addLabel, onAdd, searchKeys, searchPlaceholder, emptyHint,
}: {
  rows: T[];
  columns: Column<T>[];
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  addLabel?: string;
  onAdd?: () => void;
  searchKeys?: (row: T) => string;
  searchPlaceholder?: string;
  emptyHint?: string;
}) {
  const [q, setQ] = useState('');
  const visible = searchKeys && q.trim()
    ? rows.filter((r) => searchKeys(r).toLowerCase().includes(q.trim().toLowerCase()))
    : rows;

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-3.5 dark:border-slate-800">
        <input className="input !w-64" placeholder={searchPlaceholder ?? 'Search…'} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex items-center gap-2">
          <span className="mr-1 text-xs font-semibold text-slate-400">{visible.length} / {rows.length}</span>
          {onAdd && (
            <button className="btn-primary !py-1.5 text-xs" onClick={onAdd}><Icon name="plus" className="h-3.5 w-3.5" /> {addLabel ?? 'Add'}</button>
          )}
        </div>
      </div>
      {visible.length ? (
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-800/40">
                {columns.map((c) => <th key={c.key} className="table-th">{c.header}</th>)}
                <th className="table-th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 dark:border-slate-800/70 dark:hover:bg-slate-800/30">
                  {columns.map((c) => (
                    <td key={c.key} className={clsx('table-td', c.className)}>{c.render(r)}</td>
                  ))}
                  <td className="table-td text-right">
                    <div className="inline-flex gap-1">
                      {onEdit && (
                        <button className="rounded-lg p-1.5 text-slate-400 hover:bg-sky-50 hover:text-sky-600 dark:hover:bg-sky-950" title="Edit" onClick={() => onEdit(r)}><Icon name="edit" className="h-3.5 w-3.5" /></button>
                      )}
                      {onDelete && (
                        <button className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950" title="Delete" onClick={() => onDelete(r)}><Icon name="trash" className="h-3.5 w-3.5" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="p-8 text-center text-sm text-slate-400">{emptyHint ?? 'No records found.'}</p>
      )}
    </div>
  );
}

/* ---------------- Form field helpers ---------------- */

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

export function AdminModal({ open, onClose, title, subtitle, children }: { open: boolean; onClose: () => void; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={subtitle} wide>
      {children}
    </Modal>
  );
}

export function SaveBar({ busy, label = 'Save changes' }: { busy?: boolean; label?: string }) {
  return (
    <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Icon name="check" className="h-4 w-4" />}
        {busy ? 'Saving…' : label}
      </button>
    </div>
  );
}

/* small hook to reload data after mutations */
export function useRefresh() {
  const { refresh } = useData();
  return async () => { await refresh(); };
}
