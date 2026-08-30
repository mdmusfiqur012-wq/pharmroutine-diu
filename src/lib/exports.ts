import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import type { Database, JoinedEntry, ClassDay, TimeSlot, AppSettings } from './types';
import { classColor } from './routine';
import diuLogo from '../assets/diu-logo.png?inline';

/* ============================================================
 * PDF / PNG / print export.
 * The exported routine automatically includes the university
 * name, department, semester, batch, section, lab group and the
 * generation date, plus the personalized timetable.
 * ============================================================ */

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lighten(hex: string, alpha: number): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  // blend toward white
  const mix = (c: number) => Math.round(c + (255 - c) * (1 - alpha));
  return [mix(r), mix(g), mix(b)];
}

export interface ExportInfo {
  settings: AppSettings;
  semesterName: string;
  batchName: string;
  sectionName: string;
  labGroupName: string | null;
  days: ClassDay[];
  slots: TimeSlot[];
  entries: JoinedEntry[];
  offDayMap: Map<string, { reason?: string | null }>; // dayId -> off-day reason
  title: string;
}

function wrapText(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines = 4): number {
  const words = text.split(/\s+/);
  let line = '';
  let lines = 0;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (doc.getTextWidth(test) > maxWidth) {
      if (lines >= maxLines - 1) {
        doc.text(line.length > maxWidth * 0.9 ? line.slice(0, Math.floor(maxWidth / 1.6)) + '…' : line, x, y);
        return y + lineHeight;
      }
      doc.text(line, x, y);
      line = w;
      lines++;
      if (line.length > 30) {
        doc.text(line.slice(0, 30) + '…', x, y);
        y += lineHeight;
        break;
      }
      y += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) doc.text(line.slice(0, 44), x, y);
  return y + lineHeight;
}

