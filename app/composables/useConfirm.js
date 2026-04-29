import { ref } from 'vue';

const open        = ref(false);
const title       = ref('');
const message     = ref('');
const confirmText = ref('Bestätigen');
const cancelText  = ref('Abbrechen');
const danger      = ref(true);
let _resolve = null;

/**
 * Zeigt ein Bestätigungs-Modal und gibt ein Promise<boolean> zurück.
 * @param {object|string} opts  – String = message, oder { title, message, confirmText, cancelText, danger }
 */
function ask(opts) {
  if (typeof opts === 'string') opts = { message: opts };
  title.value       = opts.title       ?? '';
  message.value     = opts.message     ?? '';
  confirmText.value = opts.confirmText ?? 'Bestätigen';
  cancelText.value  = opts.cancelText  ?? 'Abbrechen';
  danger.value      = opts.danger      !== false;
  open.value        = true;
  return new Promise((resolve) => { _resolve = resolve; });
}

function _confirm() { open.value = false; _resolve?.(true);  _resolve = null; }
function _cancel()  { open.value = false; _resolve?.(false); _resolve = null; }

export function useConfirm() {
  return { open, title, message, confirmText, cancelText, danger, ask, _confirm, _cancel };
}
