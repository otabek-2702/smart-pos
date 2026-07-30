type JsonObject = Record<string, unknown>;

function objectValue(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

/**
 * Validate the authoritative `/auth-me` response used by Electron main.
 *
 * Renderer route guards are only presentation. Report configuration controls
 * a financial-data bot, so every privileged IPC call is independently tied to
 * the currently authenticated backend session.
 */
export function assertReportManagerPayload(payload: unknown): void {
  const envelope = objectValue(payload);
  const user = objectValue(envelope?.data);
  if (!user) throw new Error('The active POS session could not be verified');

  const status =
    typeof user.status === 'string' ? user.status.trim().toUpperCase() : '';
  if (status && status !== 'ACTIVE') {
    throw new Error('The active POS account is not enabled');
  }

  const role = typeof user.role === 'string' ? user.role.trim().toUpperCase() : '';
  const permissions = Array.isArray(user.permissions)
    ? user.permissions
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
    : [];

  if (
    role === 'ADMIN' ||
    role === 'MANAGER' ||
    permissions.includes('*') ||
    permissions.includes('telegram.manage')
  ) {
    return;
  }

  throw new Error('Manager access is required for Telegram reports');
}
