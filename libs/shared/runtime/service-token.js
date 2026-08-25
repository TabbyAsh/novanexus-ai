'use strict';

const SERVICE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

/**
 * Internal service tokens must be bounded, header-safe base64url text and
 * must not be low-entropy placeholder values such as one repeated character.
 */
function isStrictServiceToken(value) {
  return typeof value === 'string'
    && SERVICE_TOKEN_PATTERN.test(value)
    && new Set(value).size >= 8;
}

module.exports = { isStrictServiceToken };