export async function exportRoutinePdf(info: ExportInfo, fileName = 'routine.pdf'): Promise<void> {
  const { settings, semesterName, batchName, sectionName, labGroupName, days, slots, entries, offDayMap, title } = info;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 36;

  // ---- header band ----
  doc.setFillColor(...hexToRgb(settings.colors.theory));
  doc.rect(0, 0, pageW, 56, 'F');
  doc.addImage(diuLogo, 'PNG', margin + 4, 6.5, 43, 42);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(settings.universityName, margin + 56, 26);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${settings.departmentName}  ·  ${title}`, margin + 56, 42);

  // ---- meta line ----
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  const meta = `Semester: ${semesterName}    |    ${batchName} — Section ${sectionName}${labGroupName ? ` — Lab Group ${labGroupName}` : ''}`;
  doc.text(meta, margin, 78);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(110, 110, 110);
  doc.text(`Generated on ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}  ·  All classes are 1 hour 30 minutes  ·  Portal: Pharmacy Routine, DIU`, margin, 92);

  // ---- table geometry ----
  const tableTop = 104;
  const rowH = 58;
  const dayColW = 92;
  const slotW = (pageW - margin * 2 - dayColW) / slots.length;
  const tableH = rowH * days.length;

  // header row
  doc.setFillColor(240, 244, 240);
  doc.rect(margin, tableTop, dayColW, 26, 'F');
  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('Day', margin + 8, tableTop + 16);
  slots.forEach((s, i) => {
    const x = margin + dayColW + i * slotW;
    doc.setFillColor(240, 244, 240);
    doc.rect(x, tableTop, slotW, 26, 'F');
    doc.text(s.label, x + 5, tableTop + 16);
  });
  doc.setDrawColor(160, 160, 160);
  doc.setLineWidth(0.6);
  doc.line(margin, tableTop + 26, margin + dayColW + slotW * slots.length, tableTop + 26);

  let y = tableTop + 26;
  const now = Date.now();
  for (const day of days) {
    doc.setFillColor(250, 250, 250);
    doc.rect(margin, y, dayColW, rowH, 'F');
    doc.setTextColor(30, 30, 30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(day.short_name, margin + 8, y + rowH / 2 + 3);

    if (offDayMap.has(day.id)) {
      // OFF DAY band
      doc.setFillColor(254, 243, 226);
      doc.rect(margin + dayColW, y, slotW * slots.length, rowH, 'F');
      doc.setTextColor(180, 100, 20);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('OFF DAY — No Classes Scheduled', margin + dayColW + 12, y + rowH / 2 + 4);
      doc.setTextColor(150, 120, 80);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(offDayMap.get(day.id)?.reason ?? '', margin + dayColW + 12, y + rowH / 2 + 16);
    } else {
      slots.forEach((slot, i) => {
        const x = margin + dayColW + i * slotW;
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.4);
        doc.rect(x, y, slotW, rowH);
        const cell = entries.filter((e) => e.day_id === day.id && e.time_slot_id === slot.id);
        if (cell.length) {
          for (const e of cell) {
            const c = e.status === 'cancelled' || e.status === 'rescheduled' ? '#f8fafc' : classColor(e, settings.colors);
            const [r, g, b] = lighten(c, 0.88);
            doc.setFillColor(r, g, b);
            doc.rect(x + 2, y + 2, slotW - 4, rowH - 4, 'F');
            const accent = hexToRgb(c);
            doc.setDrawColor(...accent);
            doc.setLineWidth(1);
            doc.rect(x + 2, y + 2, slotW - 4, rowH - 4, 'S');
            doc.setTextColor(...accent);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(6.6);
            const code = `${e.course?.code ?? ''}${e.labGroup ? ' · Grp ' + e.labGroup.name : ''}`;
            doc.text(code.slice(0, 22), x + 7, y + 13);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.2);
            doc.setTextColor(50, 50, 50);
            const titleTxt = (e.course?.title ?? '').slice(0, 34);
            doc.text(titleTxt, x + 7, y + 22);
            doc.setTextColor(90, 90, 90);
            doc.text(`${e.faculty?.initials ?? ''} · ${e.room?.code ?? ''}`, x + 7, y + 30);
            doc.setFontSize(5.8);
            doc.setTextColor(...accent);
            if (e.status !== 'active') doc.text(e.status.toUpperCase(), x + 7, y + 38);
            break; // compact PDF: first class per cell
          }
        } else {
          doc.setTextColor(190, 190, 190);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.text('—', x + slotW / 2 - 2, y + rowH / 2 + 2);
        }
      });
    }
    y += rowH;
    /* page-break safety */
    if (y > pageH - 90 && day !== days[days.length - 1]) {
      doc.addPage();
      y = 60;
      doc.setFillColor(240, 244, 240);
      doc.rect(margin, y - 20, dayColW + slotW * slots.length, 20, 'F');
      doc.setFontSize(8);
      doc.text(`${batchName} Section ${sectionName} — continued`, margin + 6, y - 6);
      y += 6;
    }
  }

  // ---- legend ----
  let ly = Math.min(y + 26, pageH - 60);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);
  doc.text('Legend:', margin, ly);
  const legend = [
    ['Theory', settings.colors.theory],
    ['Laboratory', settings.colors.lab],
    ['Guest Faculty', settings.colors.guest],
    ['GED', settings.colors.ged],
    ['NFE', settings.colors.nfe],
    ['Agriculture', settings.colors.agriculture],
    ['Cancelled', settings.colors.cancelled],
    ['Rescheduled', settings.colors.rescheduled],
  ];
  let lx = margin + 44;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  for (const [label, color] of legend) {
    if (lx > pageW - margin - 90) { lx = margin + 44; ly += 14; }
    const [r, g, b] = hexToRgb(color);
    doc.setFillColor(r, g, b);
    doc.rect(lx, ly - 6, 9, 9, 'F');
    doc.setTextColor(70, 70, 70);
    doc.text(label, lx + 13, ly + 1);
    lx += doc.getTextWidth(label) + 36;
  }
  ly += 20;
  doc.setFontSize(7);
  doc.setTextColor(140, 140, 140);
  doc.text('This is a system-generated routine. Please report discrepancies to the department office.', margin, ly);
  doc.text(`Routine ID ${now.toString(36).toUpperCase()} · ${settings.universityName}`, margin, ly + 11);

  /* credit line — everyone sees who prepared the routine */
  doc.setFontSize(8);
  doc.setTextColor(30, 64, 120);
  doc.setFont('helvetica', 'bold');
  doc.text('Prepared by Md Musfiqur Rahaman', margin, ly + 24);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(90, 90, 90);
  doc.text('Research & Academic Affairs Secretary · Department of Pharmacy, Daffodil International University', margin, ly + 32);

  doc.save(fileName);
}

export const ROUTINE_PDF_FILENAME = (seed: string) =>
  `DIU-Pharmacy-${seed.replace(/[^a-z0-9]+/gi, '-')}-Routine.pdf`;

/* PNG export: rasterize an element with html2canvas */
export async function exportRoutinePng(el: HTMLElement, fileName = 'routine.png'): Promise<void> {
  const canvas = await html2canvas(el, { backgroundColor: '#ffffff', scale: 2, useCORS: true });
  const link = document.createElement('a');
  link.download = fileName;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

export function printElement(): void {
  window.print();
}
