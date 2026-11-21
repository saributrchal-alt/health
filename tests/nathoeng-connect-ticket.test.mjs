import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyConnectTicket } from '../lib/nathoeng-connect-ticket.mjs';
const secret = 'test-secret-32-characters-minimum-123';
const now = 1800000000000;
const payload = { v: 1, iss: 'nathoeng.com', aud: 'health.nathoeng.com',
  member_id: '550e8400-e29b-41d4-a716-446655440001',
  jti: '550e8400-e29b-41d4-a716-446655440002', iat: now };
const sign = raw => crypto.createHmac('sha256', secret).update(raw).digest('hex');
test('accepts signed, fresh, audience-bound ticket', () => {
 const raw = JSON.stringify(payload);
 assert.equal(verifyConnectTicket(raw, sign(raw), secret, now)?.memberId, payload.member_id);
});
test('rejects tampering, expiry, future issue, and wrong audience', () => {
 const raw = JSON.stringify(payload);
 assert.equal(verifyConnectTicket(raw, sign('other'), secret, now), null);
 for (const changes of [{iat: now - 61000}, {iat: now + 6000}, {aud:'other.site'}, {jti:'bad'}]) {
  const modified = JSON.stringify({...payload, ...changes});
  assert.equal(verifyConnectTicket(modified, sign(modified), secret, now), null);
 }
});
