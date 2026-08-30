import { useMemo, useState, useEffect } from 'react';
import clsx from 'clsx';
import type { ClassDay, JoinedEntry, TimeSlot } from '../lib/types';
import { entriesInSlot, STATUS_META } from '../lib/routine';
import { Segmented, Icon, LegendChip } from '../lib/ui';
import { MiniClassCard, MobileClassCard, useClassModal, ClassModalHost } from './ClassCard';
import { useApp } from '../lib/store';
import diuLogo from '../assets/diu-logo.png';

/* ============================================================
 * Timetable — time slots as COLUMNS, days as ROWS.
 *  · Weekly Grid (desktop + print / export)
 *  · Mobile: selectable day tabs + stacked cards
 *  · Daily list view
 *  · OFF DAY rows rendered from the batch's off-day table
 * ============================================================ */

export type ViewMode = 'grid' | 'daily';

export interface TimetableProps {
  entries: JoinedEntry[];
  days: ClassDay[];
  slots: TimeSlot[];
  offDayMap: Map<string, { reason?: string | null }>;
  emptyDays?: ClassDay[];         // active days with no classes at all
  selectionLabel?: string[];
  showLegend?: boolean;
  printMode?: boolean;            // render simplified for PDF/print export
  compact?: boolean;
}

export function RoutineLegend() {
  const settings = useApp((s) => s.settings);
  const c = settings.colors;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <LegendChip color={c.theory} label="Theory" />
      <LegendChip color={c.lab} label="Laboratory" />
      <LegendChip color={c.guest} label="Guest Faculty" />
      <LegendChip color={c.ged} label="GED" />
      <LegendChip color={c.nfe} label="NFE" />
      <LegendChip color={c.agriculture} label="Agriculture" />
      <LegendChip color={c.rescheduled} label="Rescheduled" />
      <LegendChip color={c.cancelled} label="Cancelled" />
      <span className="ml-1 inline-flex items-center gap-1 text-[11px] font-medium text-slate-400">
        <span className="inline-block h-3 w-3 rounded border-2 border-dashed border-amber-400 bg-amber-50 dark:bg-amber-950/40" /> Off day
      </span>
    </div>
  );
}

