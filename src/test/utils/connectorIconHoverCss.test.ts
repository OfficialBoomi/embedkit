import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The connector icons on a card lift a little on hover, except on cards of the 1.7 UI (the Integrations
 * list at uiVersion 1.7 and every Add Integration catalog card), which carry boomi-integration-card--ui-1-7.
 * jsdom does not apply the stylesheet, so this reads the rules from main.css and checks the two sides of the
 * split, so neither can be dropped by accident.
 */
const css = readFileSync(resolve(process.cwd(), 'src/main.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of the rule with exactly this selector, or null when there is none. */
function declarationsOf(selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\>]/g, '\\$&').replace(/\s+/g, '\\s*');
  const match = new RegExp(`(?:^|})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  return match ? match[1] : null;
}

describe('connector icon hover', () => {
  it('lifts the icon on hover by default, so earlier UI versions keep the old behaviour', () => {
    const lift = declarationsOf('.boomi-connector-stack > .boomi-connector-icon:hover');
    expect(lift).not.toBeNull();
    expect(lift).toMatch(/transform:\s*translateY\(-2px\)/);
  });

  it('animates that lift, as before', () => {
    const base = declarationsOf('.boomi-connector-stack > .boomi-connector-icon');
    expect(base).not.toBeNull();
    expect(base).toMatch(/transition:\s*transform\s+120ms/);
  });

  it('keeps the icon still on a card of the 1.7 UI', () => {
    const still = declarationsOf(
      '.boomi-integration-card--ui-1-7 .boomi-connector-stack > .boomi-connector-icon:hover'
    );
    expect(still).not.toBeNull();
    expect(still).toMatch(/transform:\s*none/);
  });

  it('puts the 1.7 rule after the default one, so it also wins if the specificity is ever evened out', () => {
    const lift = css.indexOf('.boomi-connector-stack > .boomi-connector-icon:hover {');
    const still = css.indexOf('.boomi-integration-card--ui-1-7 .boomi-connector-stack > .boomi-connector-icon:hover');
    expect(lift).toBeGreaterThan(-1);
    expect(still).toBeGreaterThan(lift);
  });
});
