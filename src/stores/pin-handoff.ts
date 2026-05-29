import { defineStore } from 'pinia';
import { ref } from 'vue';

// Carries the selected user's email/name from the picker (IndexPage) to the
// PIN screen without putting them in the URL. Replaces the old route-query
// handoff so the renderer doesn't leak the email in the address bar if it's
// ever run outside the Electron kiosk.
export const usePinHandoffStore = defineStore('pinHandoff', () => {
  const email = ref('');
  const name = ref('');

  function set(nextEmail: string, nextName: string): void {
    email.value = nextEmail;
    name.value = nextName;
  }

  function clear(): void {
    email.value = '';
    name.value = '';
  }

  return { email, name, set, clear };
});
