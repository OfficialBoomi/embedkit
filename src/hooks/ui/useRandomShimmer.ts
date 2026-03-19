/**
 * @file uuseRandomShimmer.ts
 * @function useRandomShimmer
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 */

import { useEffect, useRef } from 'react';

function hashString(s: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRand(seed: number) {
  let x = seed || 1;
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    // 0..1
    return ((x >>> 0) % 100000) / 100000;
  };
}

/**
 * Apply randomized shimmer vars to a single element.
 * - Stable if you pass a seedKey (e.g., component id)
 * - Varies: speed (2.2s..4.0s), direction (normal|reverse), starting angle (0..360deg)
 */
export function useRandomShimmer(seedKey?: string) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const seed = typeof seedKey === 'string' ? hashString(seedKey) : Math.floor(Math.random() * 1e9);
    const rand = seededRand(seed);

    const speedSec = 2.2 + rand() * 1.8; // 2.2s → 4.0s
    const direction = rand() < 0.5 ? 'normal' as const : 'reverse' as const;
    const startAngle = Math.floor(rand() * 360); // 0..359

    el.style.setProperty('--boomi-agent-shimmer-speed', `${speedSec.toFixed(2)}s`);
    el.style.setProperty('--boomi-agent-shimmer-direction', direction);
    el.style.setProperty('--boomi-angle', `${startAngle}deg`);
  }, [seedKey]);

  return ref;
}
