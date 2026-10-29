const crypto = require('crypto');

function secretsMatch(presented, expected) {
  const left = crypto.createHash('sha256').update(String(presented), 'utf8').digest();
  const right = crypto.createHash('sha256').update(String(expected), 'utf8').digest();
  return crypto.timingSafeEqual(left, right);
}

function presentedSecret(req) {
  const header = String((req.headers && (req.headers.authorization || req.headers.Authorization)) || '');
  if (/^Bearer\s+/i.test(header)) return header.replace(/^Bearer\s+/i, '').trim();
  if (/^Basic\s+/i.test(header)) {
    const encoded = header.replace(/^Basic\s+/i, '').trim();
    try {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      const splitAt = decoded.indexOf(':');
      if (splitAt < 0) return '';
      return decoded.slice(splitAt + 1);
    } catch {
      return '';
    }
  }
  return '';
}

function ownerConfig(env) {
  const secret = String((env && env.OWNER_ACCESS_SECRET) || '');
  if (secret.length < 16) return { configured: false, secret: '' };
  return { configured: true, secret };
}

function ownerAuthorized(req, env) {
  const config = ownerConfig(env);
  if (!config.configured) return { ok: false, status: 503 };
  const presented = presentedSecret(req);
  if (!presented || !secretsMatch(presented, config.secret)) return { ok: false, status: 401 };
  return { ok: true };
}

/** Constant-time owner check. Missing and wrong secrets are both rejected. */
function ownerAccepted(req, env) {
  const config = ownerConfig(env);
  const presented = presentedSecret(req);
  const expected = config.configured ? config.secret : 'owner-secret-not-configured';
  const match = secretsMatch(presented || 'missing-presented-secret', expected);
  return Boolean(config.configured && presented && match);
}

/**
 * Vercel cron sends Authorization: Bearer CRON_SECRET when that env var is set.
 * The owner secret is also accepted so the same route can be run by hand.
 */
function cronOrOwnerAccepted(req, env) {
  const presented = presentedSecret(req);
  const cronSecret = String((env && env.CRON_SECRET) || '').trim();
  const cronMatch = cronSecret
    ? secretsMatch(presented || 'missing-presented-secret', cronSecret)
    : false;
  if (cronSecret && presented && cronMatch) return true;
  return ownerAccepted(req, env);
}

module.exports = {
  cronOrOwnerAccepted,
  ownerAccepted,
  ownerAuthorized,
  ownerConfig,
  presentedSecret,
  secretsMatch,
};
