/**
 * @file AgentProse.test.tsx
 * @license BSD-2-Clause
 *
 * Unit tests for agent response rendering.
 *
 * The behaviour under test is containment: agent answers routinely carry
 * Markdown tables, fenced code and long unbreakable identifiers, and a bare
 * HTML render of those pushes the message wider than the chat pane. jsdom does
 * not lay out, so these tests assert the structural guarantees the CSS relies
 * on — a scroll container around every table, a copy affordance per code block —
 * rather than pixel widths.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentProse } from '../../components/agent/AgentProse';

const MARKDOWN = [
  '# Heading',
  '',
  'Use the `connectorType="officialboomi-X3979C-rest-prod"` connector.',
  '',
  '| Component | Doc |',
  '|---|---|',
  '| Connection | `references/components/rest_connection_component.md` |',
  '',
  '```xml',
  '<properties key="lat" value=""/>',
  '```',
  '',
  '- first',
  '- second',
].join('\n');

function getShadowlessContainer(markdown = MARKDOWN, copy?: any) {
  const { container } = render(<AgentProse markdown={markdown} copy={copy} />);
  return container;
}

describe('AgentProse', () => {
  beforeEach(() => {
    // jsdom has no clipboard; provide a spy-able one.
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('renders markdown structure: headings, lists, tables and code', () => {
    const c = getShadowlessContainer();
    expect(c.querySelector('h1')?.textContent).toBe('Heading');
    expect(c.querySelectorAll('li')).toHaveLength(2);
    expect(c.querySelector('table')).toBeTruthy();
    expect(c.querySelector('pre code')?.textContent).toContain('<properties key="lat"');
  });

  it('wraps every table in a horizontal scroll container', () => {
    const c = getShadowlessContainer();
    const table = c.querySelector('table');
    expect(table).toBeTruthy();
    // The scroll container is what stops a wide table widening the whole pane.
    expect(table!.parentElement).toHaveClass('agent-prose__scroll');
    expect(c.querySelectorAll('.agent-prose__scroll')).toHaveLength(1);
  });

  it('gives the table scroll container an accessible, focusable region', () => {
    const c = getShadowlessContainer();
    const wrap = c.querySelector('.agent-prose__scroll')!;
    // Keyboard users need to be able to reach a scrollable region.
    expect(wrap.getAttribute('tabindex')).toBe('0');
    expect(wrap.getAttribute('role')).toBe('region');
  });

  it('wraps fenced code in a figure carrying the language label', () => {
    const c = getShadowlessContainer();
    const fig = c.querySelector('.agent-prose__code');
    expect(fig).toBeTruthy();
    expect(fig!.querySelector('.agent-prose__code-lang')?.textContent).toBe('xml');
    expect(fig!.querySelector('pre')).toBeTruthy();
  });

  it('copies the markdown source — not the rendered text — for the response', async () => {
    getShadowlessContainer();
    const btn = screen.getByRole('button', { name: /copy response/i });
    await userEvent.click(btn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(MARKDOWN);
  });

  it('copies just the code when a code block copy button is used', async () => {
    const c = getShadowlessContainer();
    const codeCopy = c.querySelector('.agent-prose__code-copy') as HTMLElement;
    expect(codeCopy).toBeTruthy();
    await userEvent.click(codeCopy);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('<properties key="lat" value=""/>\n');
  });

  it('honours ui.copy toggles', () => {
    const c = getShadowlessContainer(MARKDOWN, { showMessageCopy: false, showCodeCopy: false });
    expect(c.querySelector('.agent-prose-copy')).toBeNull();
    expect(c.querySelector('.agent-prose__code-copy')).toBeNull();
    // The code figure itself still renders — only its button is suppressed.
    expect(c.querySelector('.agent-prose__code')).toBeTruthy();
  });

  it('honours ui.copy labels', () => {
    const c = getShadowlessContainer(MARKDOWN, { label: 'Duplicate' });
    expect(screen.getByRole('button', { name: /duplicate response/i })).toBeTruthy();
    expect(c.querySelector('.agent-prose__code-copy')?.textContent).toBe('Duplicate');
  });

  it('sanitizes dangerous markup', () => {
    const c = getShadowlessContainer('Hello <img src=x onerror="alert(1)"> <script>alert(2)</script>');
    expect(c.querySelector('script')).toBeNull();
    expect(c.querySelector('img')?.getAttribute('onerror')).toBeNull();
  });

  it('renders plain text with no markdown features without crashing', () => {
    const c = getShadowlessContainer('just a sentence');
    expect(c.textContent).toContain('just a sentence');
    expect(c.querySelector('.agent-prose__scroll')).toBeNull();
    expect(c.querySelector('.agent-prose__code')).toBeNull();
  });

  it('handles an empty response', () => {
    const c = getShadowlessContainer('');
    expect(c.querySelector('.agent-prose')).toBeTruthy();
  });
});
