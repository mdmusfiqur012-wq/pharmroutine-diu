import { Fragment, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useData } from '../lib/data';
import { useApp } from '../lib/store';
import { AdminShell } from './common';
import { Badge, EmptyState, Icon, Modal, Select, Toggle, useToast, type IconName } from '../lib/ui';
import {
  type OfferRow, type GenConfig, type ClassLock, type RotationState, type GenResult, type GenClass,
  type ConflictIssue, type OfferType, DEFAULT_CONFIG,
} from './generator/types';
import { loadOfficialOffer, parseWorkbookFile, parsePastedText, inspectOffers, officialCatalog, officialBatchLevel } from './generator/parser';
import { generateRoutine, verifySchedule, verifyFrequency, frequencyRows, probeMove } from './generator/engine';
import { buildGenCtx, publishResult, usePersistentState, clearGeneratorStorage, buildAutoLocks, mergeLocks, ensureBatchRows, type PublishSummary } from './generator/store';
import { COMBINED_LAB, NO_LAB } from '../components/SelectionPanel';

/* ============================================================
 * Smart Routine Generator — dedicated ADMIN-ONLY module.
 * Guided workflow: Import course offer → Review → Configure
 * constraints → Generate → Review & lock → Publish.
 * Students never see this screen or its rules/conflicts.
 * ============================================================ */

const STEPS: { n: number; label: string; icon: IconName }[] = [
  { n: 1, label: 'Import Course Data', icon: 'download' },
  { n: 2, label: 'Review & Correct', icon: 'search' },
  { n: 3, label: 'Configure Rules', icon: 'settings' },
  { n: 4, label: 'Generate Routine', icon: 'zap' },
  { n: 5, label: 'Review & Lock', icon: 'layers' },
  { n: 6, label: 'Approve & Publish', icon: 'check' },
];

const PHASES = [
  'Validating course data & rules',
  'Applying batch off-days',
  'Locking fixed faculty & classroom rules',
  'Allocating theory classes',
  'Allocating laboratory sessions',
  'Checking faculty, classroom & lab conflicts',
];

