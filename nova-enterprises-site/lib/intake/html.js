const { OWNER_EMAIL, OWNER_PHONE_DISPLAY, OWNER_PHONE_TEL } = require('./constants');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
}

function layout({ title, heading, main, robots = 'noindex' }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="${escapeHtml(robots)}">
  <meta name="theme-color" content="#0B0E13">
  <title>${escapeHtml(title)}</title>
  <link rel="icon" href="/brand/icons/favicon.ico" sizes="48x48">
  <link rel="icon" href="/brand/icons/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/brand/icons/apple-touch-icon.png">
  <link rel="manifest" href="/site.webmanifest">
  <link rel="stylesheet" href="/brand/tokens.css">
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header"><div class="wrap header-inner"><a class="brand" href="/" aria-label="Nova Enterprises LLC home"><svg class="brand-mark" viewBox="0 0 72 72" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="4"><circle cx="36" cy="36" r="24"/><path d="M36 2v14M36 56v14M2 36h14M56 36h14"/></g><circle cx="36" cy="36" r="7" fill="currentColor"/></svg><span class="brand-text"><strong>NOVA</strong><small>ENTERPRISES LLC</small></span></a></div></header>
  <main id="main" class="wrap message-page">
    <p class="eyebrow">Nova Enterprises LLC</p>
    <h1>${heading}</h1>
    ${main}
  </main>
  <footer class="site-footer"><div class="wrap footer-bottom"><span>© 2026 Nova Enterprises LLC</span><span>Terre Haute, IN, USA</span></div></footer>
</body>
</html>`;
}

function contactLinks() {
  return `<p><a href="mailto:${OWNER_EMAIL}">${OWNER_EMAIL}</a><br><a href="tel:${OWNER_PHONE_TEL}">${OWNER_PHONE_DISPLAY}</a></p>`;
}

function thankYouPage(receiptId, replay) {
  return layout({
    title: 'Inquiry received | Nova Enterprises LLC',
    heading: 'We saved your inquiry.',
    main: `<p>Your reference is <strong>${escapeHtml(receiptId)}</strong>. Save it if you follow up.</p>
      <p>${replay ? 'This request was already saved. The original reference is unchanged.' : 'The reference matches the record stored for Wyatt Kirby.'}</p>
      ${contactLinks()}
      <p><a class="button" href="/">Back to the website <span aria-hidden="true">↗</span></a></p>`,
  });
}

function fallbackPage() {
  return layout({
    title: 'Inquiry not saved | Nova Enterprises LLC',
    heading: "We couldn't save your request.",
    main: `<p>We couldn't save your request. Please email <a href="mailto:${OWNER_EMAIL}">${OWNER_EMAIL}</a> or call <a href="tel:${OWNER_PHONE_TEL}">${OWNER_PHONE_DISPLAY}</a>.</p>
      <p><a class="button" href="/">Back to the website <span aria-hidden="true">↗</span></a></p>`,
  });
}

function messagePage({ title, heading, message }) {
  return layout({
    title,
    heading,
    main: `<p>${escapeHtml(message)}</p>${contactLinks()}<p><a class="button" href="/">Back to the website <span aria-hidden="true">↗</span></a></p>`,
  });
}

function validationPage(errors) {
  const items = Object.entries(errors).map(([field, message]) => `<li><strong>${escapeHtml(field)}</strong>: ${escapeHtml(message)}</li>`).join('');
  return layout({
    title: 'Inquiry not saved | Nova Enterprises LLC',
    heading: 'We did not save this inquiry.',
    main: `<p>Nothing was stored. Correct the form and try again, or email the details directly.</p>
      <ul>${items}</ul>
      ${contactLinks()}
      <p><a class="button" href="/#quote">Return to the form <span aria-hidden="true">↗</span></a></p>`,
  });
}

function honeypotPage() {
  return layout({
    title: 'Inquiry | Nova Enterprises LLC',
    heading: 'Thanks for the note.',
    main: `<p>If you meant to send an inquiry and you do not see a reference ID on this page, nothing was stored.</p>
      ${contactLinks()}
      <p><a class="button" href="/">Back to the website <span aria-hidden="true">↗</span></a></p>`,
  });
}

function ownerQueuePage(rows) {
  const body = rows.length === 0
    ? '<p>No inquiries are stored yet.</p>'
    : `<div class="table-wrap"><table class="data-table">
        <thead><tr>
          <th>Type</th><th>Receipt</th><th>Created (UTC)</th><th>Name</th><th>Company</th><th>Email</th><th>Status</th><th>Product / service</th><th>Source</th>
        </tr></thead>
        <tbody>
          ${rows.map(row => `<tr>
            <td>${escapeHtml(row.type)}</td>
            <td>${escapeHtml(row.receipt_id)}</td>
            <td>${escapeHtml(row.created_at)}</td>
            <td>${escapeHtml(row.name)}</td>
            <td>${escapeHtml(row.company)}</td>
            <td>${escapeHtml(row.email)}</td>
            <td>${escapeHtml(row.status)}</td>
            <td>${escapeHtml(row.product_or_service)}</td>
            <td>${escapeHtml(row.source)}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>`;
  return layout({
    title: 'Inquiry queue | Nova Enterprises LLC',
    heading: 'Inquiry queue',
    main: `<p>Times are UTC. This page reads the same Postgres rows the public form writes. Notification email is separate and may be off.</p>
      <p><a href="/api/owner/export.csv">Download CSV</a></p>
      ${body}`,
  });
}

function ownerDeniedPage(status) {
  const unavailable = status === 503;
  return layout({
    title: unavailable ? 'Owner access not configured | Nova Enterprises LLC' : 'Sign in required | Nova Enterprises LLC',
    heading: unavailable ? 'Owner access is not configured.' : 'Sign in required.',
    main: unavailable
      ? '<p>The owner secret is missing. No inquiries are shown.</p>'
      : '<p>This queue is private. No inquiries are shown until the owner secret is accepted.</p>',
  });
}

module.exports = {
  escapeHtml,
  fallbackPage,
  honeypotPage,
  messagePage,
  ownerDeniedPage,
  ownerQueuePage,
  thankYouPage,
  validationPage,
};
