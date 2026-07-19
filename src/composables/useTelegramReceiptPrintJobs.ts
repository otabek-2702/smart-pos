// Durable Telegram receipt printing.
//
// The backend owns the queue and leases a job to exactly one signed-in POS
// session. We only acknowledge after the Electron printer succeeds. A definite
// local failure is released back to the queue, so it can be retried safely.

import { ref, type Ref } from 'vue';
import { api } from 'boot/axios';

interface PrintOrderItem {
  product?: { name?: string | null } | null;
  quantity: number;
  price: string | number;
}

interface PrintOrder {
  display_id: number;
  order_type: string;
  order_origin?: string | null;
  cashier?: { name?: string | null } | null;
  user?: { name?: string | null } | null;
  items?: PrintOrderItem[];
  total_amount: string | number;
  description?: string | null;
  delivery_address?: string | null;
  phone_number?: string | null;
  is_paid?: boolean;
}

interface ReceiptPrintJob {
  id: string;
  claim_token: string;
  attempt: number;
  lease_expires_at: string;
  order: PrintOrder;
}

interface ClaimResponse {
  success: boolean;
  data?: { job?: ReceiptPrintJob | null };
}

const POLL_INTERVAL_MS = 5000;
const RETRY_DELAY_MS = 15000;
const MAX_ERROR_LENGTH = 500;

function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message.slice(0, MAX_ERROR_LENGTH);
  return 'Receipt printer did not confirm the job'.slice(0, MAX_ERROR_LENGTH);
}

export function useTelegramReceiptPrintJobs(isPaused: Ref<boolean>) {
  const printing = ref(false);
  let pollHandle: ReturnType<typeof setInterval> | null = null;
  let retryAfter = 0;
  // If printing succeeds but the acknowledgement request is interrupted, retry
  // only the acknowledgement. Re-printing that active lease would duplicate a
  // physical receipt.
  let pendingAcknowledgement: string | null = null;

  async function release(job: ReceiptPrintJob, error: unknown): Promise<void> {
    try {
      await api.post(`/orders/print-jobs/${encodeURIComponent(job.claim_token)}/fail`, {
        error: errorText(error),
      });
    } catch (releaseError) {
      // The backend lease will expire if this request cannot be delivered. Do
      // not claim another job while the current one may still be owned here.
      console.error('[telegram-print] failed to release receipt job:', releaseError);
    }
  }

  async function claimAndPrint(): Promise<void> {
    if (printing.value || isPaused.value || Date.now() < retryAfter) return;

    const printer = window.electron?.printer;
    // A browser/dev preview cannot print. Leave the job unclaimed for an actual
    // till instead of creating a repeated fail/retry loop.
    if (!printer) return;

    printing.value = true;
    try {
      if (pendingAcknowledgement) {
        await api.post(`/orders/print-jobs/${encodeURIComponent(pendingAcknowledgement)}/ack`);
        pendingAcknowledgement = null;
        return;
      }

      const claim = await api.post<ClaimResponse>('/orders/print-jobs/claim');
      const job = claim.data?.data?.job;
      if (!claim.data?.success || !job) return;

      if (job.order.order_origin && job.order.order_origin !== 'TELEGRAM') {
        await release(job, new Error('Unexpected receipt origin'));
        retryAfter = Date.now() + RETRY_DELAY_MS;
        return;
      }

      let printResult: { success: boolean; error?: string };
      try {
        printResult = await printer.printReceipt({
          displayId: job.order.display_id,
          orderType: job.order.order_type,
          cashierName: job.order.cashier?.name || job.order.user?.name || 'Telegram',
          items: (job.order.items ?? []).map((item) => ({
            name: item.product?.name || 'Mahsulot',
            quantity: item.quantity,
            price: Number(item.price) || 0,
          })),
          total: Number(job.order.total_amount) || 0,
          description: job.order.description || undefined,
          address: job.order.delivery_address || undefined,
          phoneNumber: job.order.phone_number || undefined,
          isPaid: Boolean(job.order.is_paid),
        });
      } catch (printError) {
        await release(job, printError);
        retryAfter = Date.now() + RETRY_DELAY_MS;
        return;
      }

      if (!printResult?.success) {
        await release(job, new Error(printResult?.error || 'Receipt printer rejected the job'));
        retryAfter = Date.now() + RETRY_DELAY_MS;
        return;
      }

      pendingAcknowledgement = job.claim_token;
      await api.post(`/orders/print-jobs/${encodeURIComponent(job.claim_token)}/ack`);
      pendingAcknowledgement = null;
    } catch (error) {
      console.error('[telegram-print] receipt job failed:', error);
      retryAfter = Date.now() + RETRY_DELAY_MS;
    } finally {
      printing.value = false;
    }
  }

  function start(): void {
    if (pollHandle) return;
    void claimAndPrint();
    pollHandle = setInterval(() => void claimAndPrint(), POLL_INTERVAL_MS);
  }

  function stop(): void {
    if (!pollHandle) return;
    clearInterval(pollHandle);
    pollHandle = null;
  }

  return { printing, claimAndPrint, start, stop };
}
