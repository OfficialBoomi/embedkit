import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../logger.service', () => ({
  default: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import logger from '../logger.service';
import {
  DialogHandlerRegistry,
  requestConfirm,
  requestAlert,
  notifyToast,
  hasHandler,
} from '../dialogs.service';
import type { ConfirmRequest, AlertRequest, ToastRequest } from '../types/dialog-handlers';

const source = { hostId: 'host-1', componentKey: 'key-1', tenantId: 'tenant-1', componentName: 'Integrations' };

const confirmInput = () => ({
  intent: 'warning' as const,
  title: 'Are you sure?',
  description: 'This action cannot be undone.',
  confirmLabel: 'Yes, delete it!',
  cancelLabel: 'No, cancel',
  destructive: true,
  dismissible: { outsideClick: true, escapeKey: true },
  source,
});

const alertInput = () => ({
  intent: 'info' as const,
  title: 'Heads up',
  description: 'Something happened.',
  confirmLabel: 'OK',
  dismissible: { outsideClick: true, escapeKey: true },
  source,
});

const toastInput = () => ({ intent: 'success' as const, message: 'Saved.', timerMs: 2000, source });

/** Lets queued promise callbacks run without advancing fake timers. */
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(() => {
  vi.useFakeTimers();
  DialogHandlerRegistry.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  DialogHandlerRegistry.clear();
  vi.useRealTimers();
});

describe('DialogHandlerRegistry', () => {
  it('starts empty', () => {
    expect(DialogHandlerRegistry.get()).toBeNull();
    expect(hasHandler('confirm')).toBe(false);
    expect(hasHandler('alert')).toBe(false);
    expect(hasHandler('toast')).toBe(false);
  });

  it('set() registers and get() returns the same object', () => {
    const handlers = { confirm: () => true };
    DialogHandlerRegistry.set(handlers);
    expect(DialogHandlerRegistry.get()).toBe(handlers);
    expect(hasHandler('confirm')).toBe(true);
    expect(hasHandler('alert')).toBe(false);
  });

  it('set(null) and set(undefined) clear the registry', () => {
    DialogHandlerRegistry.set({ confirm: () => true });
    DialogHandlerRegistry.set(null);
    expect(DialogHandlerRegistry.get()).toBeNull();
    DialogHandlerRegistry.set({ confirm: () => true });
    DialogHandlerRegistry.set(undefined);
    expect(DialogHandlerRegistry.get()).toBeNull();
  });

  it('set() replaces rather than stacks', () => {
    const first = vi.fn(() => true);
    const second = vi.fn(() => true);
    DialogHandlerRegistry.set({ confirm: first });
    DialogHandlerRegistry.set({ confirm: second });
    return requestConfirm(confirmInput()).then(() => {
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    });
  });
});

describe('requestConfirm: handler result', () => {
  it('proceeds on a strict true (sync)', async () => {
    DialogHandlerRegistry.set({ confirm: () => true });
    await expect(requestConfirm(confirmInput())).resolves.toBe(true);
  });

  it('proceeds on a strict true (promise)', async () => {
    DialogHandlerRegistry.set({ confirm: async () => true });
    await expect(requestConfirm(confirmInput())).resolves.toBe(true);
  });

  it.each([
    ['false', false],
    ['undefined', undefined],
    ['null', null],
    ["'yes'", 'yes'],
    ['1', 1],
    ['{}', {}],
    ['"true" string', 'true'],
  ])('cancels on %s (sync)', async (_label, value) => {
    DialogHandlerRegistry.set({ confirm: (() => value) as never });
    await expect(requestConfirm(confirmInput())).resolves.toBe(false);
  });

  it.each([
    ['false', false],
    ['undefined', undefined],
    ['null', null],
    ["'yes'", 'yes'],
    ['1', 1],
  ])('cancels on %s (promise)', async (_label, value) => {
    DialogHandlerRegistry.set({ confirm: (async () => value) as never });
    await expect(requestConfirm(confirmInput())).resolves.toBe(false);
  });

  it('cancels on a synchronous throw and logs the request id', async () => {
    DialogHandlerRegistry.set({
      confirm: () => {
        throw new Error('boom');
      },
    });
    await expect(requestConfirm(confirmInput())).resolves.toBe(false);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls[0])).toMatch(/dlg-/);
  });

  it('cancels on a rejected promise and logs the request id', async () => {
    DialogHandlerRegistry.set({ confirm: () => Promise.reject(new Error('nope')) });
    await expect(requestConfirm(confirmInput())).resolves.toBe(false);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls[0])).toMatch(/dlg-/);
  });

  it('cancels when no confirm handler is registered', async () => {
    DialogHandlerRegistry.set({ alert: () => undefined });
    await expect(requestConfirm(confirmInput())).resolves.toBe(false);
  });
});

