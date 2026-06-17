<template>
  <q-layout view="hHh lpR fFf" class="bg-dark">
    <q-page-container :class="{ 'has-warn-banner': showWarn }">
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

    <!--
      Non-blocking prepaid warning banner. Driven by the `warn` flag on
      /api/licensing/status — shows "top up soon" before the kill switch
      actually blocks the POS.
    -->
    <LicenseWarnBanner />

    <!--
      CTI operator mode (mounted ONCE, app-wide): the QR pairing dialog and the
      incoming-call dialog. The store wires the single phone-call event listener
      via init() in onMounted below.
    -->
    <OperatorQrDialog />
    <IncomingCallDialog />
  </q-layout>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import InternetWarningDialog from 'src/components/InternetWarningDialog.vue';
import LicenseBlockedScreen from 'src/components/LicenseBlockedScreen.vue';
import LicenseWarnBanner from 'src/components/LicenseWarnBanner.vue';
import OperatorQrDialog from 'src/components/OperatorQrDialog.vue';
import IncomingCallDialog from 'src/components/IncomingCallDialog.vue';
import { useNetworkStatus } from 'src/composables/useNetworkStatus';
import { useDeviceRole } from 'src/composables/useDeviceRole';
import { useLicenseStatus } from 'src/composables/useLicenseStatus';
import { useOperatorStore } from 'src/stores/operator';

const network = useNetworkStatus();
const role = useDeviceRole();
const license = useLicenseStatus();
const route = useRoute();
const router = useRouter();

// Wire the operator-mode call-event listener once for the whole app.
const operator = useOperatorStore();
onMounted(() => operator.init(router));

// Mirror LicenseWarnBanner's visibility so the page content can reserve the
// space the fixed banner occupies (otherwise it covers the top of the page).
const showWarn = computed(
  () =>
    license.snapshot.value.warn === true &&
    license.snapshot.value.is_blocked !== true &&
    route.meta.fullscreen !== true,
);
</script>

<style scoped>
.bg-dark {
  background: var(--bg-app);
}

/* Reserve space for the fixed LicenseWarnBanner (~38px) so it never covers
   the top of the active page. Matches the banner's height. */
.has-warn-banner {
  padding-top: 38px;
}
</style>
