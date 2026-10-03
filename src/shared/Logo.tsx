/**
 * Klammr brand mark as inline SVG React components (shared by the chat and settings webviews).
 * Source of truth: brand/klammr-mark.svg and brand/klammr-glyph.svg — keep the geometry in sync.
 *
 * The mark is a text cursor held in a pair of brackets, [|] ("Klammer" is German for bracket).
 * - `KlammrMark`:  the full mark on its dark rounded tile (gradients kept, ids made unique per
 *                  instance so two marks on one page do not collide).
 * - `KlammrGlyph`: the mark without the tile; the brackets are `currentColor`, so they adapt to light
 *                  and dark themes. The cursor bar keeps the violet → orchid gradient.
 */
import { useId, type SVGProps } from 'react';

type LogoProps = Omit<SVGProps<SVGSVGElement>, 'viewBox' | 'children'> & { size?: number | string; title?: string };

const BAR = { x: 117, y: 81, width: 22, height: 94, rx: 10 };
const BRACKETS = ['103,68 70,68 70,188 103,188', '153,68 186,68 186,188 153,188'];

function Brackets({ stroke }: { stroke: string }) {
  return (
    <g fill="none" stroke={stroke} strokeWidth="22" strokeLinecap="round" strokeLinejoin="round">
      {BRACKETS.map((points) => (
        <polyline key={points} points={points} />
      ))}
    </g>
  );
}

function safeId(id: string): string {
  // useId yields ":r0:" — colons are legal in ids but awkward inside url(#…) in some engines.
  return id.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function KlammrMark({ size = 56, title, ...rest }: LogoProps) {
  const p = `k${safeId(useId())}`;
  const tile = `${p}-tile`;
  const glow = `${p}-glow`;
  const bar = `${p}-bar`;
  const soft = `${p}-soft`;
  return (
    <svg viewBox="0 0 256 256" width={size} height={size} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} {...rest}>
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={tile} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1b1e2a" />
          <stop offset="1" stopColor="#0b0c10" />
        </linearGradient>
        <radialGradient id={glow} cx="0.3" cy="0.25" r="0.75">
          <stop offset="0" stopColor="#7c8cff" stopOpacity="0.24" />
          <stop offset="1" stopColor="#7c8cff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={bar} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8f9bff" />
          <stop offset="1" stopColor="#b57cff" />
        </linearGradient>
        <filter id={soft} x="-80%" y="-50%" width="260%" height="200%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>
      <rect width="256" height="256" rx="58" fill={`url(#${tile})`} />
      <rect width="256" height="256" rx="58" fill={`url(#${glow})`} />
      <rect {...BAR} fill="#9b8cff" opacity="0.5" filter={`url(#${soft})`} />
      <rect {...BAR} fill={`url(#${bar})`} />
      <Brackets stroke="#eef0f6" />
    </svg>
  );
}

export function KlammrGlyph({ size = 16, title, ...rest }: LogoProps) {
  const bar = `k${safeId(useId())}-bar`;
  return (
    <svg viewBox="0 0 256 256" width={size} height={size} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} {...rest}>
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={bar} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8f9bff" />
          <stop offset="1" stopColor="#b57cff" />
        </linearGradient>
      </defs>
      <rect {...BAR} fill={`url(#${bar})`} />
      <Brackets stroke="currentColor" />
    </svg>
  );
}