describe('requestConfirm: request shape', () => {
  it('hands the host a fully resolved request with no undefined required fields', async () => {
    let seen: ConfirmRequest | undefined;
    DialogHandlerRegistry.set({
      confirm: (req) => {
        seen = req;
        return true;
      },
    });
    await requestConfirm(confirmInput());
    expect(seen).toBeDefined();
    const req = seen as ConfirmRequest;
    for (const key of ['id', 'intent', 'title', 'description', 'confirmLabel', 'cancelLabel', 'destructive', 'dismissible', 'signal', 'source'] as const) {
      expect(req[key], key).not.toBeUndefined();
    }
    expect(req.id).toMatch(/^dlg-/);
    expect(typeof req.destructive).toBe('boolean');
    expect(req.signal).toBeInstanceOf(AbortSignal);
    expect(req.signal.aborted).toBe(false);
    expect(req.source).toEqual(source);
    expect(req.dismissible).toEqual({ outsideClick: true, escapeKey: true });
  });

  it('gives every request its own id', async () => {
    const ids: string[] = [];
    DialogHandlerRegistry.set({
      confirm: (req) => {
        ids.push(req.id);
        return true;
      },
    });
    await requestConfirm(confirmInput());
    await requestConfirm(confirmInput());
    await requestConfirm(confirmInput());
    expect(new Set(ids).size).toBe(3);
  });

  it('does not abort the signal when the handler answers normally', async () => {
    let signal: AbortSignal | undefined;
    DialogHandlerRegistry.set({
      confirm: (req) => {
        signal = req.signal;
        return true;
      },
    });
    await requestConfirm(confirmInput());
    expect(signal?.aborted).toBe(false);
  });

  it('passes timerMs through only when set', async () => {
    let seen: ConfirmRequest | undefined;
    DialogHandlerRegistry.set({
      confirm: (req) => {
        seen = req;
        return true;
      },
    });
    await requestConfirm({ ...confirmInput(), timerMs: 5000 });
    expect(seen?.timerMs).toBe(5000);
  });
});

