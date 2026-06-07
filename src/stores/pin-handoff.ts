import { defineStore } from 'pinia';
import { ref } from 'vue';

// Carries the selected user's id/name from the picker (IndexPage) to the PIN
// screen without putting them in the URL. The backend `/cashiers` picker no
// longer returns email (cashiers have placeholders), so login goes by user_id
// + PIN; email is kept only for legacy/manual entry.
export const usePinHandoffStore = defineStore('pinHandoff', () => {
  const userId = ref<number | null>(null);
  const email = ref('');
  const name = ref('');

  function set(nextId: number | null, nextEmail: string, nextName: string): void {
    userId.value = nextId;
    email.value = nextEmail;
    name.value = nextName;
  }

  function clear(): void {
    userId.value = null;
    email.value = '';
    name.value = '';
  }

  return { userId, email, name, set, clear };
});
