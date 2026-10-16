/**
 * @file swalConfirm.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * EmbedKit's built-in confirm and alert dialog, rendered with SweetAlert2. This
 * is what a user sees when the host has not registered a dialog handler. It
 * honors the structural `dialogs` options (button order, icon, destructive
 * variant) and the themed CSS variables through the style bridge.
 */

import Swal from 'sweetalert2';
import type { DialogsConfig } from '../types/plugin-ui.config';
import type { DialogIntent } from '../types/dialog-handlers';
import { injectSwalStyles, removeSwalStyles } from './swalStyleBridge';

export type SwalDialogOptions = {
  intent: DialogIntent;
  title: string;
  description: string;
  showCancel: boolean;
  confirmLabel: string;
  cancelLabel: string;
  allowOutsideClick: boolean;
  allowEscapeKey: boolean;
  timerMs?: number;
};

export type SwalDialogContext = {
  hostSlug: string;
  dialogsConfig?: DialogsConfig;
  /** An element inside the plugin's shadow root, used to read the theme variables. */
  anchor: HTMLElement | null;
};

/** Shows the built-in dialog. Resolves `true` when the user confirms, `false` otherwise. */
export async function fireSwalDialog(opts: SwalDialogOptions, ctx: SwalDialogContext): Promise<boolean> {
  const { hostSlug, dialogsConfig, anchor } = ctx;
  // Defaults match the original behavior exactly: cancel-first order, icon shown,
  // primary-colored confirm button.
  const reverseButtons = dialogsConfig?.buttonOrder === 'confirm-first';
  const showIcon = dialogsConfig?.showIcon !== false;
  const isDestructive = Boolean(dialogsConfig?.destructiveVariant) && opts.intent === 'warning';

  const result = await Swal.fire({
    icon: showIcon ? opts.intent : undefined,
    title: opts.title,
    text: opts.description,
    showCancelButton: opts.showCancel,
    reverseButtons,
    confirmButtonText: opts.confirmLabel,
    cancelButtonText: opts.cancelLabel,
    allowOutsideClick: opts.allowOutsideClick,
    allowEscapeKey: opts.allowEscapeKey,
    timer: opts.timerMs,
    timerProgressBar: Boolean(opts.timerMs),
    customClass: {
      container: `boomi-swal boomi-swal--${hostSlug}`,
      popup: 'boomi-swal-popup',
      confirmButton: isDestructive ? 'swal2-confirm swal2-confirm--danger' : 'swal2-confirm',
      cancelButton: 'swal2-cancel',
      actions: 'boomi-swal-actions',
    },
    showClass: { popup: 'swal2-show boomi-swal-in' },
    hideClass: { popup: 'swal2-hide boomi-swal-out' },
    didOpen: () => injectSwalStyles(anchor, hostSlug),
    didClose: () => removeSwalStyles(hostSlug),
  });

  return result.isConfirmed;
}