export default function Timetable({ entries, days, slots, offDayMap, selectionLabel = [], showLegend = true, compact = false }: TimetableProps) {
  const settings = useApp((s) => s.settings);
  const [view, setView] = useState<ViewMode>('grid');
  const [mobileDay, setMobileDay] = useState<string | null>(null);
  const { entry, open, close } = useClassModal();

  const sortedDays = useMemo(() => [...days].sort((a, b) => a.sequence - b.sequence), [days]);

  // keep mobile selection valid
  useEffect(() => {
    if (mobileDay && !sortedDays.some((d) => d.id === mobileDay)) {
      setMobileDay(sortedDays[0]?.id ?? null);
    }
    if (!mobileDay && sortedDays.length) setMobileDay(sortedDays[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedDays.map((d) => d.id).join(',')]);

  const emptyIds = new Set(
    sortedDays
      .filter((d) => !offDayMap.has(d.id) && !entries.some((e) => e.day_id === d.id))
      .map((d) => d.id),
  );

  if (!sortedDays.length) {
    return (
      <div className="card p-10 text-center text-sm text-slate-500 dark:text-slate-400">
        No class days found for this selection.
      </div>
    );
  }

  return (
    <div>
      {/* toolbar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Segmented<ViewMode>
            value={view}
            onChange={setView}
            options={[
              { value: 'grid', label: <span className="inline-flex items-center gap-1.5"><Icon name="grid" className="h-3.5 w-3.5" /> Weekly Grid</span> },
              { value: 'daily', label: <span className="inline-flex items-center gap-1.5"><Icon name="list" className="h-3.5 w-3.5" /> Daily List</span> },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-brand-600" /> {entries.length} classes</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> {offDayMap.size} off day{offDayMap.size === 1 ? '' : 's'}</span>
          {selectionLabel.length > 0 && <span className="hidden sm:inline">· {selectionLabel.join(' · ')}</span>}
        </div>
      </div>

      {/* ============ WEEKLY GRID (desktop) ============ */}
      {view === 'grid' && (
        <div className="card overflow-hidden print-page">
          <div className="hidden overflow-x-auto scroll-thin md:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-800/40">
                  <th className="table-th sticky left-0 z-10 w-20 bg-slate-50 px-3 py-3 dark:bg-slate-800/90">Day</th>
                  {slots.map((s) => (
                    <th key={s.id} className="table-th px-2 py-3 text-center">
                      <span className="text-slate-400">{s.label.split('–')[0].trim()}</span>
                      <span className="mx-1 text-slate-300 dark:text-slate-600">–</span>
                      <span className="text-slate-400">{s.label.split('–')[1]?.trim()}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedDays.map((day) => {
                  const off = offDayMap.get(day.id);
                  const noClasses = emptyIds.has(day.id);
                  return (
                    <tr key={day.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/70">
                      <td className="table-td sticky left-0 z-10 bg-white px-3 align-top font-extrabold text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                        <span className="block text-xs">{day.name}</span>
                        <span className="text-[10px] font-semibold text-slate-400">{day.short_name}</span>
                      </td>
                      {off ? (
                        <td colSpan={slots.length}>
                          <div className="m-1.5 flex h-[104px] items-center gap-3 rounded-lg border-2 border-dashed border-amber-300 bg-amber-50/80 px-4 dark:border-amber-700/60 dark:bg-amber-950/30">
                            <Icon name="calendar" className="h-5 w-5 text-amber-500" />
                            <div>
                              <p className="text-sm font-extrabold uppercase tracking-wide text-amber-700 dark:text-amber-400">OFF DAY — No Classes Scheduled</p>
                              {off.reason && <p className="text-xs font-medium text-amber-600/90 dark:text-amber-500/80">{off.reason}</p>}
                            </div>
                          </div>
                        </td>
                      ) : noClasses ? (
                        <td colSpan={slots.length}>
                          <div className="m-1.5 flex h-[104px] items-center justify-center rounded-lg border border-slate-100 text-xs font-medium text-slate-300 dark:border-slate-800 dark:text-slate-600">
                            No classes scheduled
                          </div>
                        </td>
                      ) : (
                        slots.map((slot) => {
                          const cell = entriesInSlot(entries, day.id, slot.id);
                          return (
                            <td key={slot.id} className="table-td w-[12.5%] min-w-[150px] border-l border-slate-100 p-1 align-top dark:border-slate-800/70">
                              <div className="flex min-h-[104px] flex-col gap-1">
                                {cell.map((e) => (
                                  <MiniClassCard key={e.id} entry={e} onClick={() => open(e)} />
                                ))}
                              </div>
                            </td>
                          );
                        })
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ============ WEEKLY GRID (mobile → day tabs) ============ */}
          <div className="md:hidden">
            <div className="scroll-thin flex gap-1.5 overflow-x-auto border-b border-slate-100 bg-slate-50/60 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/30">
              {sortedDays.map((d) => {
                const isOff = offDayMap.has(d.id);
                return (
                  <button
                    key={d.id}
                    onClick={() => setMobileDay(d.id)}
                    className={clsx(
                      'shrink-0 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all',
                      mobileDay === d.id
                        ? 'bg-brand-700 text-white shadow'
                        : isOff
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
                          : 'bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700',
                    )}
                  >
                    {d.name}
                    {isOff && <span className="ml-1 text-[9px] font-extrabold uppercase">off</span>}
                  </button>
                );
              })}
            </div>
            <div className="space-y-2 p-3">
              {(() => {
                const day = sortedDays.find((d) => d.id === mobileDay) ?? sortedDays[0];
                if (!day) return null;
                if (offDayMap.has(day.id)) {
                  return (
                    <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/80 px-4 py-8 text-center dark:border-amber-700/60 dark:bg-amber-950/30">
                      <Icon name="calendar" className="h-6 w-6 text-amber-500" />
                      <p className="text-sm font-extrabold uppercase tracking-wide text-amber-700 dark:text-amber-400">OFF DAY — No Classes Scheduled</p>
                      {offDayMap.get(day.id)?.reason && (
                        <p className="text-xs text-amber-600/90">{offDayMap.get(day.id)?.reason}</p>
                      )}
                    </div>
                  );
                }
                const dayEntries = entries.filter((e) => e.day_id === day.id);
                if (!dayEntries.length) {
                  return <p className="py-8 text-center text-sm text-slate-400">No classes scheduled on {day.name}.</p>;
                }
                return dayEntries.map((e) => <MobileClassCard key={e.id} entry={e} onClick={() => open(e)} />);
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ============ DAILY LIST VIEW ============ */}
      {view === 'daily' && (
        <div className="space-y-4">
          {sortedDays.map((day) => {
            const off = offDayMap.get(day.id);
            const dayEntries = entries.filter((e) => e.day_id === day.id);
            return (
              <div key={day.id} className="card overflow-hidden">
                <div className={clsx(
                  'flex items-center justify-between border-b px-4 py-3',
                  off ? 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20' : 'border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-800/30',
                )}>
                  <div className="flex items-center gap-2.5">
                    <span className={clsx('flex h-9 w-9 items-center justify-center rounded-lg text-xs font-extrabold', off ? 'bg-amber-500 text-white' : 'bg-brand-700 text-white')}>
                      {day.short_name}
                    </span>
                    <div>
                      <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{day.name}</p>
                      <p className="text-[11px] font-medium text-slate-400">
                        {off ? 'Official off day' : `${dayEntries.length} class${dayEntries.length === 1 ? '' : 'es'}`}
                      </p>
                    </div>
                  </div>
                  {off && <span className="chip bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">OFF DAY</span>}
                </div>
                {off ? (
                  <p className="px-4 py-4 text-sm font-medium text-amber-700/80 dark:text-amber-400/80">
                    No Classes Scheduled — {off.reason ?? 'Weekly off day'}.
                  </p>
                ) : dayEntries.length ? (
                  <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
                    {dayEntries.map((e) => (
                      <div key={e.id} className="sm:hidden"><MobileClassCard entry={e} onClick={() => open(e)} /></div>
                    ))}
                    {dayEntries.map((e) => (
                      <div key={e.id} className="hidden sm:block">
                        <MiniClassCard entry={e} onClick={() => open(e)} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="px-4 py-4 text-sm text-slate-400">No classes scheduled.</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showLegend && view === 'grid' && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <span className="mr-1 text-[11px] font-extrabold uppercase tracking-wide text-slate-400">Legend</span>
          <RoutineLegend />
        </div>
      )}

      <ClassModalHost entry={entry} onClose={close} />
    </div>
  );
}

/* Dense printable/exportable variant: single class per cell, no interactivity */
export function PrintTimetable({ entries, days, slots, offDayMap, selectionLabel, settings }: {
  entries: JoinedEntry[]; days: ClassDay[]; slots: TimeSlot[]; offDayMap: Map<string, { reason?: string | null }>; selectionLabel: string[]; settings: any;
}) {
  const sortedDays = [...days].sort((a, b) => a.sequence - b.sequence);
  return (
    <div className="print-area overflow-hidden rounded-xl border border-slate-300 bg-white" id="print-routine">
      <div className="flex items-center gap-4 border-b-4 bg-white p-5" style={{ borderColor: settings.colors.theory }}>
        <img src={diuLogo} alt="DIU" className="h-16 w-auto shrink-0" draggable={false} />
        <div className="flex flex-1 items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-extrabold text-slate-900">{settings.universityName}</h1>
            <p className="text-sm font-semibold text-slate-600">{settings.departmentName} · Class Routine</p>
          </div>
          <div className="text-right text-xs font-medium text-slate-500">
            <p className="font-extrabold text-slate-800">{selectionLabel.join(' · ')}</p>
            <p>Generated {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
          </div>
        </div>
      </div>
      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr>
            <th className="border border-slate-300 bg-slate-100 px-2 py-1.5 text-left font-extrabold text-slate-700">Day</th>
            {slots.map((s) => (
              <th key={s.id} className="border border-slate-300 bg-slate-100 px-1 py-1.5 text-center font-bold text-slate-600">{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedDays.map((day) => {
            const off = offDayMap.get(day.id);
            return (
              <tr key={day.id}>
                <td className="border border-slate-300 bg-slate-50 px-2 py-2 align-top font-extrabold text-slate-800">{day.name}</td>
                {off ? (
                  <td colSpan={slots.length} className="border border-slate-300 bg-amber-50 px-3 py-3 text-center text-[10px] font-extrabold uppercase tracking-wide text-amber-700">
                    OFF DAY — No Classes Scheduled{off.reason ? ` (${off.reason})` : ''}
                  </td>
                ) : (
                  slots.map((slot) => {
                    const cell = entriesInSlot(entries, day.id, slot.id);
                    return (
                      <td key={slot.id} className="w-[13%] border border-slate-300 p-1 align-top">
                        {cell.slice(0, 2).map((e) => (
                          <div key={e.id} className="mb-1 rounded border-l-4 px-1.5 py-1" style={{ borderLeftColor: (e.status === 'cancelled' || e.status === 'rescheduled' ? '#cbd5e1' : undefined) }}>
                            <p className="text-[8.5px] font-extrabold uppercase">
                              {e.course?.code}{e.labGroup ? ` · ${e.labGroup.name}` : ''}
                            </p>
                            <p className="text-[9px] font-semibold leading-tight text-slate-700">{e.course?.title}</p>
                            <p className="text-[8px] text-slate-500">{e.faculty?.initials} · {e.room?.code}{e.status !== 'active' ? ` · ${STATUS_META[e.status].label.toUpperCase()}` : ''}</p>
                          </div>
                        ))}
                        {!cell.length && <span className="text-slate-300">—</span>}
                      </td>
                    );
                  })
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-300 p-3 text-[9px] font-medium text-slate-500">
        <span className="font-extrabold text-slate-700">Legend:</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: settings.colors.theory }} /> Theory</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: settings.colors.lab }} /> Laboratory</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: settings.colors.ged }} /> GED</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: settings.colors.guest }} /> Guest</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: settings.colors.agriculture }} /> Agriculture</span>
        <span>Duration: each class = 1 hour 30 minutes</span>
      </div>
      <div className="border-t border-slate-300 p-2.5 text-center text-[9px]">
        <span className="font-extrabold text-slate-700">Prepared by Md Musfiqur Rahaman</span>
        <span className="text-slate-500"> · Research &amp; Academic Affairs Secretary · Dept. of Pharmacy, DIU</span>
      </div>
    </div>
  );
}
