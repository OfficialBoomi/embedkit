/**
 * @file StatusRowChip.tsx
 * @component StatusRowChip
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Stylized, theme-aware status chip(s) with a soft pulse.
 */

import React from 'react';

type StatusRowChipProps = { note?: string };

function toneOf(text: string): 'success' | 'warning' | 'error' | 'accent' {
  const t = text.toLowerCase();
  if (/\b(success|successful|successfully|ok|ready|healthy|running|connected|live|up)\b/.test(t)) return 'success';
  if (/\b(warn|warning|degraded|slow|retry|pending|queue|queued)\b/.test(t)) return 'warning';
  if (/\b(error|errors|fail|failed|invalid|down|offline|blocked|denied)\b/.test(t)) return 'error';
  return 'accent'; // default to accent-tinted chip
}

export const StatusRowChip: React.FC<StatusRowChipProps> = ({ note }) => {
  if (!note) return null;

  // split into chips by newline / semicolon / middle-dot separators
  const raw = note
    .split(/\r?\n|;|\s·\s/g)
    .map((s) => s.trim())
    .filter(Boolean);

  // de-dupe consecutive chips
  const chips: string[] = [];
  for (const s of raw) {
    if (chips[chips.length - 1] !== s) chips.push(s);
  }
  if (!chips.length) return null;

  return (
    <div className="w-full max-w-[860px] px-4 md:px-6">
      <div className="flex flex-wrap gap-2 py-1">
        {chips.map((c, i) => {
          const tone = toneOf(c);
          const toneClass =
            tone === 'success'
              ? 'boomi-chip--success'
              : tone === 'warning'
              ? 'boomi-chip--warning'
              : tone === 'error'
              ? 'boomi-chip--error'
              : ''; // accent is the base

          return (
            <span
              key={`${c}-${i}`}
              className={[
                'boomi-chip',
                'boomi-chip--pulse', // adds soft halo pulse
                toneClass,
              ].join(' ')}
              // expose tone for CSS (optional, if you want attribute hooks)
              data-tone={tone}
            >
              {/* tiny animated dot that inherits tone */}
              <span className="boomi-chip-dot" aria-hidden="true" />
              <span className="font-semibold">{c}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
};

export default StatusRowChip;
