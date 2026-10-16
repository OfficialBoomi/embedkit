/**
 * @file dialogs.service.ts
 * @module dialogs
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Lets a host replace EmbedKit's built-in confirm, alert and toast dialogs with
 * its own UI. The host registers handlers through `BoomiPlugin({ dialogHandlers })`,
 * `window.BoomiEmbed.dialogHandlers` (CDN), or `DialogHandlerRegistry.set()` at
 * any time without a page reload.
 *
 * This is deliberately separate from the event bus in `events.service.ts`:
 *
 * - Events are a broadcast. Any number of listeners, return values ignored,
 *   nothing waits.
 * - A dialog handler is a single owner that EmbedKit waits for. Its answer
 *   decides what EmbedKit does next.
 *
 * Failure rules (a handler must never crash or hang EmbedKit):
 *
 * - `confirm` proceeds only on a strict `true`. `false`, `undefined`, any other
 *   value, a throw, a rejected promise and a timeout all cancel.
 * - Once a handler is registered, the built-in dialog is never shown as a
 *   fallback.
 * - A handler that never answers is abandoned after `timeoutMs` (default 120 s).
 *   The request's `signal` is aborted so the host can close its own dialog, and a
 *   late answer is ignored.
 * - `alert` failures count as acknowledged. `toast` failures are logged and
 *   swallowed.
 */

import logger from './logger.service';
import type {
  AlertRequest,
  ConfirmRequest,
  DialogHandlers,
  ToastRequest,
} from './types/dialog-handlers';

const DEFAULT_TIMEOUT_MS = 120_000;
/** The longest delay a browser timer accepts (about 24.8 days). Larger values fire immediately. */
const MAX_TIMEOUT_MS = 2_147_483_647;

/** What a caller supplies. The service adds `id` and `signal`. */
export type ConfirmInput = Omit<ConfirmRequest, 'id' | 'signal'>;
export type AlertInput = Omit<AlertRequest, 'id' | 'signal'>;
export type ToastInput = Omit<ToastRequest, 'id'>;

type DialogKind = 'confirm' | 'alert' | 'toast';

let handlers: DialogHandlers | null = null;
let counter = 0;

/** Requests still waiting on a handler. Each entry cancels its request and aborts its signal. */
const pending = new Map<string, () => void>();

function nextId(): string {
  counter += 1;
  return `dlg-${Date.now().toString(36)}-${counter.toString(36)}`;
}

function resolveTimeoutMs(h: DialogHandlers | null): number {
  const t = h?.timeoutMs;
  return typeof t === 'number' && Number.isFinite(t) && t > 0 ? Math.min(t, MAX_TIMEOUT_MS) : DEFAULT_TIMEOUT_MS;
}

function cancelAllPending(): void {
  for (const cancel of Array.from(pending.values())) cancel();
}

/**
 * Runtime registry for dialog handlers. Handlers are read when a dialog is
 * requested, never captured at mount, so changes take effect immediately.
 */
export const DialogHandlerRegistry = {
  /**
   * Registers handlers, replacing any previous set. Passing `null` or `undefined`
   * is the same as `clear()`. Replacing handlers does not cancel a dialog that is
   * already open.
   */
  set(next: DialogHandlers | null | undefined): void {
    if (!next) {
      DialogHandlerRegistry.clear();
      return;
    }
    handlers = next;
  },

  /** The currently registered handlers, or `null` when the built-in dialogs are in use. */
  get(): DialogHandlers | null {
    return handlers;
  },

  /**
   * Removes all handlers and returns to the built-in dialogs. Requests that are
   * still waiting on a handler are cancelled and their `signal` is aborted.
   */
  clear(): void {
    handlers = null;
    cancelAllPending();
  },
};

/** True when a handler of this kind is registered. */
export function hasHandler(kind: DialogKind): boolean {
  return typeof handlers?.[kind] === 'function';
}

function awaitHandler<T>(opts: {
  kind: 'confirm' | 'alert';
  id: string;
  controller: AbortController;
  timeoutMs: number;
  invoke: () => unknown;
  toResult: (value: unknown) => T;
  fallback: T;
}): Promise<T> {
  const { kind, id, controller, timeoutMs, invoke, toResult, fallback } = opts;

  return new Promise<T>((resolve) => {
    // First caller wins. After it runs the entry is gone, so a late answer,
    // a late rejection or a second cancel is ignored.
    const finish = (value: T, abort: boolean) => {
      if (!pending.has(id)) return;
      pending.delete(id);
      clearTimeout(timer);
      if (abort) controller.abort();
      resolve(value);
    };

    const timer = setTimeout(() => {
      if (!pending.has(id)) return;
      logger.error(`[dialogs] ${kind} ${id} abandoned after ${timeoutMs}ms without an answer`);
      finish(fallback, true);
    }, timeoutMs);

    pending.set(id, () => finish(fallback, true));

    try {
      Promise.resolve(invoke()).then(
        (value) => finish(toResult(value), false),
        (err) => {
          if (!pending.has(id)) return;
          logger.error({ err }, `[dialogs] ${kind} ${id} handler rejected`);
          finish(fallback, false);
        }
      );
    } catch (err) {
      logger.error({ err }, `[dialogs] ${kind} ${id} handler threw`);
      finish(fallback, false);
    }
  });
}

/**
 * Asks the registered `confirm` handler. Resolves `true` only when the handler
 * answers a strict `true`. Resolves `false` for every other outcome, including
 * when no `confirm` handler is registered.
 */
export function requestConfirm(input: ConfirmInput): Promise<boolean> {
  const handler = handlers?.confirm;
  if (typeof handler !== 'function') return Promise.resolve(false);

  const id = nextId();
  const controller = new AbortController();
  const req: ConfirmRequest = { id, ...input, signal: controller.signal };

  return awaitHandler<boolean>({
    kind: 'confirm',
    id,
    controller,
    timeoutMs: resolveTimeoutMs(handlers),
    invoke: () => handler(req),
    toResult: (value) => value === true,
    fallback: false,
  });
}

/**
 * Asks the registered `alert` handler and resolves once the user has
 * acknowledged. Always resolves: a failure or timeout counts as acknowledged.
 */
export function requestAlert(input: AlertInput): Promise<void> {
  const handler = handlers?.alert;
  if (typeof handler !== 'function') return Promise.resolve();

  const id = nextId();
  const controller = new AbortController();
  const req: AlertRequest = { id, ...input, signal: controller.signal };

  return awaitHandler<void>({
    kind: 'alert',
    id,
    controller,
    timeoutMs: resolveTimeoutMs(handlers),
    invoke: () => handler(req),
    toResult: () => undefined,
    fallback: undefined,
  });
}

/** Hands a toast to the registered `toast` handler. Never awaited, never throws. */
export function notifyToast(input: ToastInput): void {
  const handler = handlers?.toast;
  if (typeof handler !== 'function') return;

  const req: ToastRequest = { id: nextId(), ...input };
  try {
    const result = handler(req) as unknown;
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      (result as Promise<unknown>).then(undefined, (err) => {
        logger.error({ err }, `[dialogs] toast ${req.id} handler rejected`);
      });
    }
  } catch (err) {
    logger.error({ err }, `[dialogs] toast ${req.id} handler threw`);
  }
}
