import { useEffect, useRef, type CSSProperties, type ReactNode, type HTMLAttributes } from 'react';
import clsx from 'clsx';

/* ============================================================
 * Tilt3D — lightweight 3D tilt + glare wrapper.
 * Tracks the cursor and writes --rx/--ry (tilt) and --gx/--gy
 * (glare position) straight onto the element style — zero
 * re-renders, safe for dense grids (timetables, cards).
 * Automatically disabled on touch devices & reduced-motion.
 * ============================================================ */

let finePointer = false;
let reducedMotion = false;
try {
  finePointer = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? false;
  reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
} catch { /* SSR / older browsers → static */ }

export default function Tilt3D({
  children,
  className,
  max = 9,          // max tilt in degrees
  scale = 1.02,     // hover scale
  glare = true,     // light glare that follows the cursor
  lift = 6,         // px the card lifts on hover
  radius,           // max distance from center (0-0.5 normalization)
  style,
  ...rest
}: {
  children: ReactNode;
  max?: number;
  scale?: number;
  glare?: boolean;
  lift?: number;
  radius?: number;
} & Omit<HTMLAttributes<HTMLDivElement>, 'ref'>) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let on = false;

    const apply = (e: PointerEvent | MouseEvent) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const px = (e.clientX - r.left) / r.width;   // 0..1
      const py = (e.clientY - r.top) / r.height;   // 0..1
      const nx = px - 0.5, ny = py - 0.5;
      el.style.setProperty('--rx', `${(-ny * max).toFixed(2)}deg`);
      el.style.setProperty('--ry', `${(nx * max).toFixed(2)}deg`);
      el.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`);
      el.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`);
      if (!on) {
        on = true;
        el.style.transition = 'transform .18s ease-out';
        el.style.transform = `perspective(950px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg)) translateZ(1px) scale(${scale})`;
      }
    };
    const leave = () => {
      on = false;
      if (raf) cancelAnimationFrame(raf);
      el.style.transition = 'transform .4s cubic-bezier(.22,1,.36,1)';
      el.style.transform = '';
      el.style.boxShadow = '';
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
    };
    const move = (e: PointerEvent | MouseEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; apply(e); });
    };
    const enter = (e: PointerEvent | MouseEvent) => {
      apply(e);
      el.style.boxShadow = `0 ${lift}px ${lift * 3}px -8px rgba(29,78,216,.28), 0 24px 48px -18px rgba(14,165,233,.24)`;
    };

    if (finePointer && !reducedMotion) {
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerenter', enter);
      el.addEventListener('pointerleave', leave);
    }
    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerenter', enter);
      el.removeEventListener('pointerleave', leave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [max, scale, lift]);

  return (
    <div
      ref={ref}
      className={clsx('tilt-card relative', className)}
      style={style as CSSProperties}
      {...rest}
    >
      {children}
      {glare && <span aria-hidden className="tilt-glare absolute inset-0 rounded-[inherit]" />}
    </div>
  );
}
