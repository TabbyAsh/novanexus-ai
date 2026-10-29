const crypto = require('crypto');
const { SERVICE_LINES } = require('./constants');

const TYPES = new Set(['buyer_sourcing', 'supplier', 'services']);
const SUPPLIER_ROLES = {
  manufacturer: 'Manufacturer',
  intermediary: 'Intermediary',
};

function singleLine(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

function multiLine(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function validEmail(email) {
  if (email.length < 3 || email.length > 254) return false;
  if (email.includes('..')) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validPhone(phone) {
  if (!phone) return true;
  if (phone.length > 40) return false;
  if (!/^[0-9+().\-\s]+$/.test(phone)) return false;
  const digits = phone.replace(/\D/g, '').length;
  return digits >= 7 && digits <= 15;
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 2000 || year > 2100) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

const PUBLIC_SOURCES = new Set(['website', 'sourcing-landing']);

function resolveSource(env, requested) {
  const asked = singleLine(typeof requested === 'string' ? requested : '');
  if (asked && !PUBLIC_SOURCES.has(asked)) {
    return { error: 'Choose website or sourcing-landing.' };
  }
  if (asked === 'sourcing-landing') return { source: 'sourcing-landing' };
  if (env && env.VERCEL_ENV === 'preview') return { source: 'website-preview' };
  if (env && env.VERCEL_ENV === 'development') return { source: 'website-test' };
  return { source: 'website' };
}

function normalizeInquiry(input, options = {}) {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const website = body.company_website;
  const honey = body._honey;
  if ((typeof website === 'string' && website.trim()) || (typeof honey === 'string' && honey.trim())) {
    return { ok: false, honeypot: true };
  }

  const errors = {};
  const resolvedSource = resolveSource(options.env, body.source);
  if (resolvedSource.error) errors.source = resolvedSource.error;
  const inquiryType = singleLine(body.inquiry_type);
  if (!TYPES.has(inquiryType)) errors.inquiry_type = 'Choose a sourcing request, a supplier inquiry, or a services inquiry.';

  let requestId = singleLine(body.request_id || body.requestId || '');
  const headerKey = options.idempotencyKey ? singleLine(options.idempotencyKey) : '';
  if (headerKey && requestId && headerKey !== requestId) {
    errors.request_id = 'The request id does not match the Idempotency-Key header.';
  } else if (!requestId && headerKey) {
    requestId = headerKey;
  }
  if (!requestId && options.allowGeneratedRequestId) {
    requestId = `srv${crypto.randomBytes(16).toString('hex')}`;
  }
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(requestId)) {
    errors.request_id = 'A request id of 16–100 letters, digits, underscores, or hyphens is required.';
  }

  const name = singleLine(body.name);
  if (name.length < 2 || name.length > 120) errors.name = 'Name must be 2–120 characters.';

  const email = singleLine(body.email).toLowerCase();
  if (!validEmail(email)) errors.email = 'Enter a valid email address.';

  const company = singleLine(body.company);
  const phone = singleLine(body.phone);
  if (!validPhone(phone)) errors.phone = 'Use 7–15 digits. Allowed symbols are + ( ) . - and spaces.';
  const country = singleLine(body.country);
  if (country.length > 80) errors.country = 'Country must be 80 characters or fewer.';

  const notes = multiLine(body.notes);
  if (notes.length > 4000) errors.notes = 'Notes must be 4,000 characters or fewer.';

  let product = singleLine(body.product_or_service || body.product);
  if (product.length > 200) errors.product_or_service = 'Product or service must be 200 characters or fewer.';

  const quantity = singleLine(body.quantity_text || body.quantity);
  if (quantity.length > 120) errors.quantity = 'Quantity must be 120 characters or fewer.';

  const targetDate = singleLine(body.target_date);
  if (targetDate && !validDate(targetDate)) errors.target_date = 'Target date must be a real date in YYYY-MM-DD form.';

  if ((inquiryType === 'buyer_sourcing' || inquiryType === 'supplier') && (company.length < 2 || company.length > 160)) {
    errors.company = 'Company must be 2–160 characters.';
  } else if (company.length > 160) {
    errors.company = 'Company must be 160 characters or fewer.';
  }

  let composedNotes = notes;
  if (inquiryType === 'buyer_sourcing') {
    if (product.length < 2) errors.product_or_service = 'Choose a product.';
    if (!quantity) errors.quantity = 'Enter a quantity and unit, such as 500 pairs.';
  }

  if (inquiryType === 'supplier') {
    if (country.length < 2) errors.country = 'Enter the country you produce or supply from.';
    if (product.length < 2) errors.product_or_service = 'Describe the product range.';
    const role = singleLine(body.supplier_role);
    if (!Object.prototype.hasOwnProperty.call(SUPPLIER_ROLES, role)) {
      errors.supplier_role = 'Say whether you manufacture or act as an intermediary.';
    }
    if (singleLine(body.contact_permission) !== 'yes') {
      errors.contact_permission = 'Confirm that Nova may contact you about this inquiry.';
    }
    if (!errors.supplier_role && !errors.contact_permission) {
      composedNotes = [`Supplier role: ${SUPPLIER_ROLES[role]}`, 'Contact permission: yes', notes].filter(Boolean).join('\n\n');
    }
  }

  if (inquiryType === 'services') {
    const line = singleLine(body.service_line);
    if (!Object.prototype.hasOwnProperty.call(SERVICE_LINES, line)) {
      errors.service_line = 'Choose research (B2B lead lists or government bids) or software and AI.';
    } else {
      product = SERVICE_LINES[line];
    }
    if (notes.length < 10) errors.notes = 'Describe the request in at least 10 characters.';
  }

  if (composedNotes.length > 5000) errors.notes = 'Notes are too long to store.';

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      inquiryType,
      requestId,
      name,
      company: company || null,
      email,
      phone: phone || null,
      country: country || null,
      productOrService: product || null,
      quantityText: quantity || null,
      targetDate: targetDate || null,
      notes: composedNotes || null,
      source: resolvedSource.source,
    },
  };
}

module.exports = {
  SERVICE_LINES,
  SUPPLIER_ROLES,
  normalizeInquiry,
  resolveSource,
};
