import { randomUUID } from 'node:crypto';

const SAFE_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,99}$/;

export function isSafeRequestId(value: string | null | undefined): value is string {
  return typeof value === 'string' && SAFE_REQUEST_ID.test(value);
}

export function requestIdFor(
  candidate: string | null | undefined,
  generate: () => string = randomUUID,
): string {
  return isSafeRequestId(candidate) ? candidate : generate();
}
