/**
 * @file useDialogs.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Imperative confirm and alert dialogs for EmbedKit components.
 *
 * `await confirm({...})` resolves `true` only when the user (or the host's own
 * dialog, via `dialogHandlers`) says yes. When the host has registered a handler
 * it is used and the built-in dialog is never shown. Otherwise the built-in
 * SweetAlert2 dialog is shown, exactly as before.
 *
 * Call it from an event handler. Unlike rendering a dialog component, it cannot
 * re-open because a parent re-rendered, which matters because a re-open would
 * call the host's handler again.
 */

import { useCallback } from 'react';
import { usePlugin } from '../context/pluginContext';
import { slugifyHostId } from '../utils/text';
import { fireSwalDialog } from '../utils/swalConfirm';
import { hasHandler, requestAlert, requestConfirm } from '../dialogs.service';
import type { DialogIntent, DialogSource } from '../types/dialog-handlers';

export type ConfirmOptions = {
  title: string;
  description: string;
  confirmLabel: string;
  /** Default 'No, cancel'. */
  cancelLabel?: string;
  /** Default 'warning'. */
  intent?: DialogIntent;
  /** True for actions that remove or disconnect something. Default false. */
  destructive?: boolean;
  /** Default true. */
  allowOutsideClick?: boolean;
  /** Default true. */
  allowEscapeKey?: boolean;
  timerMs?: number;
};

export type AlertOptions = {
  title: string;
  description: string;
  /** Default 'OK'. */
  confirmLabel?: string;
  /** Default 'info'. */
  intent?: DialogIntent;
  allowOutsideClick?: boolean;
  allowEscapeKey?: boolean;
  timerMs?: number;
};

export type UseDialogs = {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  alert: (opts: AlertOptions) => Promise<void>;
};

/** `componentName` is passed to the host's handler as `source.componentName`. */
export function useDialogs(componentName?: string): UseDialogs {
  const { hostId, componentKey, tenantId, boomiConfig } = usePlugin();
  const dialogsConfig = boomiConfig?.dialogs;

  const confirm = useCallback(
    async (opts: ConfirmOptions): Promise<boolean> => {
      const intent = opts.intent ?? 'warning';
      const cancelLabel = opts.cancelLabel ?? 'No, cancel';
      const allowOutsideClick = opts.allowOutsideClick ?? true;
      const allowEscapeKey = opts.allowEscapeKey ?? true;

      if (hasHandler('confirm')) {
        const source: DialogSource = {
          hostId: hostId ?? '',
          componentKey: componentKey ?? '',
          tenantId,
          componentName,
        };
        return requestConfirm({
          intent,
          title: opts.title,
          description: opts.description,
          confirmLabel: opts.confirmLabel,
          cancelLabel,
          destructive: opts.destructive ?? false,
          dismissible: { outsideClick: allowOutsideClick, escapeKey: allowEscapeKey },
          ...(opts.timerMs !== undefined ? { timerMs: opts.timerMs } : {}),
          source,
        });
      }

      return fireSwalDialog(
        {
          intent,
          title: opts.title,
          description: opts.description,
          showCancel: true,
          confirmLabel: opts.confirmLabel,
          cancelLabel,
          allowOutsideClick,
          allowEscapeKey,
          timerMs: opts.timerMs,
        },
        { hostSlug: slugifyHostId(hostId), dialogsConfig, anchor: findAnchor(hostId) }
      );
    },
    [hostId, componentKey, tenantId, componentName, dialogsConfig]
  );

  const alert = useCallback(
    async (opts: AlertOptions): Promise<void> => {
      const intent = opts.intent ?? 'info';
      const confirmLabel = opts.confirmLabel ?? 'OK';
      const allowOutsideClick = opts.allowOutsideClick ?? true;
      const allowEscapeKey = opts.allowEscapeKey ?? true;

      if (hasHandler('alert')) {
        const source: DialogSource = {
          hostId: hostId ?? '',
          componentKey: componentKey ?? '',
          tenantId,
          componentName,
        };
        return requestAlert({
          intent,
          title: opts.title,
          description: opts.description,
          confirmLabel,
          dismissible: { outsideClick: allowOutsideClick, escapeKey: allowEscapeKey },
          ...(opts.timerMs !== undefined ? { timerMs: opts.timerMs } : {}),
          source,
        });
      }

      await fireSwalDialog(
        {
          intent,
          title: opts.title,
          description: opts.description,
          showCancel: false,
          confirmLabel,
          cancelLabel: 'Cancel',
          allowOutsideClick,
          allowEscapeKey,
          timerMs: opts.timerMs,
        },
        { hostSlug: slugifyHostId(hostId), dialogsConfig, anchor: findAnchor(hostId) }
      );
    },
    [hostId, componentKey, tenantId, componentName, dialogsConfig]
  );

  return { confirm, alert };
}

/**
 * An element inside the plugin's shadow root. The style bridge walks up from it to
 * the shadow root to read the theme variables. Returns null when there is no
 * mounted host element (for example under EmbedKitProvider), in which case the
 * dialog renders unthemed, as it did before.
 */
function findAnchor(hostId: string | undefined): HTMLElement | null {
  if (!hostId || typeof document === 'undefined') return null;
  return document.getElementById(hostId)?.shadowRoot?.getElementById('boomi-root') ?? null;
}
