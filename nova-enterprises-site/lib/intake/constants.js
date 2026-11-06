const ORG_ID = 'nova-enterprises-llc';
const OWNER_EMAIL = 'wkirby592@gmail.com';
// Kept for the owner record. Public pages render this number only in the
// homepage contact section (public/index.html #quote). Do not add it back
// to headers, footers, /sourcing, or save-failed copy.
const OWNER_PHONE_DISPLAY = '812-263-1586';
const OWNER_PHONE_TEL = '+18122631586';
const MAX_BODY_BYTES = 16 * 1024;

const SERVICE_LINES = {
  research_b2b_leads: 'Researched B2B lead lists (contacts published on company websites)',
  research_government_bids: 'Government bid research',
  software_ai: 'Software and AI operations (in development)',
};

const SAVE_FAILED_MESSAGE =
  "We couldn't save your request. Please email wkirby592@gmail.com.";

const DIRECT_CONTACT_MESSAGE =
  'Nothing was stored. Email Wyatt Kirby at wkirby592@gmail.com.';

module.exports = {
  ORG_ID,
  OWNER_EMAIL,
  OWNER_PHONE_DISPLAY,
  OWNER_PHONE_TEL,
  MAX_BODY_BYTES,
  SERVICE_LINES,
  SAVE_FAILED_MESSAGE,
  DIRECT_CONTACT_MESSAGE,
};
