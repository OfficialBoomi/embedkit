import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, render } from '@testing-library/react';

// Mutable stand-in for the plugin context.
const ctx = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}));
const swal = vi.hoisted(() => ({
  fire: vi.fn(),
  toastFire: vi.fn(),
  mixin: vi.fn(),
}));
const bridge = vi.hoisted(() => ({
  injectSwalStyles: vi.fn(),
  removeSwalStyles: vi.fn(),
}));

vi.mock('../context/pluginContext', () => ({ usePlugin: () => ctx.value }));
vi.mock('sweetalert2', () => ({ default: { fire: swal.fire, mixin: swal.mixin, stopTimer: vi.fn(), resumeTimer: vi.fn() } }));
vi.mock('../utils/swalStyleBridge', () => bridge);
vi.mock('../utils/toastStyleBridge', () => ({
  injectToastStyles: vi.fn(),
  removeToastStyles: vi.fn(),
  resolveHost: () => null,
  readVar: (_c: unknown, _name: string, fallback: string) => fallback,
}));
vi.mock('../logger.service', () => ({ default: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { fireSwalDialog } from '../utils/swalConfirm';
import { DialogHandlerRegistry } from '../dialogs.service';
import ToastNotification from '../components/ui/ToastNotification';

const baseOpts = {
  intent: 'warning' as const,
  title: 'Are you sure?',
  description: 'This action cannot be undone.',
  showCancel: true,
  confirmLabel: 'Yes, delete it!',
  cancelLabel: 'No, cancel',
  allowOutsideClick: true,
  allowEscapeKey: true,
};

beforeEach(() => {
  DialogHandlerRegistry.clear();
  vi.clearAllMocks();
  swal.fire.mockResolvedValue({ isConfirmed: true, isDenied: false, isDismissed: false });
  swal.mixin.mockReturnValue({ fire: swal.toastFire });
  ctx.value = { hostId: 'host-1', componentKey: 'key-1', tenantId: 'tenant-1', boomiConfig: undefined };
});

describe('fireSwalDialog (built-in dialog, unchanged behaviour)', () => {
  it('uses the original defaults', async () => {
    const anchor = document.createElement('div');
    await expect(fireSwalDialog(baseOpts, { hostSlug: 'host-1', anchor })).resolves.toBe(true);
    const o = swal.fire.mock.calls[0][0];
    expect(o).toMatchObject({
      icon: 'warning',
      title: 'Are you sure?',
      text: 'This action cannot be undone.',
      showCancelButton: true,
      reverseButtons: false,
      confirmButtonText: 'Yes, delete it!',
      cancelButtonText: 'No, cancel',
      allowOutsideClick: true,
      allowEscapeKey: true,
      timer: undefined,
      timerProgressBar: false,
      showClass: { popup: 'swal2-show boomi-swal-in' },
      hideClass: { popup: 'swal2-hide boomi-swal-out' },
    });
    expect(o.customClass).toEqual({
      container: 'boomi-swal boomi-swal--host-1',
      popup: 'boomi-swal-popup',
      confirmButton: 'swal2-confirm',
      cancelButton: 'swal2-cancel',
      actions: 'boomi-swal-actions',
    });
  });

  it('honours the dialogs structural options', async () => {
    await fireSwalDialog(baseOpts, {
      hostSlug: 'h',
      anchor: null,
      dialogsConfig: { buttonOrder: 'confirm-first', showIcon: false, destructiveVariant: true },
    });
    const o = swal.fire.mock.calls[0][0];
    expect(o.reverseButtons).toBe(true);
    expect(o.icon).toBeUndefined();
    expect(o.customClass.confirmButton).toBe('swal2-confirm swal2-confirm--danger');
  });

  it('applies the danger variant to warning dialogs only', async () => {
    await fireSwalDialog({ ...baseOpts, intent: 'info' }, { hostSlug: 'h', anchor: null, dialogsConfig: { destructiveVariant: true } });
    expect(swal.fire.mock.calls[0][0].customClass.confirmButton).toBe('swal2-confirm');
  });

  it('passes the timer and shows the progress bar', async () => {
    await fireSwalDialog({ ...baseOpts, timerMs: 3000 }, { hostSlug: 'h', anchor: null });
    expect(swal.fire.mock.calls[0][0]).toMatchObject({ timer: 3000, timerProgressBar: true });
  });

  it('resolves false when the user cancels or dismisses', async () => {
    swal.fire.mockResolvedValueOnce({ isConfirmed: false, isDenied: false, isDismissed: true });
    await expect(fireSwalDialog(baseOpts, { hostSlug: 'h', anchor: null })).resolves.toBe(false);
  });

  it('injects and removes the theme styles around the dialog', async () => {
    const anchor = document.createElement('div');
    await fireSwalDialog(baseOpts, { hostSlug: 'host-1', anchor });
    const o = swal.fire.mock.calls[0][0];
    o.didOpen();
    expect(bridge.injectSwalStyles).toHaveBeenCalledWith(anchor, 'host-1');
    o.didClose();
    expect(bridge.removeSwalStyles).toHaveBeenCalledWith('host-1');
  });
});

describe('useDialogs routing', () => {
  // Import after the mocks so the hook sees the mocked context. The built-in dialog is spied on.
  async function loadHook() {
    const mod = await import('../hooks/useDialogs');
    return mod.useDialogs;
  }
  const confirmOpts = { title: 'Are you sure?', description: 'Cannot be undone.', confirmLabel: 'Yes' };

  it('shows the built-in dialog when no handler is registered', async () => {
    const useDialogs = await loadHook();
    const { result } = renderHook(() => useDialogs('Integrations'));
    await expect(result.current.confirm(confirmOpts)).resolves.toBe(true);
    expect(swal.fire).toHaveBeenCalledTimes(1);
    const o = swal.fire.mock.calls[0][0];
    expect(o).toMatchObject({ confirmButtonText: 'Yes', cancelButtonText: 'No, cancel', showCancelButton: true, icon: 'warning' });
  });

  it('calls the host handler with a fully resolved request and never shows the built-in dialog', async () => {
    const useDialogs = await loadHook();
    const seen: unknown[] = [];
    DialogHandlerRegistry.set({ confirm: (req) => { seen.push(req); return true; } });
    const { result } = renderHook(() => useDialogs('Integrations'));
    await expect(result.current.confirm({ ...confirmOpts, destructive: true })).resolves.toBe(true);
    expect(swal.fire).not.toHaveBeenCalled();
    const req = seen[0] as Record<string, unknown>;
    expect(req).toMatchObject({
      intent: 'warning',
      title: 'Are you sure?',
      description: 'Cannot be undone.',
      confirmLabel: 'Yes',
      cancelLabel: 'No, cancel',
      destructive: true,
      dismissible: { outsideClick: true, escapeKey: true },
      source: { hostId: 'host-1', componentKey: 'key-1', tenantId: 'tenant-1', componentName: 'Integrations' },
    });
    expect('timerMs' in req).toBe(false);
    expect(req.signal).toBeInstanceOf(AbortSignal);
  });

  it('defaults destructive to false and passes timerMs only when given', async () => {
    const useDialogs = await loadHook();
    const seen: Record<string, unknown>[] = [];
    DialogHandlerRegistry.set({ confirm: (req) => { seen.push(req as never); return false; } });
    const { result } = renderHook(() => useDialogs());
    await expect(result.current.confirm({ ...confirmOpts, timerMs: 4000 })).resolves.toBe(false);
    expect(seen[0].destructive).toBe(false);
    expect(seen[0].timerMs).toBe(4000);
  });

  it('keeps using the built-in confirm when only a toast handler is registered', async () => {
    const useDialogs = await loadHook();
    DialogHandlerRegistry.set({ toast: vi.fn() });
    const { result } = renderHook(() => useDialogs());
    await result.current.confirm(confirmOpts);
    expect(swal.fire).toHaveBeenCalledTimes(1);
  });

  it('routes alert to the host handler, or shows a single-button built-in dialog', async () => {
    const useDialogs = await loadHook();
    const { result } = renderHook(() => useDialogs('Agent'));
    await result.current.alert({ title: 'Heads up', description: 'Something happened.' });
    expect(swal.fire.mock.calls[0][0]).toMatchObject({ showCancelButton: false, confirmButtonText: 'OK', icon: 'info' });

    const seen: Record<string, unknown>[] = [];
    DialogHandlerRegistry.set({ alert: (req) => { seen.push(req as never); } });
    swal.fire.mockClear();
    await result.current.alert({ title: 'Heads up', description: 'Something happened.' });
    expect(swal.fire).not.toHaveBeenCalled();
    expect(seen[0]).toMatchObject({ intent: 'info', confirmLabel: 'OK', source: { componentName: 'Agent' } });
    expect('cancelLabel' in seen[0]).toBe(false);
  });
});

describe('ToastNotification routing', () => {
  it('sends the toast to the host handler once and skips the built-in toast', () => {
    const toast = vi.fn();
    DialogHandlerRegistry.set({ toast });
    render(<ToastNotification type="success" content="Saved." />);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0][0]).toMatchObject({
      intent: 'success',
      message: 'Saved.',
      timerMs: 2000,
      source: { hostId: 'host-1', componentKey: 'key-1', tenantId: 'tenant-1' },
    });
    expect(swal.mixin).not.toHaveBeenCalled();
  });

  it('does not notify the host again when the config changes, but does for a new message', () => {
    const toast = vi.fn();
    DialogHandlerRegistry.set({ toast });
    const { rerender } = render(<ToastNotification type="success" content="Saved." />);
    ctx.value = { ...ctx.value, boomiConfig: { components: {} } };
    rerender(<ToastNotification type="success" content="Saved." />);
    expect(toast).toHaveBeenCalledTimes(1);
    rerender(<ToastNotification type="error" content="Failed." />);
    expect(toast).toHaveBeenCalledTimes(2);
    expect(toast.mock.calls[1][0]).toMatchObject({ intent: 'error', message: 'Failed.' });
  });

  it('shows the built-in toast when no toast handler is registered', () => {
    render(<ToastNotification type="error" content="Failed." />);
    expect(swal.mixin).toHaveBeenCalledTimes(1);
    expect(swal.toastFire).toHaveBeenCalledWith({ icon: 'error', title: 'Failed.' });
  });

  it('survives a throwing toast handler', () => {
    DialogHandlerRegistry.set({ toast: () => { throw new Error('boom'); } });
    expect(() => render(<ToastNotification type="info" content="Hi" />)).not.toThrow();
    expect(swal.mixin).not.toHaveBeenCalled();
  });
});
