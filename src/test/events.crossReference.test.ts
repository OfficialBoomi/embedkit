/**
 * @file events.crossReference.test.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The two cross reference table events reach subscribers with the standard envelope, and their
 * payloads are ids and counts only.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  BoomiEvents,
  BOOMI_EVENT_NAME,
  emitEmbedKitEvent,
  type CrossReferenceTableResetEventData,
  type CrossReferenceTableSavedEventData,
  type EmbedKitEvent,
} from '../events.service';

const source = { integrationPackInstanceId: 'ipi-1', environmentId: 'env-1', componentKey: 'key-1' };

describe('crossReference.table events', () => {
  const offs: Array<() => void> = [];
  afterEach(() => {
    while (offs.length) offs.pop()?.();
  });

  it('crossReference.table.saved goes to a subscriber of its type, in the standard envelope', () => {
    const seen: EmbedKitEvent[] = [];
    offs.push(BoomiEvents.on('crossReference.table.saved', (e) => seen.push(e)));
    const data: CrossReferenceTableSavedEventData = {
      integrationPackInstanceId: 'ipi-1',
      environmentId: 'env-1',
      processId: 'proc-1',
      tableId: 'table-1',
      rowCount: 12,
      changedRowCount: 3,
    };
    emitEmbedKitEvent('crossReference.table.saved', source, data);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ type: 'crossReference.table.saved', outcome: 'success', source, data });
    expect(typeof seen[0].timestamp).toBe('string');
  });

  it('changedRowCount is optional', () => {
    const seen: EmbedKitEvent[] = [];
    offs.push(BoomiEvents.on('crossReference.table.saved', (e) => seen.push(e)));
    const data: CrossReferenceTableSavedEventData = {
      integrationPackInstanceId: 'ipi-1',
      environmentId: 'env-1',
      processId: 'proc-1',
      tableId: 'table-1',
      rowCount: 0,
    };
    emitEmbedKitEvent('crossReference.table.saved', source, data);
    expect(seen[0].data).toEqual(data);
  });

  it('crossReference.table.reset goes to a subscriber of its type and not to the other one', () => {
    const reset = vi.fn();
    const saved = vi.fn();
    offs.push(BoomiEvents.on('crossReference.table.reset', reset));
    offs.push(BoomiEvents.on('crossReference.table.saved', saved));
    const data: CrossReferenceTableResetEventData = {
      integrationPackInstanceId: 'ipi-1',
      environmentId: 'env-1',
      processId: 'proc-1',
      tableId: 'table-1',
    };
    emitEmbedKitEvent('crossReference.table.reset', source, data);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(reset.mock.calls[0][0]).toMatchObject({ type: 'crossReference.table.reset', data });
    expect(saved).not.toHaveBeenCalled();
  });

  it('both reach a wildcard subscriber and the DOM event for plain script pages', () => {
    const all = vi.fn();
    const dom = vi.fn();
    offs.push(BoomiEvents.on('*', all));
    window.addEventListener(BOOMI_EVENT_NAME, dom);
    offs.push(() => window.removeEventListener(BOOMI_EVENT_NAME, dom));
    emitEmbedKitEvent('crossReference.table.saved', source, { processId: 'p', tableId: 't', rowCount: 1 });
    emitEmbedKitEvent('crossReference.table.reset', source, { processId: 'p', tableId: 't' });
    expect(all.mock.calls.map((c) => c[0].type)).toEqual(['crossReference.table.saved', 'crossReference.table.reset']);
    expect(dom.mock.calls.map((c) => (c[0] as CustomEvent).detail.type)).toEqual([
      'crossReference.table.saved',
      'crossReference.table.reset',
    ]);
  });
});
