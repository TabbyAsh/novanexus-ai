const { OWNER_EMAIL } = require('./constants');

/**
 * Owner notification. Implementations are called only after the inquiry
 * transaction has committed. A throw or a failed status must not remove the row.
 *
 * TODO(owner): No email provider account is approved. Do not add a provider
 * SDK here until Wyatt approves the account. INTAKE_EMAIL_ENABLED is a flag
 * only — setting it does not send mail. When a provider is approved, replace
 * DisabledOwnerNotifier and retry inquiry_notification_outbox rows whose
 * status is pending or failed (POST /api/owner/notifications/retry).
 */
class DisabledOwnerNotifier {
  constructor(env = process.env) {
    this.env = env;
  }

  async send(message) {
    const enabled = String(this.env.INTAKE_EMAIL_ENABLED || '').toLowerCase() === 'true';
    const detail = enabled
      ? 'INTAKE_EMAIL_ENABLED is true, but no email provider is implemented. Nothing was sent.'
      : 'INTAKE_EMAIL_ENABLED is not true. Owner email is disabled. Nothing was sent.';
    console.info(JSON.stringify({
      event: 'intake_owner_email',
      receipt_id: message && message.receiptId,
      to: OWNER_EMAIL,
      status: 'skipped',
      detail,
    }));
    return { status: 'skipped', detail };
  }
}

function createNotifier(env = process.env) {
  return new DisabledOwnerNotifier(env);
}

module.exports = {
  DisabledOwnerNotifier,
  createNotifier,
};