describe('requestConfirm: timeout, abort and late resolve', () => {
  it('cancels a hanging handler at the default 120000 ms and aborts the signal', async () => {
    let signal: AbortSignal | undefined;
    DialogHandlerRegistry.set({
      confirm: (req) => {
        signal = req.signal;
        return new Promise<boolean>(() => undefined);
      },
    });
    let result: boolean | undefined;
    void requestConfirm(confirmInput()).then((r) => {
      result = r;
    });
    await vi.advanceTimersByTimeAsync(119_999);
    expect(result).toBeUndefined();
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(result).toBe(false);
    expect(signal?.aborted).toBe(true);
  });

  it('honours a custom timeoutMs and logs the request as abandoned', async () => {
    DialogHandlerRegistry.set({ confirm: () => new Promise<boolean>(() => undefined), timeoutMs: 3000 });
    let result: boolean | undefined;
    void requestConfirm(confirmInput()).then((r) => {
      result = r;
    });
    await vi.advanceTimersByTimeAsync(2999);
    expect(result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(result).toBe(false);
    expect(logger.error).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(vi.mocked(logger.error).mock.calls[0]);
    expect(logged).toMatch(/abandoned/i);
    expect(logged).toMatch(/dlg-/);
  });

  it.each([
    ['0', 0],
    ['negative', -5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['a string', '3000'],
  ])('falls back to 120000 ms when timeoutMs is %s', async (_label, value) => {
    DialogHandlerRegistry.set({ confirm: () => new Promise<boolean>(() => undefined), timeoutMs: value as never });
    let result: boolean | undefined;
    void requestConfirm(confirmInput()).then((r) => {
      result = r;
    });
    await vi.advanceTimersByTimeAsync(119_999);
    expect(result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(result).toBe(false);
  });

  it('ignores a late true after the timeout (no delayed action)', async () => {
    let resolveLate!: (v: boolean) => void;
    DialogHandlerRegistry.set({
      confirm: () => new Promise<boolean>((res) => (resolveLate = res)),
      timeoutMs: 3000,
    });
    const results: boolean[] = [];
    void requestConfirm(confirmInput()).then((r) => results.push(r));
    await vi.advanceTimersByTimeAsync(3000);
    expect(results).toEqual([false]);
    resolveLate(true);
    await flush();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(results).toEqual([false]);
  });

  it('ignores a late rejection after the timeout without logging a second error', async () => {
    let rejectLate!: (e: unknown) => void;
    DialogHandlerRegistry.set({
      confirm: () => new Promise<boolean>((_res, rej) => (rejectLate = rej)),
      timeoutMs: 3000,
    });
    void requestConfirm(confirmInput());
    await vi.advanceTimersByTimeAsync(3000);
    expect(logger.error).toHaveBeenCalledTimes(1);
    rejectLate(new Error('late'));
    await flush();
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('leaves no pending timer behind once the handler has answered', async () => {
    DialogHandlerRegistry.set({ confirm: async () => true });
    await requestConfirm(confirmInput());
    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaves no pending timer behind after a throw', async () => {
    DialogHandlerRegistry.set({
      confirm: () => {
        throw new Error('x');
      },
    });
    await requestConfirm(confirmInput());
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('requestConfirm: runtime registry changes', () => {
  it('clear() while waiting cancels the request and aborts its signal', async () => {
    let signal: AbortSignal | undefined;
    DialogHandlerRegistry.set({
      confirm: (req) => {
        signal = req.signal;
        return new Promise<boolean>(() => undefined);
      },
    });
    let result: boolean | undefined;
    void requestConfirm(confirmInput()).then((r) => {
      result = r;
    });
    await flush();
    DialogHandlerRegistry.clear();
    await flush();
    expect(result).toBe(false);
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('set(null) while waiting behaves like clear()', async () => {
    let signal: AbortSignal | undefined;
    DialogHandlerRegistry.set({
      confirm: (req) => {
        signal = req.signal;
        return new Promise<boolean>(() => undefined);
      },
    });
    let result: boolean | undefined;
    void requestConfirm(confirmInput()).then((r) => {
      result = r;
    });
    await flush();
    DialogHandlerRegistry.set(null);
    await flush();
    expect(result).toBe(false);
    expect(signal?.aborted).toBe(true);
  });

  it('set(newHandlers) while waiting does not cancel the open request', async () => {
    let resolveFirst!: (v: boolean) => void;
    let signal: AbortSignal | undefined;
    DialogHandlerRegistry.set({
      confirm: (req) => {
        signal = req.signal;
        return new Promise<boolean>((res) => (resolveFirst = res));
      },
    });
    let result: boolean | undefined;
    void requestConfirm(confirmInput()).then((r) => {
      result = r;
    });
    await flush();
    DialogHandlerRegistry.set({ confirm: () => false });
    await flush();
    expect(result).toBeUndefined();
    expect(signal?.aborted).toBe(false);
    resolveFirst(true);
    await flush();
    expect(result).toBe(true);
  });

  it('reads the handler at call time, not at registration time', async () => {
    const first = vi.fn(() => true);
    const second = vi.fn(() => false);
    DialogHandlerRegistry.set({ confirm: first });
    await expect(requestConfirm(confirmInput())).resolves.toBe(true);
    DialogHandlerRegistry.set({ confirm: second });
    await expect(requestConfirm(confirmInput())).resolves.toBe(false);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('returns to the unregistered state after clear()', async () => {
    DialogHandlerRegistry.set({ confirm: () => true });
    expect(hasHandler('confirm')).toBe(true);
    DialogHandlerRegistry.clear();
    expect(hasHandler('confirm')).toBe(false);
  });
});

describe('requestAlert', () => {
  it('resolves after the handler resolves and passes a resolved request', async () => {
    let seen: AlertRequest | undefined;
    DialogHandlerRegistry.set({
      alert: async (req) => {
        seen = req;
      },
    });
    await expect(requestAlert(alertInput())).resolves.toBeUndefined();
    const req = seen as AlertRequest;
    expect(req.id).toMatch(/^dlg-/);
    expect(req.signal).toBeInstanceOf(AbortSignal);
    expect((req as Record<string, unknown>).cancelLabel).toBeUndefined();
    expect((req as Record<string, unknown>).destructive).toBeUndefined();
    expect(req.confirmLabel).toBe('OK');
  });

  it('treats a throw as acknowledged and logs it', async () => {
    DialogHandlerRegistry.set({
      alert: () => {
        throw new Error('boom');
      },
    });
    await expect(requestAlert(alertInput())).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('treats a rejection as acknowledged and logs it', async () => {
    DialogHandlerRegistry.set({ alert: () => Promise.reject(new Error('nope')) });
    await expect(requestAlert(alertInput())).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('resolves at the timeout for a hanging handler and aborts the signal', async () => {
    let signal: AbortSignal | undefined;
    DialogHandlerRegistry.set({
      alert: (req) => {
        signal = req.signal;
        return new Promise<void>(() => undefined);
      },
      timeoutMs: 3000,
    });
    let done = false;
    void requestAlert(alertInput()).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(2999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
    expect(signal?.aborted).toBe(true);
  });

  it('clear() while waiting resolves the alert and aborts its signal', async () => {
    let signal: AbortSignal | undefined;
    DialogHandlerRegistry.set({
      alert: (req) => {
        signal = req.signal;
        return new Promise<void>(() => undefined);
      },
    });
    let done = false;
    void requestAlert(alertInput()).then(() => {
      done = true;
    });
    await flush();
    DialogHandlerRegistry.clear();
    await flush();
    expect(done).toBe(true);
    expect(signal?.aborted).toBe(true);
  });

  it('resolves without a handler', async () => {
    await expect(requestAlert(alertInput())).resolves.toBeUndefined();
  });
});

describe('notifyToast', () => {
  it('calls the handler once with an id and the input fields', () => {
    const toast = vi.fn();
    DialogHandlerRegistry.set({ toast });
    notifyToast(toastInput());
    expect(toast).toHaveBeenCalledTimes(1);
    const req = toast.mock.calls[0][0] as ToastRequest;
    expect(req.id).toMatch(/^dlg-/);
    expect(req).toMatchObject({ intent: 'success', message: 'Saved.', timerMs: 2000, source });
  });

  it('swallows a synchronous throw and logs it', () => {
    DialogHandlerRegistry.set({
      toast: () => {
        throw new Error('boom');
      },
    });
    expect(() => notifyToast(toastInput())).not.toThrow();
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('swallows a rejected promise and logs it', async () => {
    DialogHandlerRegistry.set({ toast: (() => Promise.reject(new Error('nope'))) as never });
    expect(() => notifyToast(toastInput())).not.toThrow();
    await flush();
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a toast handler', () => {
    DialogHandlerRegistry.set({ confirm: () => true });
    expect(() => notifyToast(toastInput())).not.toThrow();
    expect(logger.error).not.toHaveBeenCalled();
  });
});

describe('timeoutMs upper limit', () => {
  it('caps a huge timeoutMs instead of firing immediately', async () => {
    DialogHandlerRegistry.set({ confirm: () => new Promise<boolean>(() => undefined), timeoutMs: 3e9 });
    let result: boolean | undefined;
    void requestConfirm(confirmInput()).then((r) => {
      result = r;
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(2_147_483_647 - 1000 - 1);
    expect(result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(result).toBe(false);
  });
});
