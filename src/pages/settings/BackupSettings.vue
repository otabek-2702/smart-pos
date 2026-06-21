<template>
  <div class="backup-settings">
    <div class="settings-form">
      <h2 class="section-title">Zaxira / sinxron</h2>
      <p class="section-description">
        Sozlamalarni boshqa kompyuterga ko'chiring yoki saqlang. Global sozlamalar
        asosiy kompyuter orqali barcha kassalarga tarqaladi.
      </p>

      <!-- this PC's role -->
      <div class="form-section">
        <h3 class="form-section-title">
          <q-icon name="dns" size="20px" />
          Bu kompyuter
        </h3>
        <div class="role-row">
          <span class="role-badge" :class="{ main: isMainPc }">
            <q-icon :name="isMainPc ? 'star' : 'computer'" size="16px" />
            {{ isMainPc ? 'Asosiy kompyuter (server)' : 'Qoʻshimcha kassa' }}
          </span>
          <span class="role-ip">Backend IP: {{ configuredIp || 'sozlanmagan' }}</span>
        </div>
        <p class="role-hint">
          {{
            isMainPc
              ? 'Bu kompyuter global sozlamalar manbai — boshqa kassalar shu yerdan oladi.'
              : 'Global sozlamalar asosiy kompyuterdan olinadi. IP oʻzgartirilsa, ilovani qayta ishga tushiring.'
          }}
        </p>
      </div>

      <!-- export / import -->
      <div class="form-section">
        <h3 class="form-section-title">
          <q-icon name="import_export" size="20px" />
          Eksport / Import
        </h3>
        <p class="section-description" style="margin: 0 0 12px">
          Barcha sozlamalar (shu kompyuter + global) bitta JSON faylga saqlanadi.
          Boshqa kompyuterda import qiling.
        </p>
        <div class="actions">
          <button type="button" class="btn btn-secondary" :disabled="busy" @click="onExport">
            <q-icon name="download" size="20px" />
            Eksport qilish
          </button>
          <button type="button" class="btn btn-primary" :disabled="busy" @click="onImport">
            <q-icon name="upload" size="20px" />
            Import qilish
          </button>
        </div>
        <p class="role-hint">Import qilingandan soʻng ilovani qayta ishga tushiring.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { toast } from 'vue3-toastify';
import { useTweaksMeta } from 'src/composables/useTweaks';
import { useDeviceRole } from 'src/composables/useDeviceRole';

const { isMainPc, exportTweaks, importTweaks } = useTweaksMeta();
const { configuredIp } = useDeviceRole();
const busy = ref(false);

async function onExport(): Promise<void> {
  busy.value = true;
  try {
    const r = await exportTweaks();
    if (r?.ok) toast.success('Eksport qilindi');
    else if (r) toast.info('Bekor qilindi');
  } catch {
    toast.error('Eksport xatosi');
  } finally {
    busy.value = false;
  }
}

async function onImport(): Promise<void> {
  busy.value = true;
  try {
    const r = await importTweaks();
    if (r?.ok) toast.success('Import qilindi — ilovani qayta ishga tushiring');
    else if (r) toast.info('Bekor qilindi');
  } catch {
    toast.error('Import xatosi');
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped lang="scss">
.backup-settings {
  padding: 4px;
}
.settings-form {
  max-width: 560px;
}
.section-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 6px;
}
.section-description {
  font-size: 14px;
  color: var(--text-muted);
  line-height: 1.55;
  margin-bottom: 20px;
}
.form-section {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 18px;
  margin-bottom: 18px;
}
.form-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 14px;
  .q-icon {
    color: var(--accent-primary);
  }
}
.role-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.role-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--r-pill);
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 700;
}
.role-badge.main {
  background: var(--primary-weak);
  border-color: var(--primary-border);
  color: var(--primary);
}
.role-ip {
  font-size: 13px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}
.role-hint {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.5;
  margin: 8px 0 0;
}
.actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.btn {
  height: 48px;
  padding: 0 20px;
  border-radius: 12px;
  border: 1px solid transparent;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  &:active:not(:disabled) {
    transform: scale(0.97);
  }
}
.btn-secondary {
  background: var(--bg-surface-2);
  color: var(--text-primary);
  border-color: var(--border-color);
}
.btn-primary {
  background: var(--accent-primary);
  color: var(--on-primary);
}
</style>
