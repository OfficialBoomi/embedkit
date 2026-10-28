/**
 * @file dialog-handlers.d.ts
 * @license BSD-2-Clause
 *
 * Optional host-supplied handlers for EmbedKit's confirm, alert, session-error and toast
 * dialogs. When a handler is registered, EmbedKit calls it instead of rendering
 * its built-in SweetAlert dialog. With no handler registered, nothing changes.
 *
 * Unlike events (`onEvent`), a dialog handler is awaited: EmbedKit's next action
 * depends on the answer.
 */

/** Semantic type of a dialog. Selects the default icon and color in the built-in UI. */
export type DialogIntent = 'error' | 'warning' | 'success' | 'info' | 'question';

/** Where a dialog request came from. */
export type DialogSource = {
  hostId: string;
  componentKey: string;
  tenantId?: string;
  /** The component that raised the dialog, for example 'Integrations' or 'Agent'. */
  componentName?: string;
};

/**
 * A request to confirm an action. Every field is fully resolved before the host
 * sees it: EmbedKit never hands the host an `undefined` for anything it has to render.
 */
export type ConfirmRequest = {
  /** Unique per request. Also used in log lines. */
  id: string;
  intent: DialogIntent;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  /** True when the action removes or disconnects something. A hint for styling the confirm button. */
  destructive: boolean;
  dismissible: { outsideClick: boolean; escapeKey: boolean };
  /** Optional auto-close timer in milliseconds. */
  timerMs?: number;
  /** Aborted when EmbedKit stops waiting (timeout or registry cleared), so the host can close its own dialog. */
  signal: AbortSignal;
  source: DialogSource;
};

/** A request to show a message the user acknowledges. */
export type AlertRequest = Omit<ConfirmRequest, 'cancelLabel' | 'destructive'>;

/**
 * Which part of the UI hit the session problem.
 * - `auth`: any component that uses the standard error dialog or notice (Integrations, Connections, Schedules and so on).
 * - `maps`: the Map Fields views.
 * - `agent-chat`: the agent chat stream.
 */
export type SessionErrorOrigin = 'auth' | 'maps' | 'agent-chat';

/**
 * A request to show that the session has ended or timed out. `title` and
 * `description` are fully resolved: `description` is the configured message
 * (`boomiConfig.messages.sessionEnded`) or EmbedKit's default, and the host may show it
 * or its own text.
 */
export type SessionErrorRequest = AlertRequest & {
  /** Which part of the UI reported the problem. */
  origin: SessionErrorOrigin;
  /** Machine-readable reason, for example `MISSING_BEARER`, `TOKEN_REJECTED` or `TOKEN_EXPIRED`. */
  code: string;
};

/** A short, non-blocking message. */
export type ToastRequest = {
  id: string;
  intent: DialogIntent;
  message: string;
  timerMs: number;
  source: DialogSource;
};

export type DialogHandlers = {
  /**
   * Return strictly `true` to proceed. Anything else (`false`, `undefined`,
   * a throw, a rejected promise, a timeout) is treated as cancel.
   */
  confirm?: (req: ConfirmRequest) => Promise<boolean> | boolean;

  /** Resolve (or return) when the user has acknowledged the message. A failure is treated as acknowledged. */
  alert?: (req: AlertRequest) => Promise<void> | void;

  /**
   * Replaces the dialog EmbedKit shows when the session has ended or timed out. Resolve (or
   * return) when the user has acknowledged it. A failure is treated as acknowledged. Called
   * once per episode: it is called again only after a new session has started.
   * When registered, EmbedKit does not show its built-in session message.
   */
  sessionError?: (req: SessionErrorRequest) => Promise<void> | void;

  /** Fire-and-forget: never awaited, never gates anything. */
  toast?: (req: ToastRequest) => void;

  /** Maximum wait before a pending confirm, alert or sessionError is abandoned. Default 120000. */
  timeoutMs?: number;
};
