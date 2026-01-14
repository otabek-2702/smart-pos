import { boot } from 'quasar/wrappers';
import { ref } from 'vue';

const VK_KEY = 'pos:virtualKeyboardEnabled';

function readStored(): boolean {
  const raw = localStorage.getItem(VK_KEY);
  if (raw === null) return true; // default ON
  return raw === 'true';
}

export const virtualKeyboardEnabled = ref<boolean>(readStored());

export function setVirtualKeyboardEnabled(value: boolean): void {
  virtualKeyboardEnabled.value = value;
  localStorage.setItem(VK_KEY, String(value));
}

export default boot(() => {
  // nothing needed, just ensures boot loads early
});
