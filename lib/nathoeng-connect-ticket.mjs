import crypto from 'node:crypto';

// Validation for a future server-to-server Nathoeng Connect handoff.
// This module deliberately does not create a login session or grant database privileges.
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MAX_AGE_MS = 60_000;
export function verifyConnectTicket(raw, signature, secret, now = Date.now()) {
  if (typeof raw !== 'string' || raw.length > 2048 ||
      typeof secret !== 'string' || secret.length < 32 ||
      typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return null;
  const actual = Buffer.from(signature, 'hex');
  const expected = crypto.createHmac('sha256', secret).update(raw).digest();
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  let p;
  try { p = JSON.parse(raw); } catch { return null; }
  if (!p || p.aud !== 'health.nathoeng.com' || p.iss !== 'nathoeng.com' ||
      p.v !== 1 || !UUID.test(p.member_id || '') || !UUID.test(p.jti || '') ||
      !Number.isSafeInteger(p.iat) || p.iat > now + 5000 ||
      p.iat < now - MAX_AGE_MS) return null;
  return { memberId: p.member_id, ticketId: p.jti, issuedAt: p.iat };
}
