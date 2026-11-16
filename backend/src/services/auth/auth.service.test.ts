import test from 'node:test';
import assert from 'node:assert/strict';
import { createMagicLinkVerifier } from './auth.service.js';
import type { withTransaction } from '../../db.js';
import { sha256 } from './crypto.js';

// Unit contract only: real Postgres concurrency/rollback is exercised by the
// isolated integration script. Never contacts the production database or mail.
test('token claim and session creation use the same transaction and hash secrets', async () => {
  const calls: { sql: string; params: any[] }[] = [];
  const transaction = (async fn => fn({ query: async (sql, params = []) => {
    calls.push({sql, params});
    if (calls.length === 1) return [{email:'owner@example.test'}];
    if (calls.length === 2) return [{id:'u1', email:'owner@example.test'}];
    return [];
  }})) as typeof withTransaction;
  const result = await createMagicLinkVerifier(transaction)('raw-test-token');
  assert.equal(calls.length, 3);
  assert.match(calls[0].sql, /UPDATE auth_tokens SET used_at = now\(\)/);
  assert.match(calls[0].sql, /used_at IS NULL AND expires_at > now\(\)/);
  assert.match(calls[0].sql, /RETURNING email/);
  assert.deepEqual(calls[0].params, [sha256('raw-test-token')]);
  assert.equal(calls[2].params[1], sha256(result.sessionToken));
  assert.equal(result.user.id, 'u1');
});

test('missing, expired or already claimed token cannot mint a session', async () => {
  let calls = 0;
  const transaction = (async fn => fn({query: async () => { calls++; return []; }})) as typeof withTransaction;
  await assert.rejects(createMagicLinkVerifier(transaction)('invalid'), /INVALID_OR_EXPIRED/);
  assert.equal(calls, 1);
});

test('session insertion failure rejects the transaction rather than returning a sign-in', async () => {
  let calls = 0;
  const transaction = (async fn => fn({query: async () => {
    calls++;
    if (calls === 1) return [{email:'owner@example.test'}];
    if (calls === 2) return [{id:'u1',email:'owner@example.test'}];
    throw new Error('session write failed');
  }})) as typeof withTransaction;
  await assert.rejects(createMagicLinkVerifier(transaction)('valid'), /session write failed/);
  assert.equal(calls, 3);
});