const TYPE_META: Record<OfferType, { label: string; cls: string }> = {
  theory: { label: 'Theory', cls: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  lab: { label: 'Laboratory', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  ged: { label: 'GED', cls: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300' },
  prj: { label: 'PRJ', cls: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300' },
};

export default function SmartGenerator() {
  const { db, refresh } = useData();
  const toast = useToast();
  const navigate = useNavigate();
  const setSelection = useApp((s) => s.setSelection);

  const [step, setStep] = useState(1);
  const [offers, setOffers] = usePersistentState<OfferRow[]>('offers', []);
  const [config, setConfig] = usePersistentState<GenConfig>('config', DEFAULT_CONFIG);
  const [locks, setLocks] = usePersistentState<ClassLock[]>('locks', []);
  const [rotation, setRotation] = usePersistentState<RotationState>('rotation', {});
  const [result, setResult] = usePersistentState<GenResult | null>('result', null);
  const [publishedByBatch, setPublishedByBatch] = usePersistentState<Record<string, string[]>>('published', {});
  const [lastPublish, setLastPublish] = usePersistentState<string | null>('publishedAt', null);

  const [busy, setBusy] = useState(false);
  const [phaseIdx, setPhaseIdx] = useState(-1);
  const [viewBatch, setViewBatch] = useState(29);
  const [viewSec, setViewSec] = useState<'A' | 'B'>('A');
  const [editClass, setEditClass] = useState<GenClass | null>(null);
  const [publishInfo, setPublishInfo] = useState<PublishSummary | null>(null);
  const [pulse, setPulse] = useState(0);
  /** admin-defined courses (new semester / new subject) — code → catalog entry */
  const [extraCourses, setExtraCourses] = usePersistentState<Record<string, { code: string; title: string; credits: number; type: OfferType }>>('extraCourses', {});
  const [addFor, setAddFor] = useState<{ bn: number; sec: 'A' | 'B' } | null>(null);
  const [catOpen, setCatOpen] = useState(false);

  const ctx = useMemo(() => (db ? buildGenCtx(db) : null), [db]);
  const knownFaculty = useMemo(() => (db ? db.faculty.filter((f) => f.is_active).map((f) => f.initials.toUpperCase()) : []), [db]);
  const batchNos = useMemo(() => [...new Set(offers.map((o) => o.batchNo))].sort((a, b) => a - b), [offers]);
  const issues = useMemo(() => (ctx ? inspectOffers(offers, ctx, knownFaculty) : []), [offers, ctx, knownFaculty]);
  const labCourses = useMemo(() => [...new Set(offers.filter((o) => o.type === 'lab').map((o) => o.code))], [offers]);
  const allFaculty = useMemo(() => [...new Set(offers.map((o) => o.faculty).filter(Boolean))].sort(), [offers]);
  /* course catalog: live DB → official offer → admin-defined extras (extras win).
     Entering a course code snap-fills the title, which then stays locked. */
  const officialCat = useMemo(() => officialCatalog(), []);
  const catalogCodes = useMemo(() => {
    const set = new Set<string>();
    for (const c of db?.courses ?? []) set.add(c.code);
    for (const c of Object.keys(officialCat)) set.add(c);
    for (const c of Object.keys(extraCourses)) set.add(c);
    return [...set].sort();
  }, [db, officialCat, extraCourses]);
  const titleFor = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of db?.courses ?? []) if (c.code && c.title && !m.has(c.code)) m.set(c.code, c.title);
    for (const [code, c] of Object.entries(officialCat)) if (!m.has(code) && c.title) m.set(code, c.title);
    for (const [code, c] of Object.entries(extraCourses)) if (c.title) m.set(code, c.title);
    return (code: string) => m.get(code.trim()) ?? null;
  }, [db, officialCat, extraCourses]);
  const isDuplicate = (bn: number, sec: string, code: string) => offers.some((o) => o.batchNo === bn && o.section === sec && o.code.trim().toLowerCase() === code.trim().toLowerCase());
  /** batches in the offer that do not exist in the database yet → must be created before generation */
  const missingBatchNos = useMemo(() => batchNos.filter((bn) => !(ctx?.batches.some((b) => b.batchNo === bn))), [batchNos, ctx]);
  const [syncing, setSyncing] = useState(false);
  async function createMissingBatch(bn: number) {
    if (!db) return;
    setSyncing(true);
    try {
      const level = officialBatchLevel(bn) ?? 1;
      const r = await ensureBatchRows(db, bn, level);
      if (!r.ok) { toast.push('error', `Batch ${bn}: ${r.error ?? 'could not be created'}`); return; }
      await refresh();
      toast.push('success', `Batch ${bn} created with sections A/B and lab groups A1/A2/B1/B2 — it is now available in the generator and on the Batches & Groups page.`);
    } finally { setSyncing(false); }
  }
  function removeOfferRow(id: string) {
    setOffers((os) => os.filter((o) => o.id !== id));
    if (result) { setResult(null); toast.push('info', 'Row removed — the previous draft is stale, generate again.'); }
    toast.push('success', 'Course row removed.');
  }
  /* credit-based frequency: required vs scheduled, per course & section */
  const freq = useMemo(() => (ctx ? frequencyRows(ctx, offers, result?.classes ?? [], config) : []), [ctx, offers, result, config]);
  const freqOk = useMemo(() => freq.every((r) => r.ok), [freq]);
  const freqByBatch = useMemo(() => {
    const m = new Map<number, typeof freq>();
    for (const r of freq) { const arr = m.get(r.batchNo) ?? []; arr.push(r); m.set(r.batchNo, arr); }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [freq]);

  const patchOffer = (id: string, patch: Partial<OfferRow>) => setOffers((os) => os.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  const patchConfig = (patch: Partial<GenConfig>) => setConfig((c) => ({ ...c, ...patch }));

  /* ---------------- manual entry ---------------- */
  function addManualRow(batchNo: number, section: 'A' | 'B', code: string, title: string, credits: number, type: OfferType, faculty: string) {
    const id = `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const row: OfferRow = { id, batchNo, section, code: code.trim(), title: title.trim(), credits, type, faculty, facultyRaw: faculty, issues: [], source: 'manual' };
    setOffers((prev) => [...prev, row]);
  }
  function saveExtraCourse(c: { code: string; title: string; credits: number; type: OfferType }) {
    setExtraCourses((prev) => ({ ...prev, [c.code.trim()]: { ...c, code: c.code.trim(), title: c.title.trim() } }));
  }

  /* ---------------- import ---------------- */
  const fileRef = useRef<HTMLInputElement>(null);
  async function onFile(f: File | null) {
    if (!f) return;
    setBusy(true);
    try {
      const { offers: rows, errors } = await parseWorkbookFile(f);
      if (!rows.length) { toast.push('error', errors[0] ?? 'No recognizable rows — use columns: Batch, Section, Course Code, Title, Credits, Type, Faculty.'); return; }
      setOffers((prev) => [...prev.filter((o) => o.source !== 'xlsx'), ...rows]);
      toast.push('success', `Imported ${rows.length} course rows from ${f.name}.`);
      setStep(2);
    } catch (e: any) {
      toast.push('error', 'Import failed: ' + (e?.message ?? 'unknown error'));
    } finally { setBusy(false); }
  }
  function loadOfficial() {
    const b = loadOfficialOffer();
    setOffers(b.offers);
    setConfig((c) => ({ ...c, facultyOff: { ...b.facultyOff, ...c.facultyOff } }));
    toast.push('success', `Loaded the official Fall 2026 course offer — ${b.offers.length} rows (${batchNos.length || 8} batches, sections A/B).`);
    setStep(2);
  }
  function onPaste(text: string) {
    const { offers: rows, errors } = parsePastedText(text);
    if (!rows.length) { toast.push('error', errors[0] ?? 'Nothing recognized — paste the batch × faculty matrix or a full column table.'); return; }
    setOffers((prev) => [...prev.filter((o) => o.source !== 'paste'), ...rows]);
    toast.push('success', `Parsed ${rows.length} rows from pasted text.`);
    setStep(2);
  }

  /* ---------------- generate ---------------- */
  async function onGenerate() {
    if (!ctx || !db) { toast.push('error', 'Data source not ready.'); return; }
    if (!offers.length) { toast.push('error', 'Import the course offer first.'); return; }
    if (issues.some((i) => i.kind === 'missing-title' || i.kind === 'no-faculty')) {
      toast.push('error', 'Unresolved data (missing titles / faculty) — fix in Review before generating.');
      setStep(2); return;
    }
    if (missingBatchNos.length) {
      toast.push('error', `Batch ${missingBatchNos.join(', ')} exists in the offer but not in the database — create it in Review first (one click).`);
      setStep(2); return;
    }
    setBusy(true); setPhaseIdx(0); setPulse((p) => p + 1);
    try {
      /* locked faculty (MUA) are pulled from the CURRENT published routine and
         pinned first — the generator can never change or reassign them. */
      const auto = buildAutoLocks(db, offers, config);
      const allLocks = mergeLocks(auto, locks);
      if (auto.length) toast.push('info', `Auto-locked ${auto.length} class(es) of locked faculty (${config.lockedFaculty.join(', ')}) from the current routine.`);
      const res = await generateRoutine(ctx, offers, config, allLocks, rotation, {
        phaseDelay: 260,
        onPhase: (p) => setPhaseIdx(Math.max(0, PHASES.indexOf(p))),
      });
      setResult(res);
      setRotation(res.rotation);
      toast.push(res.report.ok ? 'success' : 'error',
        res.report.ok ? `Generated ${res.stats.theory} theory + ${res.stats.labs} lab sessions — no conflicts.` : `Generated with ${res.report.failed} blocked item(s) — see Conflict Report.`);
      setStep(5);
    } catch (e: any) {
      toast.push('error', 'Generation failed: ' + (e?.message ?? 'unknown'));
    } finally { setBusy(false); }
  }

  /* ---------------- manual override & locking ---------------- */
  function applyEdit(updated: GenClass, lock: boolean) {
    if (!result) return;
    const classes = result.classes.map((c) => (c.uid === updated.uid ? { ...c, ...updated, locked: lock } : c));
    const issues = [...verifySchedule(ctx!, classes, config, offers), ...verifyFrequency(ctx!, offers, classes, config)];
    const report = { issues, scheduled: classes.length, failed: issues.filter((i) => i.severity === 'error').length, ok: !issues.some((i) => i.severity === 'error') };
    setResult({ ...result, classes, report, stats: result.stats });
    const lab = classes.filter((c) => c.uid === updated.uid && c.groupId);
    if (lab.length === 1) {
      // twin group row of a lab session — keep partner in sync (same day/slot; lock too)
      const twin = classes.find((c) => c.uid === updated.labPartnerUid);
      if (twin) setResult((r) => r ? { ...r, classes: r.classes.map((c) => c.uid === twin.uid ? { ...c, dayId: updated.dayId, slotId: updated.slotId, locked: lock } : c) } : r);
    }
    setLocks((ls) => {
      const rest = ls.filter((l) => l.uid !== updated.uid);
      if (!lock) return rest;
      const unitUid = updated.uid.split(':')[0] + (updated.groupId ? '-lab' : (updated.uid.split('-s').length > 1 ? '' : ''));
      return [...rest, {
        uid: unitUid || updated.uid, dayId: updated.dayId, slotId: updated.slotId,
        roomId: updated.groupId ? undefined : updated.roomId,
        label: `${updated.code} · ${updated.batchNo}${updated.section}`,
      }];
    });
  }

  /* ---------------- publish ---------------- */
  const [pubBatches, setPubBatches] = useState<number[]>([]);
  const [pubReplace, setPubReplace] = useState(false);
  const [pubOff, setPubOff] = useState(true);
  async function onPublish() {
    if (!ctx || !result) return;
    const batches = pubBatches.length ? pubBatches : batchNos;
    setBusy(true);
    try {
      const s = await publishResult(db!, ctx, result, offers, config, { batches, replaceExisting: pubReplace, syncOffDays: pubOff });
      setPublishInfo(s); setPublishedByBatch((p) => ({ ...p, ...s.publishedByBatch }));
      setLastPublish(new Date().toISOString());
      toast.push(s.ok ? 'success' : 'error', s.ok
        ? `Published ${s.created} class rows for ${batches.length} batch(es). Students can see the routine now.`
        : `Published with ${s.errors.length} problem(s) — see report.`);
    } catch (e: any) {
      toast.push('error', 'Publish failed: ' + (e?.message ?? 'unknown'));
    } finally { setBusy(false); }
  }

  function openStudentView(bn: number, sec: 'A' | 'B') {
    if (!db) return;
    const batch = db.batches.find((b) => b.batch_no === bn);
    const section = db.sections.find((s) => s.batch_id === batch?.id && s.name === sec);
    if (batch && section) {
      setSelection({ semester_id: ctx!.semesterId, batch_id: batch.id, section_id: section.id, lab_group_id: NO_LAB });
      navigate('/routine');
    }
  }

  if (!db) return <AdminShell><EmptyState icon="alert" title="Loading data…" /></AdminShell>;

  return (
    <AdminShell>
      {/* header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="grad-icon-tile flex h-10 w-10 items-center justify-center rounded-xl">
              <Icon name="zap" className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white">Smart Routine Generator</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Import the departmental course offer → configure rules → generate an optimized, conflict-free weekly routine. Admin only.</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {lastPublish && (
            <span className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
              <Icon name="check" className="h-3.5 w-3.5" /> Last published {new Date(lastPublish).toLocaleString()}
            </span>
          )}
          <button className="btn-secondary !py-1.5 text-xs" onClick={() => { clearGeneratorStorage(); setOffers([]); setConfig(DEFAULT_CONFIG); setLocks([]); setRotation({}); setResult(null); setPublishedByBatch({}); setPublishInfo(null); setExtraCourses({}); setStep(1); toast.push('info', 'Generator workspace cleared.'); }}>
            <Icon name="refresh" className="h-3.5 w-3.5" /> Reset workspace
          </button>
        </div>
      </div>

      {/* step nav */}
      <div className="mb-6 flex flex-wrap items-center gap-1.5">
        {STEPS.map((s, i) => (
          <button key={s.n} onClick={() => setStep(s.n)} className={clsx(
            'inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-extrabold transition-all',
            step === s.n ? 'text-white shadow-glow-blue' : 'glass text-slate-500 hover:text-brand-700 dark:text-slate-400',
          )} style={step === s.n ? { backgroundImage: 'var(--grad-diu)' } : undefined}>
            <span className={clsx('flex h-4 w-4 items-center justify-center rounded-full text-[9px]', step === s.n ? 'bg-white/25' : 'bg-slate-200 dark:bg-slate-700')}>{s.n}</span>
            <Icon name={s.icon} className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{s.label}</span>
          </button>
        ))}
      </div>

      {/* ================= STEP 1 · ENTER COURSE DATA ================= */}
      {step === 1 && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
          {/* primary: manual entry */}
          <div className="card p-6 xl:col-span-3">
            <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">① Add course data manually</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Type each course yourself — batch · section · course code · credits · type · faculty.
              Enter a <b>course code</b> and the title fills in automatically from the catalog (and stays locked);
              brand-new courses (new semester) can be saved to the catalog right here.
            </p>
            <ManualEntry
              className="mt-4"
              batches={ctx?.batches ?? []}
              knownFaculty={knownFaculty}
              titleFor={titleFor}
              catalogCodes={catalogCodes}
              isDuplicate={isDuplicate}
              onAdd={addManualRow}
              onSaveCourse={saveExtraCourse}
            />
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              <Icon name="info" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-500" />
              <span><b className="text-slate-600 dark:text-slate-300">Note:</b> Project · Industrial Training · Oral Assessment (PRJ) need no faculty —
              they are supervised by the department coordinator and appear in the routine as one guided session per week.
              Laboratory courses automatically split into paired groups A1/A2 (or B1/B2).
              New batch (e.g. Batch 39)? <Link to="/admin/batches" className="font-extrabold text-brand-600 underline-offset-2 hover:underline dark:text-brand-400">Add it in Batches &amp; Groups</Link> —
              or import the offer and the generator will offer to create any missing batch in Review.</span>
            </div>
          </div>

          {/* secondary: bulk import */}
          <div className="space-y-4 xl:col-span-2">
            <div className="card p-5">
              <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">② Or load everything at once</h3>
              <div className="mt-3 space-y-2.5">
                <button className="btn-primary w-full" onClick={loadOfficial} disabled={busy}>
                  <Icon name="calendar" className="h-4 w-4" /> Load official Fall 2026 course offer (bundled)
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex w-full flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed border-brand-300/70 bg-brand-50/50 px-4 py-6 text-center transition-all hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-glass-hover dark:border-brand-700 dark:bg-brand-950/30"
                >
                  <span className="grad-icon-tile flex h-10 w-10 items-center justify-center rounded-xl"><Icon name="download" className="h-4 w-4" /></span>
                  <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100">Upload Excel / CSV offer</span>
                  <span className="text-[10px] text-slate-500">.xlsx · .xls · .csv — Batch, Section, Code, Title, Credits, Type, Faculty</span>
                </button>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { void onFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
                <PasteBox onPaste={onPaste} busy={busy} />
              </div>
            </div>

            {offers.length > 0 && (
              <div className="card flex items-center gap-4 p-5">
                <span className="grad-icon-tile flex h-11 w-11 items-center justify-center rounded-xl"><Icon name="check" className="h-5 w-5" /></span>
                <div className="flex-1">
                  <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{offers.length} course rows · {batchNos.length} batches · {new Set(offers.map((o) => o.code)).size} courses</p>
                  <p className="text-xs text-slate-500">{offers.filter((o) => o.type === 'lab').length} practicals → paired lab groups (A1/A2 · B1/B2) · {offers.filter((o) => o.type === 'prj').length} PRJ sessions with coordinator.</p>
                </div>
                <button className="btn-primary" onClick={() => setStep(2)}>Review <Icon name="chevronRight" className="h-4 w-4" /></button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= STEP 2 · REVIEW ================= */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              <button className={clsx('chip px-3 py-1.5 !text-xs', issues.length ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300')}>
                <Icon name={issues.length ? 'alert' : 'check'} className="h-3.5 w-3.5" /> {issues.length ? `${issues.length} item(s) need attention` : 'All course data resolved'}
              </button>
              <button className="btn-secondary !py-1 !px-2.5 text-xs" onClick={() => setCatOpen(true)}><Icon name="plus" className="h-3.5 w-3.5" /> New course (catalog)</button>
              <button className="btn-secondary !py-1 !px-2.5 text-xs" onClick={() => { const bn = batchNos[0] ?? (ctx?.batches[0]?.batchNo ?? 29); setAddFor({ bn, sec: 'A' }); }}><Icon name="plus" className="h-3.5 w-3.5" /> Add row</button>
              <button className="btn-secondary !py-1 !px-2.5 text-xs" onClick={() => setStep(3)}>Continue → Configure rules</button>
            </div>
            <p className="text-[11px] font-semibold text-slate-400">Missing info is never invented — fix it here or flag it to the department.</p>
          </div>

          {missingBatchNos.length > 0 && (
            <div className="card border-amber-200/70 p-4">
              <p className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-amber-700 dark:text-amber-400"><Icon name="alert" className="h-4 w-4" /> Batches missing from the database</p>
              <p className="mb-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                The offer contains batch(es) that don't exist on the <b>Batches &amp; Groups</b> page yet — they must be created before generation.
                One click creates the batch with sections A/B and lab groups A1/A2/B1/B2 (level from the official term; off-day set later in Rules or Batch Off Days).
              </p>
              <div className="flex flex-wrap gap-2">
                {missingBatchNos.map((bn) => (
                  <button key={bn} className="btn-primary !px-3.5 !py-2 text-xs" disabled={syncing} onClick={() => void createMissingBatch(bn)}>
                    <Icon name="plus" className="h-3.5 w-3.5" /> Create Batch {bn} (of {batchNos.length})
                  </button>
                ))}
                <Link to="/admin/batches" className="btn-secondary !px-3.5 !py-2 text-xs"><Icon name="award" className="h-3.5 w-3.5" /> Open Batches &amp; Groups</Link>
              </div>
            </div>
          )}

          {issues.length > 0 && (
            <div className="card border-amber-200/70 p-4">
              <p className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-amber-700 dark:text-amber-400"><Icon name="alert" className="h-4 w-4" /> Data attention list</p>
              <div className="space-y-1.5">
                {issues.slice(0, 12).map((i, k) => (
                  <p key={k} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />{i.message}
                  </p>
                ))}
                {issues.length > 12 && <p className="text-xs text-slate-400">+{issues.length - 12} more…</p>}
              </div>
            </div>
          )}

          {batchNos.map((bn) => (
            <BatchReviewTable key={bn} batchNo={bn} offers={offers.filter((o) => o.batchNo === bn)} knownFaculty={knownFaculty} patch={patchOffer} titleFor={titleFor} remove={removeOfferRow} onAddRow={(sec) => setAddFor({ bn, sec })} />
          ))}

          <div className="card flex flex-wrap items-center gap-x-3 gap-y-2 p-4 text-xs text-slate-500">
            <span className="flex items-center gap-2"><Icon name="flask" className="h-4 w-4 text-emerald-600" /><b className="text-slate-700 dark:text-slate-200">{labCourses.length}</b>&nbsp;practical courses → paired lab groups with A1/A2 · B1/B2 rotation</span>
            <span className="flex items-center gap-2"><Icon name="check" className="h-4 w-4 text-violet-600" /><b className="text-slate-700 dark:text-slate-200">{offers.filter((o) => o.type === 'prj').length}</b>&nbsp;PRJ sessions (Project / Industrial Training / Oral Assessment) → department coordinator</span>
            <span className="flex items-center gap-2 text-[10px] text-slate-400">Code entered ⇒ title auto-filled &amp; locked from the catalog · unknown codes stay editable and can be saved as new courses.</span>
          </div>
        </div>
      )}

      {/* ================= STEP 3 · RULES ================= */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* off days */}
            <section className="card p-5">
              <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-800 dark:text-slate-100"><span className="grad-icon-tile flex h-7 w-7 items-center justify-center rounded-lg"><Icon name="clock" className="h-3.5 w-3.5" /></span> Batch-specific weekly off day</h3>
              <p className="mb-3 mt-1 text-[11px] text-slate-400">Each batch has its own off day. Nothing is ever scheduled for a batch on its off day (override = change it here).</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {batchNos.map((bn) => (
                  <label key={bn} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-white/60 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/40">
                    <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200">Batch {bn}</span>
                    <select className="input !w-40 !py-1.5 text-xs" value={config.offDays[String(bn)] ?? ''} onChange={(e) => patchConfig({ offDays: { ...config.offDays, [String(bn)]: e.target.value } })}>
                      <option value="">— no off day —</option>
                      {ctx!.days.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </section>

            {/* faculty off days */}
            <section className="card p-5">
              <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-800 dark:text-slate-100"><span className="grad-icon-tile flex h-7 w-7 items-center justify-center rounded-lg"><Icon name="users" className="h-3.5 w-3.5" /></span> Faculty off days</h3>
              <p className="mb-3 mt-1 text-[11px] text-slate-400">Pre-filled from the official offer (Faculty Day Off). A faculty never teaches on their off day.</p>
              <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1 scroll-thin">
                {allFaculty.map((init) => {
                  const off = config.facultyOff[init] ?? [];
                  return (
                    <div key={init} className="flex flex-wrap items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <span className="w-10 text-[11px] font-extrabold text-slate-600 dark:text-slate-300">{init}</span>
                      {ctx!.days.map((d) => {
                        const on = off.some((x) => x.toLowerCase() === d.name.toLowerCase());
                        return (
                          <button key={d.id} onClick={() => patchConfig({ facultyOff: { ...config.facultyOff, [init]: on ? off.filter((x) => x.toLowerCase() !== d.name.toLowerCase()) : [...off, d.name] } })}
                            className={clsx('rounded-md px-1.5 py-0.5 text-[9px] font-bold transition-all', on ? 'bg-rose-100 text-rose-700 ring-1 ring-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-800' : 'bg-slate-100 text-slate-400 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-500')}>
                            {d.short}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* fixed rules */}
            <section className="card p-5">
              <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-800 dark:text-slate-100"><span className="grad-icon-tile flex h-7 w-7 items-center justify-center rounded-lg"><Icon name="shield" className="h-3.5 w-3.5" /></span> Hard faculty &amp; classroom rules</h3>
              <p className="mb-3 mt-1 text-[11px] text-slate-400">MUA is never altered or reassigned. DSS theory → AB-1 104. MSH theory → AB-1 406. Enforced by the engine.</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-xl border border-brand-100 bg-brand-50/60 px-3 py-2 dark:border-brand-900 dark:bg-brand-950/30">
                  <Icon name="shield" className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                  <span className="flex-1 text-xs font-bold text-slate-700 dark:text-slate-200">Locked faculty (never reassigned)</span>
                  {allFaculty.map((f) => (
                    <button key={f} onClick={() => patchConfig({ lockedFaculty: config.lockedFaculty.includes(f) ? config.lockedFaculty.filter((x) => x !== f) : [...config.lockedFaculty, f] })}
                      className={clsx('rounded-lg px-2 py-1 text-[10px] font-extrabold transition-all', config.lockedFaculty.includes(f) ? 'grad-pill text-white shadow-glow-blue' : 'bg-slate-100 text-slate-500 dark:bg-slate-800')}>
                      {f}
                    </button>
                  ))}
                </div>
                {Object.entries(config.fixedRooms).map(([init, code]) => (
                  <div key={init} className="flex items-center gap-2">
                    <span className="w-14 text-xs font-extrabold text-slate-600 dark:text-slate-300">{init}</span>
                    <span className="text-[10px] text-slate-400">theory →</span>
                    <Select className="flex-1" value={code} onChange={(v) => patchConfig({ fixedRooms: { ...config.fixedRooms, [init]: v } })} options={ctx!.rooms.filter((r) => r.type !== 'lab').map((r) => ({ value: r.code, label: r.code }))} />
                    <button className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950" onClick={() => { const n = { ...config.fixedRooms }; delete n[init]; patchConfig({ fixedRooms: n }); }}><Icon name="trash" className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
                <AddFixedRoom config={config} patch={patchConfig} rooms={ctx!.rooms.filter((r) => r.type !== 'lab').map((r) => r.code)} faculty={allFaculty} />
              </div>
            </section>

            {/* room pools */}
            <section className="card p-5">
              <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-800 dark:text-slate-100"><span className="grad-icon-tile flex h-7 w-7 items-center justify-center rounded-lg"><Icon name="door" className="h-3.5 w-3.5" /></span> Classroom &amp; laboratory pools</h3>
              <p className="mb-3 mt-1 text-[11px] text-slate-400">Rooms the generator may use. Fixed-rule rooms stay reserved automatically; a room can never hold two classes at once.</p>
              <div className="space-y-3">
                <div>
                  <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Theory classrooms</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ctx!.rooms.filter((r) => r.type !== 'lab').map((r) => (
                      <RoomToggle key={r.id} code={r.code} on={config.theoryRooms.includes(r.code)} onToggle={() => patchConfig({ theoryRooms: config.theoryRooms.includes(r.code) ? config.theoryRooms.filter((c) => c !== r.code) : [...config.theoryRooms, r.code] })} disabled={Object.values(config.fixedRooms).includes(r.code)} />
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Laboratories</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ctx!.rooms.filter((r) => r.type === 'lab').map((r) => (
                      <RoomToggle key={r.id} code={r.code} on={config.labRooms.includes(r.code)} onToggle={() => patchConfig({ labRooms: config.labRooms.includes(r.code) ? config.labRooms.filter((c) => c !== r.code) : [...config.labRooms, r.code] })} tone="green" />
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Session count per week (per course credits)</p>
                  <div className="flex flex-wrap gap-2">
                    {([3, 2, 1] as const).map((c) => (
                      <label key={c} className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {c} cr
                        <button className="h-6 w-6 rounded-md bg-white text-slate-500 shadow-sm dark:bg-slate-700" onClick={() => patchConfig({ sessions: { ...config.sessions, [c]: Math.max(1, config.sessions[c] - 1) } })}>−</button>
                        <span className="w-4 text-center font-extrabold text-brand-700 dark:text-brand-400">{config.sessions[c]}</span>
                        <button className="h-6 w-6 rounded-md bg-white text-slate-500 shadow-sm dark:bg-slate-700" onClick={() => patchConfig({ sessions: { ...config.sessions, [c]: Math.min(4, config.sessions[c] + 1) } })}>+</button>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* lab rooms per course */}
          {labCourses.length > 0 && (
            <section className="card p-5">
              <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-800 dark:text-slate-100"><span className="grad-icon-tile flex h-7 w-7 items-center justify-center rounded-lg"><Icon name="flask" className="h-3.5 w-3.5" /></span> Laboratory rooms per practical course</h3>
              <p className="mb-3 mt-1 text-[11px] text-slate-400">Courses needing specific lab facilities can be restricted; otherwise all laboratories are allowed. Paired groups always get different rooms and swap each session.</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {labCourses.map((code) => {
                  const cur = config.labRoomsByCourse[code];
                  const on = cur?.length ? cur : config.labRooms;
                  return (
                    <div key={code} className="rounded-xl border border-slate-100 bg-white/60 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                      <p className="mb-1.5 text-[11px] font-extrabold text-slate-700 dark:text-slate-200">{code}</p>
                      <div className="flex flex-wrap gap-1">
                        {ctx!.rooms.filter((r) => r.type === 'lab').map((r) => (
                          <RoomToggle key={r.id} code={r.code} on={on.includes(r.code)} tone="green" small
                            onToggle={() => {
                              const list = on.includes(r.code) ? on.filter((c) => c !== r.code) : [...on, r.code];
                              patchConfig({ labRoomsByCourse: { ...config.labRoomsByCourse, [code]: list } });
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Icon name="info" className="h-4 w-4" />
              Conflicts are impossible with these rules — the engine verifies faculty, batch, classroom &amp; lab availability on every placement.
            </div>
            <button className="btn-primary !px-6" onClick={() => setStep(4)} disabled={!offers.length}>
              Continue → <Icon name="zap" className="h-4 w-4" /> Generate Routine
            </button>
          </div>
        </div>
      )}

      {/* ================= STEP 4 · GENERATE ================= */}
      {step === 4 && (
        <div className="card relative overflow-hidden p-8">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-brand-400/15 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-16 h-64 w-64 rounded-full bg-emerald-400/15 blur-3xl" />
          <div className="relative mx-auto max-w-xl">
            <div className="grad-icon-tile mx-auto flex h-16 w-16 items-center justify-center rounded-3xl animate-float">
              <Icon name="zap" className="h-7 w-7" />
            </div>
            <h3 className="mt-4 text-center text-lg font-extrabold text-slate-900 dark:text-white">Constraint-based routine generation</h3>
            <p className="mt-1 text-center text-xs text-slate-500">
              {offers.length} course rows · {batchNos.length} batches · {labCourses.length} practical courses — every placement is checked against hard rules first, balance second.
            </p>
            <div className="mt-5 space-y-2">
              {PHASES.map((p, i) => (
                <div key={p} className={clsx('flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm transition-all duration-300', i < phaseIdx ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/30' : i === phaseIdx ? 'border-brand-300 bg-brand-50/80 shadow-glow-blue dark:border-brand-800 dark:bg-brand-950/40' : 'border-slate-100 bg-white/50 dark:border-slate-800 dark:bg-slate-900/40')}>
                  <span className={clsx('flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-extrabold text-white', i < phaseIdx ? 'bg-emerald-500' : i === phaseIdx ? 'grad-pill' : 'bg-slate-300 dark:bg-slate-700')}>
                    {i < phaseIdx ? <Icon name="check" className="h-3 w-3" /> : i === phaseIdx ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" /> : i + 1}
                  </span>
                  <span className={clsx('text-xs font-bold', i <= phaseIdx ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400')}>{p}</span>
                  {i < phaseIdx && <span className="ml-auto text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400">done</span>}
                </div>
              ))}
            </div>
            <button className="btn-primary mt-6 w-full !py-3" onClick={onGenerate} disabled={busy}>
              {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Icon name="zap" className="h-4 w-4" />}
              {busy ? 'Generating…' : result ? 'Regenerate (keeps locked classes)' : 'Generate Routine'}
            </button>
            <p className="mt-2 text-center text-[10px] text-slate-400">
              Locked classes stay fixed · manual overrides re-validate instantly · impossible situations produce a Conflict Report instead of a broken schedule.
            </p>
          </div>
        </div>
      )}

      {/* ================= STEP 5 · RESULT ================= */}
      {step === 5 && result && ctx && (
        <div className="space-y-4">
          {/* stats */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <MiniStat label="Theory / GED" value={result.stats.theory + result.stats.prj} icon="book" tone="blue" />
            <MiniStat label="Lab group rows" value={result.stats.labs} icon="flask" tone="green" />
            <MiniStat label="Faculty used" value={result.stats.facultyUsed} icon="users" tone="purple" />
            <MiniStat label="Rooms used" value={result.stats.roomsUsed} icon="door" tone="amber" />
            <MiniStat label="Conflict-free" value={result.report.ok ? '✓' : '!'} icon={result.report.ok ? 'check' : 'alert'} tone={result.report.ok ? 'green' : 'red'} />
          </div>

          {/* credit-based frequency validation */}
          <div className="card p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="grad-icon-tile flex h-8 w-8 items-center justify-center rounded-xl"><Icon name="list" className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">Credit-based weekly frequency — required vs scheduled</h3>
                <p className="text-[10px] text-slate-400">Derived automatically from the course offer: 3-credit theory = 2 classes/week · 2-credit theory = 1 class/week · 1-credit GED/PRJ = 1 class/week · practicals = one paired laboratory session (A1/A2 · B1/B2), each group in its own lab.</p>
              </div>
              <span className={clsx('rounded-full px-3 py-1 text-[11px] font-extrabold', freqOk ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300')}>
                {freq.filter((r) => r.ok).length}/{freq.length} courses ✓
              </span>
            </div>
            <div className="max-h-72 overflow-auto scroll-thin rounded-xl border border-slate-100 dark:border-slate-800">
              <table className="w-full min-w-[680px] text-left text-[11px]">
                <thead className="sticky top-0 z-10 bg-slate-50/95 text-[9px] uppercase tracking-wider text-slate-400 backdrop-blur dark:bg-slate-900/95">
                  <tr>
                    <th className="px-3 py-2">Course</th>
                    <th className="px-3 py-2">Sec</th>
                    <th className="px-3 py-2">Credit &amp; type</th>
                    <th className="px-3 py-2">Required</th>
                    <th className="px-3 py-2">Scheduled</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {freqByBatch.map(([bn, rows]) => (
                    <Fragment key={bn}>
                      <tr className="bg-brand-50/60 dark:bg-brand-950/20">
                        <td colSpan={6} className="px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-brand-700 dark:text-brand-300">Batch {bn}</td>
                      </tr>
                      {rows.map((r, i) => (
                        <tr key={i} className={clsx(!r.ok && 'bg-red-50/40 dark:bg-red-950/20')}>
                          <td className="px-3 py-1.5">
                            <span className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-200">{r.code}</span>
                            <span className="ml-2 hidden text-slate-400 lg:inline">{r.title && r.title.length > 42 ? r.title.slice(0, 42) + '…' : r.title}</span>
                          </td>
                          <td className="px-3 py-1.5 font-bold text-slate-500 dark:text-slate-400">{r.batchNo}{r.section}</td>
                          <td className="px-3 py-1.5">
                            <span className="mr-1 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-extrabold text-slate-500 dark:bg-slate-800 dark:text-slate-300">{r.credits} cr</span>
                            <span className={clsx('rounded px-1.5 py-0.5 text-[9px] font-extrabold', TYPE_META[r.type].cls)}>{TYPE_META[r.type].label}</span>
                          </td>
                          <td className="px-3 py-1.5 font-bold text-slate-600 dark:text-slate-300">{r.type === 'lab' ? (r.groups.map((g) => g.name).join(' + ') || 'paired groups') : `${r.required} class${r.required === 1 ? '' : 'es'}/week`}</td>
                          <td className="px-3 py-1.5 font-bold text-slate-600 dark:text-slate-300">{r.type === 'lab' ? (r.groups.filter((g) => g.scheduled).map((g) => g.name).join(' + ') || 'none') : `${r.scheduled} class${r.scheduled === 1 ? '' : 'es'}/week`}</td>
                          <td className="px-3 py-1.5">
                            {r.type === 'lab' ? (
                              <span className="flex flex-wrap gap-1">
                                {r.groups.map((g) => (
                                  <span key={g.name} title={`${g.name}${g.roomCode ? ` · ${g.roomCode}` : ''}${g.scheduled ? '' : ' — not scheduled'}`}
                                    className={clsx('inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-extrabold', g.scheduled ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300')}>
                                    {g.name}{' '}{g.scheduled ? '✓' : '✗'}
                                  </span>
                                ))}
                              </span>
                            ) : (
                              <span className={clsx('rounded px-1.5 py-0.5 text-[9px] font-extrabold', r.ok ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300')}>
                                {r.ok ? '✓ matches requirement' : `✗ ${r.required - r.scheduled} session(s) short`}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* conflict report */}
          {result.report.issues.length > 0 && (
            <div className={clsx('card p-5', result.report.ok ? '' : 'border-red-200/70 dark:border-red-900/60')}>
              <div className={clsx('mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide', result.report.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                <Icon name={result.report.ok ? 'check' : 'alert'} className="h-4 w-4" />
                {result.report.ok ? 'Conflict check — clean' : `Conflict Report — ${result.report.failed} blocking issue(s)`}
              </div>
              <div className="space-y-1.5">
                {result.report.issues.map((i, k) => (
                  <p key={k} className={clsx('flex items-start gap-2 text-xs', i.severity === 'error' ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-400')}>
                    <span className={clsx('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', i.severity === 'error' ? 'bg-red-500' : 'bg-amber-400')} />
                    {i.message}
                  </p>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <span className="text-slate-400">Suggestions:</span>
                <button className="btn-secondary !px-2.5 !py-1 text-[10px]" onClick={() => setStep(3)}>Adjust batch off-days / lab rooms</button>
                <button className="btn-secondary !px-2.5 !py-1 text-[10px]" onClick={() => setStep(4)}>Regenerate</button>
                <button className="btn-secondary !px-2.5 !py-1 text-[10px]" onClick={() => { void navigator.clipboard.writeText(result.report.issues.map((i) => i.message).join('\n')); toast.push('success', 'Report copied.'); }}>Copy report</button>
              </div>
            </div>
          )}

          {/* batch/section selector */}
          <div className="flex flex-wrap items-center gap-2">
            <Select className="!w-36" value={String(viewBatch)} onChange={(v) => setViewBatch(Number(v))} options={batchNos.map((b) => ({ value: String(b), label: `Batch ${b}` }))} />
            <SegSec value={viewSec} onChange={setViewSec} />
            <div className="ml-auto flex items-center gap-2">
              <span className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold text-slate-500 dark:text-slate-300">
                <span className="h-2.5 w-2.5 rounded-full bg-brand-500" /> Theory <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Lab <span className="h-2.5 w-2.5 rounded-full bg-violet-400" /> PRJ
              </span>
              <button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => setStep(4)}><Icon name="refresh" className="h-3.5 w-3.5" /> Regenerate</button>
              <button className="btn-primary !px-3 !py-1.5 text-xs" onClick={() => setStep(6)}><Icon name="check" className="h-3.5 w-3.5" /> Publish…</button>
            </div>
          </div>

          {/* grid — day rows × slot columns */}
          <div className="card overflow-hidden !rounded-2xl">
            <div className="overflow-x-auto scroll-thin">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-gradient-to-r from-brand-50/90 via-white/70 to-emerald-50/90 dark:border-slate-800 dark:from-brand-950/60 dark:via-slate-900/50 dark:to-emerald-950/60">
                    <th className="table-th sticky left-0 z-10 w-24 bg-white/90 px-3 py-3 dark:bg-slate-900/90">Day</th>
                    {ctx.slots.map((s) => <th key={s.id} className="table-th px-2 py-3 text-center">{s.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {ctx.days.map((day) => {
                    const off = config.offDays[String(viewBatch)] === day.id;
                    return (
                      <tr key={day.id} className={clsx('border-b border-slate-100/80 last:border-0 dark:border-slate-800/70', off && 'bg-amber-50/50 dark:bg-amber-950/20')}>
                        <td className="table-td sticky left-0 z-10 bg-white/95 px-3 align-top backdrop-blur dark:bg-slate-900/95">
                          <span className="block text-xs font-extrabold text-slate-700 dark:text-slate-200">{day.name}</span>
                          {off && <span className="chip mt-1 bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">OFF</span>}
                        </td>
                        {ctx.slots.map((slot) => {
                          const cells = result.classes.filter((c) => c.batchNo === viewBatch && c.section === viewSec && c.dayId === day.id && c.slotId === slot.id);
                          return (
                            <td key={slot.id} className="table-td w-[13%] min-w-[150px] border-l border-slate-100/90 p-1 align-top dark:border-slate-800/70">
                              <div className="flex min-h-[96px] flex-col gap-1">
                                {off ? null : cells.map((c) => <ResultCard key={c.uid} c={c} onEdit={() => setEditClass(c)} />)}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-center text-[11px] text-slate-400">
            Click any card to move / relock it · locked classes (padlock) survive regeneration · {locks.length} active lock(s)
            <button className="ml-2 font-bold text-red-500 hover:underline" onClick={() => { setLocks([]); toast.push('info', 'All locks released.'); }}>release all</button>
          </p>
        </div>
      )}

      {/* ================= STEP 6 · PUBLISH ================= */}
      {step === 6 && result && (
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="card p-6">
            <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-800 dark:text-slate-100"><span className="grad-icon-tile flex h-8 w-8 items-center justify-center rounded-xl"><Icon name="check" className="h-4 w-4" /></span> Approve &amp; publish the generated routine</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Publishing writes the approved classes into the public timetable (same tables students read). Off-days sync to the batch off-day table. Courses/faculty that don't exist yet are created — never guessed.
            </p>
            <div className="mt-4">
              <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Publish batches</p>
              <div className="flex flex-wrap gap-1.5">
                {batchNos.map((bn) => (
                  <button key={bn} onClick={() => setPubBatches((b) => b.includes(bn) ? b.filter((x) => x !== bn) : [...b, bn])}
                    className={clsx('chip !px-3 !py-1.5', pubBatches.includes(bn) || !pubBatches.length ? 'grad-pill text-white shadow-glow-blue' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400')}>
                    Batch {bn}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-slate-400">No selection = all {batchNos.length} batches. Published batches are remembered; re-publishing replaces only your generator's previous entries.</p>
            </div>
            <div className="mt-4 space-y-2.5">
              <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white/60 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/40">
                <div>
                  <p className="text-xs font-extrabold text-slate-700 dark:text-slate-200">Sync batch off-days</p>
                  <p className="text-[10px] text-slate-400">Writes the off days chosen in Rules into the public batch off-day table.</p>
                </div>
                <Toggle checked={pubOff} onChange={setPubOff} />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-red-100 bg-red-50/50 px-4 py-2.5 dark:border-red-900/50 dark:bg-red-950/20">
                <div>
                  <p className="text-xs font-extrabold text-red-700 dark:text-red-300">Remove existing entries of these batches first</p>
                  <p className="text-[10px] text-red-500/80">Deletes the CURRENT routine entries of the selected batches ({result && batchNos.reduce((n, b) => n + (ctx?.batches.find((x) => x.batchNo === b) ? db.routineEntries.filter((e) => e.batch_id === ctx.batches.find((x) => x.batchNo === b)!.id).length : 0), 0)} rows) before inserting — replaces the old schedule with the generated one.</p>
                </div>
                <Toggle checked={pubReplace} onChange={setPubReplace} />
              </div>
            </div>
            <div className={clsx('mt-4 rounded-xl px-4 py-3', freqOk ? 'border border-emerald-200/60 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20' : 'border border-red-200/70 bg-red-50/60 dark:border-red-900/60 dark:bg-red-950/20')}>
              <p className={clsx('flex items-center gap-2 text-xs font-extrabold', freqOk ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300')}>
                <Icon name={freqOk ? 'check' : 'alert'} className="h-4 w-4" />
                Credit-based frequency: {freq.filter((r) => r.ok).length}/{freq.length} courses meet their required weekly sessions
              </p>
              {!freqOk && (
                <p className="mt-1 text-[11px] leading-relaxed text-red-500/90 dark:text-red-400/90">
                  Some courses are missing required sessions (faculty conflict, room availability, batch off-day or lab capacity). Fix them in Review &amp; Lock (step 5) — publishing stays blocked until every course matches its credit-based requirement.
                </p>
              )}
            </div>
            <button className="btn-primary mt-4 w-full !py-3" onClick={onPublish} disabled={busy || !result.report.ok || !freqOk}>
              {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Icon name="check" className="h-4 w-4" />}
              {busy ? 'Publishing…' : `Publish ${pubBatches.length || batchNos.length} batch(es) — ${result.classes.length} class rows`}
            </button>
            {(!result.report.ok || !freqOk) && <p className="mt-2 text-center text-[11px] font-bold text-red-500">Resolve the Conflict Report / frequency gaps first — incomplete routines are never published.</p>}
          </div>

          {publishInfo && (
            <div className={clsx('card p-5', publishInfo.ok ? '' : 'border-red-200/70 dark:border-red-900/60')}>
              <p className={clsx('mb-2 flex items-center gap-2 text-sm font-extrabold', publishInfo.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                <Icon name={publishInfo.ok ? 'check' : 'alert'} className="h-4 w-4" /> {publishInfo.ok ? 'Published successfully' : 'Publish finished with issues'}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {publishInfo.created} class row(s) created · {publishInfo.deleted} existing row(s) removed{publishInfo.offDayErrors.length ? ` · ${publishInfo.offDayErrors.length} off-day error(s)` : ''}
              </p>
              {publishInfo.errors.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {publishInfo.errors.slice(0, 8).map((e, i) => <li key={i} className="text-[11px] text-red-600 dark:text-red-400">• {e}</li>)}
                </ul>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.keys(publishInfo.publishedByBatch).map((bn) => (
                  <button key={bn} className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => openStudentView(Number(bn), 'A')}>
                    <Icon name="eye" className="h-3.5 w-3.5" /> View Batch {bn} in student routine
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* add-row modal */}
      {addFor && (
        <Modal open onClose={() => setAddFor(null)} title={`Add course — Batch ${addFor.bn} ${addFor.sec}`} subtitle="Manual entry — the code auto-fills the title from the catalog.">
          <div className="p-5">
            <ManualEntry
              batches={ctx?.batches ?? []}
              knownFaculty={knownFaculty}
              titleFor={titleFor}
              catalogCodes={catalogCodes}
              isDuplicate={isDuplicate}
              onAdd={addManualRow}
              onSaveCourse={saveExtraCourse}
              initialBatch={addFor.bn}
              initialSection={addFor.sec}
              onClose={() => setAddFor(null)}
            />
          </div>
        </Modal>
      )}

      {/* course catalog modal */}
      {catOpen && (
        <Modal open onClose={() => setCatOpen(false)} title="Course catalog" subtitle="New semester? Add the new courses here — titles stay locked to the code everywhere.">
          <div className="p-5">
            <CatalogEditor
              knownFaculty={knownFaculty}
              titleFor={titleFor}
              catalogCodes={catalogCodes}
              extraCourses={extraCourses}
              onSave={saveExtraCourse}
              onRemove={(code) => setExtraCourses((prev) => { const { [code]: _omit, ...rest } = prev; return rest; })}
            />
          </div>
        </Modal>
      )}

      {/* edit modal */}
      {editClass && ctx && (
        <EditModal
          c={editClass}
          result={result!}
          ctx={ctx}
          config={config}
          onClose={() => setEditClass(null)}
          onSave={(updated, lock) => { applyEdit(updated, lock); setEditClass(null); }}
        />
      )}
    </AdminShell>
  );
}

/* ================= sub-components ================= */

function PasteBox({ onPaste, busy }: { onPaste: (t: string) => void; busy: boolean }) {
  const [text, setText] = useState('');
  return (
    <div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={'Paste tab-separated rows here…\n\nExample matrix format:\nSubject 0916-1101\t0917-1103\t0912-1105\n36 A\tMSK\tMTA\tDSS\n36 B\tMSK\tMTA\tBSS'} rows={8} className="input mt-3 !font-mono !text-[11px]" />
      <button className="btn-secondary mt-2 w-full" disabled={busy || !text.trim()} onClick={() => onPaste(text)}>
        <Icon name="search" className="h-4 w-4" /> Parse pasted text
      </button>
    </div>
  );
}

function BatchReviewTable({ batchNo, offers, knownFaculty, patch, titleFor, remove, onAddRow }: {
  batchNo: number; offers: OfferRow[]; knownFaculty: string[]; patch: (id: string, p: Partial<OfferRow>) => void;
  titleFor: (code: string) => string | null; remove: (id: string) => void; onAddRow: (sec: 'A' | 'B') => void;
}) {
  const [open, setOpen] = useState(true);
  const [arm, setArm] = useState<string | null>(null);
  const rowIssues = (o: OfferRow) => (!o.title ? 1 : 0) + (!o.faculty && o.type !== 'prj' ? 1 : 0) + (!o.credits ? 1 : 0);
  return (
    <div className="card overflow-hidden !p-0">
      <div className="flex w-full items-center justify-between gap-2 px-4 py-3">
        <button className="flex items-center gap-2 text-sm font-extrabold text-slate-800 dark:text-slate-100" onClick={() => setOpen((v) => !v)}>
          <span className="grad-icon-tile flex h-7 w-7 items-center justify-center rounded-lg text-xs">B</span>
          Batch {batchNo} · {offers.length} rows
        </button>
        <span className="flex items-center gap-2">
          <button className="btn-secondary !px-2.5 !py-1 text-[10px]" onClick={() => onAddRow('A')}><Icon name="plus" className="h-3 w-3" /> Add row</button>
          {offers.some((o) => rowIssues(o)) && <Badge tone="amber"><Icon name="alert" className="h-3 w-3" /> needs attention</Badge>}
          <button onClick={() => setOpen((v) => !v)} className="p-1"><Icon name="chevronDown" className={clsx('h-4 w-4 text-slate-400 transition-transform', !open && '-rotate-90')} /></button>
        </span>
      </div>
      {open && (
        <div className="overflow-x-auto border-t border-slate-100 scroll-thin dark:border-slate-800">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-slate-800/40">
                <th className="table-th">Sec</th><th className="table-th">Code → title</th><th className="table-th">Course title</th>
                <th className="table-th">Cr</th><th className="table-th">Type</th><th className="table-th">Faculty</th><th className="table-th w-14" />
              </tr>
            </thead>
            <tbody>
              {offers.map((o) => {
                const autoTitle = titleFor(o.code);
                return (
                  <tr key={o.id} className={clsx('border-b border-slate-100/80 last:border-0 dark:border-slate-800/60', rowIssues(o) && 'bg-amber-50/40 dark:bg-amber-950/20')}>
                    <td className="table-td font-extrabold">{o.section}</td>
                    <td className="table-td w-36">
                      <input
                        className="input !w-full !py-1 font-mono text-xs font-bold text-brand-700 dark:text-brand-400"
                        value={o.code}
                        placeholder="0916-0000"
                        onChange={(e) => {
                          const v = e.target.value;
                          const t = titleFor(v);
                          // code drives the title: auto-fill from the catalog, never editable afterwards
                          patch(o.id, t ? { code: v, title: t } : { code: v });
                        }}
                      />
                    </td>
                    <td className="table-td min-w-[240px]">
                      {autoTitle ? (
                        <span className="group flex items-center gap-1.5" title="Title comes from the course catalog — change the code to switch it.">
                          <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{o.title}</span>
                          <Icon name="lock" className="h-3 w-3 shrink-0 text-slate-300 group-hover:text-slate-400" />
                        </span>
                      ) : (
                        <input className={clsx('input !py-1 text-xs', !o.title && '!border-amber-400')} value={o.title} placeholder="— new course: enter title —" onChange={(e) => patch(o.id, { title: e.target.value })} />
                      )}
                    </td>
                    <td className="table-td w-16">
                      <input type="number" min={0} max={4} className={clsx('input !w-14 !py-1 text-xs', !o.credits && '!border-amber-400')} value={o.credits || ''} placeholder="—" onChange={(e) => patch(o.id, { credits: Number(e.target.value) || 0 })} />
                    </td>
                    <td className="table-td w-28">
                      <select className={clsx('input !py-1 text-xs', !o.type && '!border-amber-400')} value={o.type} onChange={(e) => patch(o.id, { type: e.target.value as OfferType, ...(e.target.value === 'prj' ? { faculty: '' } : {}) })}>
                        <option value="theory">Theory</option><option value="lab">Laboratory</option><option value="ged">GED</option><option value="prj">PRJ</option>
                      </select>
                    </td>
                    <td className="table-td w-36">
                      {o.type === 'prj' ? (
                        <span className="flex items-center gap-1.5 rounded-lg bg-violet-50 px-2 py-1 text-[10px] font-bold text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                          <Icon name="check" className="h-3 w-3" /> coordinator
                        </span>
                      ) : (
                        <select className={clsx('input !py-1 text-xs', !o.faculty && '!border-amber-400')} value={o.faculty} onChange={(e) => patch(o.id, { faculty: e.target.value, facultyRaw: e.target.value })}>
                          <option value="">— none —</option>
                          {knownFaculty.map((f) => <option key={f} value={f}>{f}</option>)}
                          {!knownFaculty.includes(o.faculty) && o.faculty && <option value={o.faculty}>{o.faculty} (unknown)</option>}
                        </select>
                      )}
                    </td>
                    <td className="table-td w-14">
                      {arm === o.id ? (
                        <button title="Click again to delete"
                          className="flex items-center gap-1 rounded-lg bg-red-500 px-2 py-1 text-[9px] font-extrabold text-white shadow-glow-blue"
                          onClick={() => { remove(o.id); setArm(null); }}>
                          <Icon name="trash" className="h-3 w-3" /> sure?
                        </button>
                      ) : (
                        <button title="Remove this course row"
                          className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-slate-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                          onClick={() => { setArm(o.id); window.setTimeout(() => setArm((a) => (a === o.id ? null : a)), 3000); }}>
                          <Icon name="trash" className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!offers.length && (
            <button className="w-full p-4 text-center text-xs font-bold text-brand-600 underline-offset-2 hover:underline dark:text-brand-400" onClick={() => onAddRow('A')}>
              No rows yet — add the first course to Batch {batchNo}
            </button>
          )}
          {offers.length > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-4 py-2 dark:border-slate-800 dark:bg-slate-800/30">
              <p className="text-[10px] text-slate-400">Rows are removed individually — regenerate after editing.</p>
              <button className="text-[10px] font-extrabold text-red-400 hover:text-red-600" onClick={() => { if (arm === 'all') { offers.forEach((o) => remove(o.id)); setArm(null); } else { setArm('all'); window.setTimeout(() => setArm((a) => (a === 'all' ? null : a)), 3000); } }}>
                {arm === 'all' ? 'Click again to confirm' : 'Remove all rows of this batch'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ================= manual course entry (primary import path) ================= */

function ManualEntry({ batches, knownFaculty, titleFor, catalogCodes, isDuplicate, onAdd, onSaveCourse, initialBatch, initialSection, onClose, className }: {
  batches: { id: string; batchNo: number; name: string }[];
  knownFaculty: string[];
  titleFor: (code: string) => string | null;
  catalogCodes: string[];
  isDuplicate: (bn: number, sec: string, code: string) => boolean;
  onAdd: (bn: number, sec: 'A' | 'B', code: string, title: string, credits: number, type: OfferType, faculty: string) => void;
  onSaveCourse: (c: { code: string; title: string; credits: number; type: OfferType }) => void;
  initialBatch?: number; initialSection?: 'A' | 'B'; onClose?: () => void; className?: string;
}) {
  const toast = useToast();
  const [batchNo, setBatchNo] = useState(initialBatch ?? batches[0]?.batchNo ?? 29);
  const [section, setSection] = useState<'A' | 'B'>(initialSection ?? 'A');
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [credits, setCredits] = useState(3);
  const [type, setType] = useState<OfferType>('theory');
  const [faculty, setFaculty] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const auto = code.trim() ? titleFor(code) : null;
  const isNew = !!code.trim() && !auto;

  function onCode(v: string) {
    setCode(v);
    const t = titleFor(v);
    if (t) { setTitle(t); setHint(null); } else if (!v.trim()) setTitle('');
  }
  function submit() {
    const c = code.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{2,}$/.test(c)) { setHint('Enter a valid course code, e.g. 0916-1101.'); return; }
    if (!auto && !title.trim()) { setHint('New course — type its full title once (it is saved to the catalog).'); return; }
    if (credits < 1 || credits > 4) { setHint('Credits must be 1–4.'); return; }
    if (isDuplicate(batchNo, section, c)) { setHint(`Batch ${batchNo}${section} already has ${c} — edit that row in Review instead.`); return; }
    if (type !== 'prj' && !faculty) { setHint('Pick the assigned faculty — or choose type PRJ (coordinator-supervised, no faculty needed).'); return; }
    if (isNew) { onSaveCourse({ code: c, title: title.trim(), credits, type }); }
    onAdd(batchNo, section, c, auto ?? title.trim(), credits, type, type === 'prj' ? '' : faculty);
    toast.push('success', `Added ${c} · Batch ${batchNo}${section}.`);
    setCode(''); setTitle(''); setHint(null);
    if (onClose) onClose();
  }
  const label = 'text-[10px] font-extrabold uppercase tracking-wide text-slate-400';
  return (
    <div className={className}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="block">
          <span className={label}>Batch</span>
          <select className="input mt-1 !py-2 text-xs" value={batchNo} onChange={(e) => setBatchNo(Number(e.target.value))}>
            {batches.map((b) => <option key={b.batchNo} value={b.batchNo}>{b.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={label}>Section</span>
          <select className="input mt-1 !py-2 text-xs" value={section} onChange={(e) => setSection(e.target.value as 'A' | 'B')}>
            <option value="A">A</option><option value="B">B</option>
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className={label}>Course code</span>
          <input list="gen-course-codes" className="input mt-1 !py-2 font-mono text-xs font-bold" value={code} placeholder="e.g. 0916-1101" onChange={(e) => onCode(e.target.value)} />
          <datalist id="gen-course-codes">{catalogCodes.slice(0, 300).map((c) => <option key={c} value={c} />)}</datalist>
        </label>
      </div>
      <label className="mt-3 block">
        <span className={label}>
          Course title {auto ? <span className="ml-1 normal-case text-emerald-600 dark:text-emerald-400"><Icon name="lock" className="h-3 w-3" /> auto from catalog — locked</span> : isNew ? <span className="ml-1 normal-case text-amber-600 dark:text-amber-400">new course — type title once (saved to catalog)</span> : null}
        </span>
        {auto ? (
          <span className="mt-1 flex items-center gap-2 rounded-xl bg-emerald-50/70 px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-emerald-200/60 dark:bg-emerald-950/30 dark:text-slate-200 dark:ring-emerald-900/50">
            <Icon name="book" className="h-3.5 w-3.5 text-emerald-600" /> {auto}
            <span className="ml-auto text-[9px] font-extrabold uppercase tracking-wide text-emerald-500">{type === 'lab' ? 'Practical' : type === 'prj' ? 'PRJ' : credits + ' credit'}</span>
          </span>
        ) : (
          <input className={clsx('input mt-1 !py-2 text-xs', isNew && '!border-amber-400')} value={title} placeholder="Course title" onChange={(e) => setTitle(e.target.value)} />
        )}
      </label>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="block">
          <span className={label}>Credits</span>
          <select className="input mt-1 !py-2 text-xs" value={credits} onChange={(e) => setCredits(Number(e.target.value))}>
            {[1, 2, 3, 4].map((c) => <option key={c} value={c}>{c} credit{c > 1 ? 's' : ''}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={label}>Type</span>
          <select className="input mt-1 !py-2 text-xs" value={type} onChange={(e) => { const t = e.target.value as OfferType; setType(t); if (t === 'prj') setFaculty(''); if (t === 'lab') setCredits((v) => (v > 2 ? 2 : v)); }}>
            <option value="theory">Theory</option><option value="lab">Laboratory</option><option value="ged">GED</option><option value="prj">PRJ</option>
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className={label}>Faculty {type === 'prj' && <span className="ml-1 normal-case text-violet-500">coordinator (none needed)</span>}</span>
          <select className={clsx('input mt-1 !py-2 text-xs', type !== 'prj' && !faculty && '!border-amber-400')} value={type === 'prj' ? '' : faculty} disabled={type === 'prj'} onChange={(e) => setFaculty(e.target.value)}>
            <option value="">— none —</option>
            {knownFaculty.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
      </div>
      <p className="mt-2 text-[10px] text-slate-400">
        {type === 'lab' ? 'Laboratory sessions split into paired groups A1/A2 (or B1/B2) with lab rotation.' : type === 'prj' ? 'Project / Industrial Training / Oral Assessment — one weekly session, supervised by the department coordinator.' : credits >= 3 ? '3-credit theory → 2 classes per week (different days preferred).' : credits === 2 ? '2-credit theory → 1 class per week.' : '1-credit course → 1 class per week.'}
      </p>
      {hint && <p className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-amber-600 dark:text-amber-400"><Icon name="alert" className="h-3.5 w-3.5" /> {hint}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn-primary !py-2.5" onClick={submit}><Icon name="plus" className="h-4 w-4" /> Add course{onClose ? '' : ' & add another'}</button>
        {onClose && <button className="btn-secondary !py-2.5" onClick={onClose}>Cancel</button>}
      </div>
    </div>
  );
}

/* ================= course catalog editor (new semester = new courses) ================= */

function CatalogEditor({ knownFaculty, titleFor, catalogCodes, extraCourses, onSave, onRemove }: {
  knownFaculty: string[]; titleFor: (code: string) => string | null; catalogCodes: string[];
  extraCourses: Record<string, { code: string; title: string; credits: number; type: OfferType }>;
  onSave: (c: { code: string; title: string; credits: number; type: OfferType }) => void;
  onRemove: (code: string) => void;
}) {
  const toast = useToast();
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [credits, setCredits] = useState(3);
  const [type, setType] = useState<OfferType>('theory');
  const [hint, setHint] = useState<string | null>(null);
  const auto = code.trim() ? titleFor(code) : null;
  function submit() {
    const c = code.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{2,}$/.test(c)) { setHint('Enter a valid course code.'); return; }
    if (!auto && !title.trim()) { setHint('New course — type its full title.'); return; }
    onSave({ code: c, title: auto ?? title.trim(), credits, type });
    toast.push('success', `Catalog: ${c} saved.`);
    setCode(''); setTitle(''); setHint(null);
  }
  const label = 'text-[10px] font-extrabold uppercase tracking-wide text-slate-400';
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 dark:border-slate-800 dark:bg-slate-800/30">
        <p className="mb-2.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Add a course to the catalog (new semester)</p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <input list="gen-cat-codes" className="input !py-2 font-mono text-xs" value={code} placeholder="Course code" onChange={(e) => { const v = e.target.value; setCode(v); const t = titleFor(v); if (t) setTitle(t); }} />
          <datalist id="gen-cat-codes">{catalogCodes.map((c) => <option key={c} value={c} />)}</datalist>
          <input className={clsx('input !py-2 text-xs sm:col-span-2', !auto && '!border-amber-400')} value={auto ?? title} placeholder={auto ? undefined : 'Course title (new course)'} disabled={!!auto} onChange={(e) => setTitle(e.target.value)} />
          <select className="input !py-2 text-xs" value={credits} onChange={(e) => setCredits(Number(e.target.value))}>
            {[1, 2, 3, 4].map((c) => <option key={c} value={c}>{c} credits</option>)}
          </select>
          <select className="input !py-2 text-xs" value={type} onChange={(e) => setType(e.target.value as OfferType)}>
            <option value="theory">Theory</option><option value="lab">Laboratory</option><option value="ged">GED</option><option value="prj">PRJ</option>
          </select>
          <button className="btn-primary !py-2 text-xs" onClick={submit}><Icon name="plus" className="h-3.5 w-3.5" /> Save</button>
        </div>
        {hint && <p className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-amber-600"><Icon name="alert" className="h-3.5 w-3.5" /> {hint}</p>}
      </div>
      <div>
        <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Your custom courses ({Object.keys(extraCourses).length})</p>
        {!Object.keys(extraCourses).length && <p className="text-xs text-slate-400">None yet — courses you define here stay available for the next semester too. Existing catalog: {catalogCodes.length} codes.</p>}
        <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1 scroll-thin">
          {Object.values(extraCourses).map((c) => (
            <div key={c.code} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-1.5 dark:border-slate-800">
              <span className="font-mono text-[11px] font-bold text-brand-700 dark:text-brand-400">{c.code}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-slate-600 dark:text-slate-300">{c.title}</span>
              <Badge tone={c.type === 'lab' ? 'green' : c.type === 'prj' ? 'purple' : 'blue'}>{c.credits}cr · {c.type}</Badge>
              <button className="text-slate-300 hover:text-red-500" onClick={() => onRemove(c.code)} title="Remove from catalog"><Icon name="trash" className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[10px] leading-relaxed text-slate-400">Codes drive titles automatically everywhere — use the official codes so titles stay locked to the catalog. Custom courses are created in the database the first time you publish them (never guessed from elsewhere).</p>
    </div>
  );
}

function RoomToggle({ code, on, onToggle, tone, small, disabled }: { code: string; on: boolean; onToggle: () => void; tone?: 'blue' | 'green'; small?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onToggle} disabled={disabled} title={disabled ? 'Reserved by a fixed faculty rule' : code}
      className={clsx('rounded-lg font-extrabold transition-all', small ? 'px-1.5 py-0.5 text-[9px]' : 'px-2.5 py-1 text-[10px]',
        on ? (tone === 'green' ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-800' : 'bg-brand-100 text-brand-800 ring-1 ring-brand-300 dark:bg-brand-950 dark:text-brand-300 dark:ring-brand-800')
          : 'bg-slate-100 text-slate-400 line-through dark:bg-slate-800 dark:text-slate-600',
        disabled && 'cursor-not-allowed opacity-80')}>
      {code.replace('AB-1 ', '')}
    </button>
  );
}

function MiniStat({ label, value, icon, tone }: { label: string; value: any; icon: any; tone: string }) {
  const tones: Record<string, string> = { blue: 'from-sky-500 to-brand-600', green: 'from-emerald-500 to-green-600', purple: 'from-violet-500 to-purple-600', amber: 'from-amber-400 to-orange-500', red: 'from-rose-500 to-red-600' };
  return (
    <div className="card flex items-center gap-2.5 p-3.5">
      <span className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm', tones[tone])}><Icon name={icon} className="h-4 w-4" /></span>
      <div className="min-w-0">
        <p className="text-base font-extrabold leading-tight text-slate-900 dark:text-white">{value}</p>
        <p className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      </div>
    </div>
  );
}

function SegSec({ value, onChange }: { value: 'A' | 'B'; onChange: (v: 'A' | 'B') => void }) {
  return (
    <div className="inline-flex rounded-xl border border-white/80 bg-white/60 p-1 shadow-sm dark:border-slate-700 dark:bg-slate-800/60">
      {(['A', 'B'] as const).map((s) => (
        <button key={s} onClick={() => onChange(s)} className={clsx('rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all', value === s ? 'text-white shadow-glow-blue' : 'text-slate-500 dark:text-slate-400')}
          style={value === s ? { backgroundImage: 'var(--grad-diu)' } : undefined}>
          Section {s}
        </button>
      ))}
    </div>
  );
}

function ResultCard({ c, onEdit }: { c: GenClass; onEdit: () => void }) {
  const isLab = c.type === 'lab';
  const isPrj = c.type === 'prj' || c.type === 'ged';
  return (
    <button onClick={onEdit} className={clsx(
      'group relative w-full overflow-hidden rounded-xl border px-2 py-1.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-glass-hover',
      isLab ? 'border-emerald-200/80 bg-gradient-to-br from-emerald-50/95 to-emerald-100/70 dark:border-emerald-800' :
        isPrj ? 'border-violet-200/80 bg-gradient-to-br from-violet-50/95 to-fuchsia-100/60 dark:border-violet-800' :
          'border-brand-200/80 bg-gradient-to-br from-brand-50/95 to-brand-100/70 dark:border-brand-800',
    )}>
      <span className={clsx('absolute inset-y-0 left-0 w-1 rounded-full', isLab ? 'bg-gradient-to-b from-emerald-500 to-emerald-400' : isPrj ? 'bg-gradient-to-b from-violet-500 to-fuchsia-400' : 'bg-gradient-to-b from-brand-600 to-sky-500')} />
      <p className={clsx('pl-2 pr-6 text-[9px] font-extrabold uppercase tracking-wide', isLab ? 'text-emerald-700 dark:text-emerald-300' : isPrj ? 'text-violet-700 dark:text-violet-300' : 'text-brand-700 dark:text-brand-300')}>
        {c.code}{c.groupId ? ` · ${groupName(c)}` : ''}
      </p>
      <p className="pl-2 line-clamp-2 text-[10px] font-bold leading-snug text-slate-800 dark:text-slate-100">{c.title || c.code}</p>
      <p className="pl-2 pt-0.5 text-[9px] font-semibold text-slate-500 dark:text-slate-400">
        {c.faculty} · {roomShort(c)}
        {c.locked && <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-slate-800/80 px-1 py-px text-[8px] font-extrabold text-white"><Icon name="shield" className="h-2 w-2" /> locked</span>}
      </p>
      <span className="absolute right-1 top-1 rounded-md bg-white/70 p-0.5 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100 dark:bg-slate-800/70">
        <Icon name="edit" className="h-2.5 w-2.5" />
      </span>
    </button>
  );
}

function groupName(c: GenClass) {
  return (c.uid.split(':')[1] ?? '').replace(/^g\d+-/, '') || 'grp';
}
function roomShort(c: GenClass) {
  return c.roomId.slice(-8).replace(/^AB-1\s/g, '');
}

function EditModal({ c, result, ctx, config, onClose, onSave }: {
  c: GenClass; result: GenResult; ctx: NonNullable<ReturnType<typeof buildGenCtx>>; config: GenConfig;
  onClose: () => void; onSave: (c: GenClass, lock: boolean) => void;
}) {
  const [dayId, setDayId] = useState(c.dayId);
  const [slotId, setSlotId] = useState(c.slotId);
  const [roomId, setRoomId] = useState(c.roomId);
  const [lock, setLock] = useState(c.locked);
  const probe = probeMove(ctx, result.classes, config, c, dayId, slotId, roomId);
  const rooms = c.type === 'lab' ? ctx.rooms.filter((r) => r.type === 'lab') : ctx.rooms.filter((r) => r.type !== 'lab');
  return (
    <Modal open onClose={onClose} title={`${c.code} · Batch ${c.batchNo}${c.section}${c.groupId ? ` · ${groupName(c)}` : ''}`} subtitle={c.title || undefined}>
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold" style={{ backgroundImage: 'linear-gradient(135deg,#dbeafe,#dcfce7)' }}>
          <Icon name={c.type === 'lab' ? 'flask' : c.type === 'prj' ? 'award' : 'book'} className="h-4 w-4 text-brand-600" />
          {c.faculty} · {c.type === 'lab' ? 'Laboratory' : c.type === 'prj' ? 'PRJ' : c.type === 'ged' ? 'GED' : 'Theory'} · {c.credits} cr
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div><label className="label">Day</label>
            <Select value={dayId} onChange={setDayId} options={ctx.days.map((d) => ({ value: d.id, label: d.name }))} />
          </div>
          <div><label className="label">Time slot</label>
            <Select value={slotId} onChange={setSlotId} options={ctx.slots.map((s) => ({ value: s.id, label: s.label }))} />
          </div>
          <div><label className="label">Room{c.groupId ? ' (this group)' : ''}</label>
            <Select value={roomId} onChange={setRoomId} options={rooms.map((r) => ({ value: r.id, label: r.code }))} />
          </div>
        </div>
        {c.groupId && <p className="text-[10px] text-slate-400">Lab twin group follows the same day/slot automatically (rooms differ).</p>}
        <div className={clsx('flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold', probe.ok ? 'border-emerald-200 bg-emerald-50/70 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-red-200 bg-red-50/70 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300')}>
          <Icon name={probe.ok ? 'check' : 'alert'} className="mt-0.5 h-4 w-4 shrink-0" />
          {probe.ok ? 'No conflict — this change is valid against the current schedule.' : probe.reason}
        </div>
        <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white/60 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/40">
          <div>
            <p className="text-xs font-extrabold text-slate-700 dark:text-slate-200">Lock this class</p>
            <p className="text-[10px] text-slate-400">Locked classes stay fixed when the routine is regenerated.</p>
          </div>
          <Toggle checked={lock} onChange={setLock} />
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!probe.ok} onClick={() => onSave({ ...c, dayId, slotId, roomId }, lock)}>
            <Icon name="check" className="h-4 w-4" /> {lock ? 'Apply & lock' : 'Apply change'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function AddFixedRoom({ config, patch, rooms, faculty }: { config: GenConfig; patch: (p: Partial<GenConfig>) => void; rooms: string[]; faculty: string[] }) {
  const [init, setInit] = useState(''); const [room, setRoom] = useState('AB-1 104');
  return (
    <div className="flex items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
      <Select className="flex-1" value={init} onChange={setInit} placeholder="+ faculty initials…" options={faculty.filter((f) => !config.fixedRooms[f]).map((f) => ({ value: f, label: f }))} />
      <Select className="flex-1" value={room} onChange={setRoom} options={rooms.map((r) => ({ value: r, label: r }))} />
      <button className="btn-secondary !px-2.5 !py-1.5 text-xs" disabled={!init} onClick={() => { patch({ fixedRooms: { ...config.fixedRooms, [init]: room } }); setInit(''); }}>
        <Icon name="plus" className="h-3.5 w-3.5" /> Add rule
      </button>
    </div>
  );
}
