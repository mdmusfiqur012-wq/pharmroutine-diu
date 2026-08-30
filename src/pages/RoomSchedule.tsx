import { useMemo, useState } from 'react';
import { useData } from '../lib/data';
import { useApp } from '../lib/store';
import { buildRoomSchedule } from '../lib/routine';
import type { ClassDay, TimeSlot, JoinedEntry } from '../lib/types';
import { Badge, EmptyState, Icon, PageHeader, Select, useToast } from '../lib/ui';
import { useClassModal, ClassModalHost, MobileClassCard, MiniClassCard } from '../components/ClassCard';
import classNames from 'clsx';

export default function RoomSchedule() {
  const { db, loading } = useData();
  const { settings } = useApp();
  const toast = useToast();
  const [roomId, setRoomId] = useState('');
  const [checkDay, setCheckDay] = useState('');
  const [checkSlot, setCheckSlot] = useState('');
  const { entry, open, close } = useClassModal();

  const rooms = useMemo(() => (db ? [...db.rooms].filter((r) => r.is_active).sort((a, b) => a.code.localeCompare(b.code)) : []), [db]);
  const room = rooms.find((r) => r.id === roomId) ?? null;

  const schedule = useMemo(() => (db && room ? buildRoomSchedule(db, room.id) : null), [db, room]);

  const dayOptions: ClassDay[] = db ? [...db.classDays].filter((d) => d.is_active).sort((a, b) => a.sequence - b.sequence) : [];
  const slotOptions: TimeSlot[] = db ? [...db.timeSlots].filter((t) => t.is_active).sort((a, b) => a.sequence - b.sequence) : [];

  const availability = useMemo(() => {
    if (!db || !schedule || !checkDay || !checkSlot) return null;
    const hits: JoinedEntry[] = schedule.entries.filter((e) => e.day_id === checkDay && e.time_slot_id === checkSlot && e.status !== 'cancelled');
    return { hits, day: dayOptions.find((d) => d.id === checkDay), slot: slotOptions.find((s) => s.id === checkSlot) };
  }, [db, schedule, checkDay, checkSlot, dayOptions, slotOptions]);

  if (loading) return <div className="space-y-4">{[0, 1].map((i) => <div key={i} className="skeleton h-32" />)}</div>;
  if (!db) return <EmptyState icon="alert" title="Could not load data" />;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Room Schedule & Availability"
        subtitle="Select any room to see its full weekly schedule — or check a specific day and time slot to see whether the room is occupied or free."
      />

      <div className="card grid grid-cols-1 gap-4 p-4 sm:p-5 lg:grid-cols-3">
        <div>
          <label className="label">Room</label>
          <Select value={roomId} onChange={(v) => { if (v !== '__lab__') setRoomId(v); }} placeholder="Choose a room…" options={[
            ...rooms.filter((r) => r.room_type === 'theory').map((r) => ({ value: r.id, label: `${r.code} · ${r.name}` })),
            { value: '__lab__', label: '— Laboratories —' },
            ...rooms.filter((r) => r.room_type === 'lab').map((r) => ({ value: r.id, label: `${r.code} · ${r.name}` })),
          ] as any} />
        </div>
        <div>
          <label className="label">Check day</label>
          <Select value={checkDay} onChange={setCheckDay} placeholder="Any day" options={dayOptions.map((d) => ({ value: d.id, label: d.name }))} />
        </div>
        <div>
          <label className="label">Check time slot</label>
          <Select value={checkSlot} onChange={setCheckSlot} placeholder="Any slot" options={slotOptions.map((s) => ({ value: s.id, label: s.label }))} />
        </div>
      </div>

      {/* availability result */}
      {availability && room && (
        <div className={classNames(
          'mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3.5',
          availability.hits.length
            ? 'border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30'
            : 'border-green-200 bg-green-50 dark:border-green-900/60 dark:bg-green-950/30',
        )}>
          <div className="flex items-center gap-3">
            <span className={classNames('flex h-10 w-10 items-center justify-center rounded-xl text-white', availability.hits.length ? 'bg-red-600' : 'bg-green-600')}>
              <Icon name={availability.hits.length ? 'alert' : 'check'} />
            </span>
            <div>
              <p className={classNames('text-sm font-extrabold', availability.hits.length ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300')}>
                {availability.hits.length ? `OCCUPIED — ${room.code}` : `AVAILABLE — ${room.code} is free`}
              </p>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {availability.day?.name} · {availability.slot?.label}
                {availability.hits.length ? ` · ${availability.hits.length} session(s) in this room` : ' · no class is scheduled in this slot'}
              </p>
            </div>
          </div>
          {availability.hits.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {availability.hits.map((e) => (
                <button key={e.id} onClick={() => open(e)} className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-left text-xs shadow-sm transition-colors hover:bg-red-50 dark:border-red-900 dark:bg-slate-900 dark:hover:bg-slate-800">
                  <p className="font-extrabold text-slate-800 dark:text-slate-100">{e.course?.code} · {e.batch?.name} Sec {e.section?.name}{e.labGroup ? ` Grp ${e.labGroup.name}` : ''}</p>
                  <p className="text-slate-500">{e.faculty?.name} ({e.faculty?.initials}) · {e.course?.title}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* weekly schedule */}
      {room && schedule ? (
        <div className="mt-6">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
            <Icon name="door" className="text-brand-700 dark:text-brand-400" />
            Weekly schedule — {room.code} · {room.name}
            <Badge tone={room.room_type === 'lab' ? 'purple' : 'green'}>{room.room_type === 'lab' ? 'Laboratory' : 'Theory room'}</Badge>
            <Badge tone="slate">{room.capacity} seats</Badge>
          </div>
          {schedule.entries.length ? (
            <div className="card overflow-hidden">
              <div className="hidden overflow-x-auto md:block scroll-thin">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-800/40">
                      <th className="table-th sticky left-0 z-10 bg-slate-50 dark:bg-slate-800/90">Day</th>
                      {schedule.slots.map((s) => (
                        <th key={s.id} className="table-th px-2 py-3 text-center">{s.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.days.map((day) => (
                      <tr key={day.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/70">
                        <td className="table-td sticky left-0 z-10 bg-white font-extrabold dark:bg-slate-900">{day.name}</td>
                        {schedule.slots.map((slot) => {
                          const cell = schedule.entries.filter((e) => e.day_id === day.id && e.time_slot_id === slot.id);
                          return (
                            <td key={slot.id} className="table-td w-[14%] min-w-[150px] border-l border-slate-100 p-1 align-top dark:border-slate-800/70">
                              <div className="flex min-h-[86px] flex-col gap-1">
                                {cell.map((e) => <MiniClassCard key={e.id} entry={e} onClick={() => open(e)} />)}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-2 p-3 md:hidden">
                {schedule.days.map((day) => {
                  const cell = schedule.entries.filter((e) => e.day_id === day.id);
                  if (!cell.length) return null;
                  return (
                    <div key={day.id}>
                      <p className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-slate-400">{day.name}</p>
                      <div className="space-y-2">
                        {cell.map((e) => <MobileClassCard key={e.id} entry={e} onClick={() => open(e)} />)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <EmptyState icon="door" title="No classes scheduled in this room" hint="This room is currently free for the whole week." />
          )}
        </div>
      ) : (
        <div className="mt-6">
          <EmptyState icon="building" title="Select a room" hint="Choose a room above to view its complete weekly schedule, or use the availability checker for a specific day and time slot." />
        </div>
      )}

      <ClassModalHost entry={entry} onClose={close} />
    </div>
  );
}
