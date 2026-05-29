<template>
  <q-layout view="hHh lpR fFf" class="bg-dark">
    <q-page-container>
      <router-view />
    </q-page-container>

    <!--
      Internet-down warning dialog. Lives here (not in any one page) so it
      fires on every page transition: the cashier could be deep in the
      orders view when the kitchen WiFi blips, and we still want them to
      know. Only the main PC (loopback IP) is told about internet drops
      via this dialog — secondary terminals get the smaller inline icon.
    -->
    <InternetWarningDialog
      :network="network"
      :enabled="role.isMainPc.value"
      :device-ip="role.configuredIp.value"
    />

    <!--
      License kill-switch gate. Above EVERYTHING — backend's middleware
      refuses every business endpoint with 503 until the License row is
      active, so without this overlay the cashier sees only mysterious
      5xx errors. Only /api/licensing/* and /healthz pass through; the
      setup wizard inside this screen uses the licensing endpoint
      directly to register the install and unblock the rest of the app.
    -->
    <LicenseBlockedScreen />
  </q-layout>
</template>

<script setup lang="ts">
import InternetWarningDialog from 'src/components/InternetWarningDialog.vue';
import LicenseBlockedScreen from 'src/components/LicenseBlockedScreen.vue';
import { useNetworkStatus } from 'src/composables/useNetworkStatus';
import { useDeviceRole } from 'src/composables/useDeviceRole';

const network = useNetworkStatus();
const role = useDeviceRole();
</script>

<style scoped>
.bg-dark {
  background: #0f1115;
}
</style>
