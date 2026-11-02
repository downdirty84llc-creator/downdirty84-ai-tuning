// Real PostgreSQL + signed synthetic Stripe events. Never uses hosted services,
// real payment credentials, customer records, email transport or an existing DB's tables.
// Run after `npm run build`, with a disposable loopback PostgreSQL server:
// E2E_STRIPE_DISPOSABLE=1 DATABASE_URL=postgresql://...@127.0.0.1:PORT/postgres node scripts/e2e-stripe-fulfillment.mjs
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';
import pg from 'pg';
import Stripe from 'stripe';

assert.equal(process.env.E2E_STRIPE_DISPOSABLE, '1', 'Explicit disposable-database opt-in is required.');
const sourceURL = new URL(process.env.DATABASE_URL || '');
assert(['postgres:', 'postgresql:'].includes(sourceURL.protocol));
assert(['localhost', '127.0.0.1', '[::1]'].includes(sourceURL.hostname), 'Only a loopback PostgreSQL server is permitted.');
assert(!sourceURL.searchParams.has('host'), 'A query-string host override is not permitted.');
const databaseName = `dd84_stripe_test_${randomUUID().replaceAll('-', '')}`;
assert(/^dd84_stripe_test_[a-f0-9]{32}$/.test(databaseName));
const databaseURL = new URL(sourceURL);
databaseURL.pathname = `/${databaseName}`;
const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const admin = new pg.Client({ connectionString: sourceURL.href });
let databaseCreated = false, pool, applicationPool, server;
let passed = 0;
const ok = (name) => { passed++; console.log(`PASS ${name}`); };

try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  databaseCreated = true;
  pool = new pg.Pool({ connectionString: databaseURL.href, max: 20 });
  const migrations = (await fs.readdir(migrationsDir)).filter(name => /^\d+.*\.sql$/.test(name)).sort();
  const sessionMigration = migrations.find(name => /^008_/.test(name));
  assert(sessionMigration, 'Migration 008 must be present.');
  for (const name of migrations.filter(name => name < sessionMigration)) {
    await pool.query(await fs.readFile(path.join(migrationsDir, name), 'utf8'));
  }
  const sessionSQL = await fs.readFile(path.join(migrationsDir, sessionMigration), 'utf8');

  // Seed duplicates only inside a rollback-only fixture transaction. The
  // migration must fail without silently altering either historical row.
  const migrationClient = await pool.connect();
  try {
    await migrationClient.query('BEGIN');
    const { rows: [user] } = await migrationClient.query("INSERT INTO users(email) VALUES ('migration-duplicate@example.test') RETURNING id");
    await migrationClient.query(`INSERT INTO orders(user_id,stripe_event_id,stripe_session_id,customer_email,amount_total_cents)
      VALUES ($1,'evt_migration_one','cs_migration_same','migration-duplicate@example.test',100),
             ($1,'evt_migration_two','cs_migration_same','migration-duplicate@example.test',100)`, [user.id]);
    await migrationClient.query('SAVEPOINT before_migration');
    await assert.rejects(migrationClient.query(sessionSQL), /duplicate/i);
    await migrationClient.query('ROLLBACK TO SAVEPOINT before_migration');
    assert.equal((await migrationClient.query("SELECT count(*)::integer AS n FROM orders WHERE stripe_session_id='cs_migration_same'")).rows[0].n, 2);
    await migrationClient.query('ROLLBACK');
  } finally { migrationClient.release(); }
  ok('migration refuses historical duplicate sessions and leaves both rows intact');
  await pool.query(sessionSQL);
  const index = await pool.query("SELECT indexdef FROM pg_indexes WHERE tablename='orders' AND indexname='orders_stripe_session_id_unique'");
  assert.match(index.rows[0]?.indexdef ?? '', /CREATE UNIQUE INDEX/);
  ok('session uniqueness migration installs its database-enforced guard on a clean schema');

  process.env.DATABASE_URL = databaseURL.href;
  process.env.NODE_ENV = 'test';
  const { createStripeRouter } = await import('../dist/routes/stripe.routes.js');
  const { withTransaction, pool: routePool } = await import('../dist/db.js');
  applicationPool = routePool;
  const { EXPECTED_STRIPE_ACCOUNT, SERVICE_PRICES, NON_TUNING_PRODUCTS } = await import('../dist/config/stripe_catalog.js');
  const sdk = new Stripe('sk_test_synthetic_not_a_credential', { apiVersion: '2024-06-20' });
  const webhookSecret = 'whsec_synthetic_local_database_test';
  const env = { NODE_ENV: 'test', STRIPE_SECRET_KEY: 'sk_test_synthetic_not_a_credential', STRIPE_WEBHOOK_SECRET: webhookSecret };
  const sessions = new Map(), pages = new Map();
  const sent = [];
  let retrievals = 0, lineReads = 0, failJobInsert = false;
  const servicePrice = Object.entries(SERVICE_PRICES).find(([, entry]) => entry.service === 'LOG_REVIEW')[0];
  const line = (id, priceId = servicePrice, productId = 'prod_synthetic_tuning') => ({
    id, object: 'item', description: 'Synthetic local service', amount_total: 3900, quantity: 1,
    price: { id: priceId, product: { id: productId, object: 'product', metadata: {} }, metadata: {} }
  });
  function addSession(label, overrides = {}, linePages = [[line(`li_${label}`)]]) {
    const id = `cs_test_${label}_${randomUUID().replaceAll('-', '')}`;
    const session = { id, object: 'checkout.session', mode: 'payment', status: 'complete', payment_status: 'paid', livemode: false,
      amount_total: 3900, currency: 'usd', customer_email: `${label}-${randomUUID()}@example.test`,
      customer_details: null, metadata: { platform: 'GM', fuel: 'GASOLINE', induction: 'NA', vehicle: 'Synthetic database fixture' }, ...overrides };
    sessions.set(id, session); pages.set(id, linePages);
    return session;
  }
  const app = express();
  app.use('/api/v1/stripe', express.raw({ type: 'application/json' }), createStripeRouter({
    stripe: {
      webhooks: { constructEvent: (...args) => sdk.webhooks.constructEvent(...args) },
      checkout: { sessions: {
        retrieve: async id => { retrievals++; assert(sessions.has(id), `Unknown synthetic session ${id}`); return sessions.get(id); },
        listLineItems: async (id, options) => {
          lineReads++;
          const all = pages.get(id);
          assert(all, `Unknown synthetic line items ${id}`);
          const index = options.starting_after ? all.findIndex(page => page.at(-1)?.id === options.starting_after) + 1 : 0;
          assert(index >= 0 && index < all.length, 'Invalid line-item pagination cursor');
          return { data: all[index], has_more: index < all.length - 1 };
        }
      } }
    },
    account: async () => ({ kind: 'OK', accountId: EXPECTED_STRIPE_ACCOUNT, livemode: false }),
    transaction: fn => withTransaction(tx => fn({ query: async (sql, params) => {
      if (failJobInsert && /INSERT\s+INTO\s+jobs\b/i.test(sql)) {
        failJobInsert = false;
        throw new Error('Synthetic job insert failure after the order insert');
      }
      return tx.query(sql, params);
    } })),
    mintLink: async email => ({ url: `https://example.test/synthetic/${encodeURIComponent(email)}`, ttlMinutes: 15 }),
    send: async message => { sent.push(message); return { ok: true, transport: 'CONSOLE', id: 'synthetic' }; },
    recipients: () => ['synthetic-owner@example.test'],
    env: () => env
  }));
  app.use((error, _req, res, _next) => res.status(500).json({ message: error.message }));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function deliver(session, { id = `evt_${randomUUID().replaceAll('-', '')}`, type = 'checkout.session.completed', snapshot = {}, eventMode = false, invalidSignature = false } = {}) {
    const payload = JSON.stringify({ id, object: 'event', type, livemode: eventMode, created: Math.floor(Date.now() / 1000),
      data: { object: { ...session, ...snapshot } } });
    const signature = sdk.webhooks.generateTestHeaderString({ payload, secret: invalidSignature ? 'whsec_wrong_synthetic' : webhookSecret });
    const response = await fetch(`${origin}/api/v1/stripe/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': signature }, body: payload });
    const body = await response.text();
    let json; try { json = JSON.parse(body); } catch { json = null; }
    return { status: response.status, json, body };
  }
  async function count(session) {
    const { rows: [row] } = await pool.query(`SELECT
      (SELECT count(*)::integer FROM orders WHERE stripe_session_id=$1) AS orders,
      (SELECT count(*)::integer FROM jobs j JOIN users u ON u.id=j.user_id WHERE u.email=$2) AS jobs`, [session.id, session.customer_email]);
    return row;
  }
  function accepted(response) { assert.equal(response.status, 200, response.body); }
  const invalid = addSession('invalid_signature');
  const beforeInvalid = retrievals;
  assert.equal((await deliver(invalid, { invalidSignature: true })).status, 400);
  assert.equal(retrievals, beforeInvalid);
  assert.deepEqual(await count(invalid), { orders: 0, jobs: 0 });
  ok('invalid signatures cannot retrieve a provider session or persist work');

  const delayed = addSession('delayed', { payment_status: 'unpaid' });
  accepted(await deliver(delayed));
  accepted(await deliver(delayed, { type: 'checkout.session.async_payment_failed' }));
  assert.deepEqual(await count(delayed), { orders: 0, jobs: 0 });
  sessions.set(delayed.id, { ...delayed, payment_status: 'paid' });
  const delayedEvent = `evt_delayed_${randomUUID()}`;
  accepted(await deliver(delayed, { id: delayedEvent, type: 'checkout.session.async_payment_succeeded' }));
  assert.deepEqual(await count(delayed), { orders: 1, jobs: 1 });
  ok('unpaid completion and failed payment cannot fulfill; later async settlement creates one order/job');
  accepted(await deliver(delayed, { id: delayedEvent, type: 'checkout.session.async_payment_succeeded' }));
  accepted(await deliver(delayed, { snapshot: { payment_status: 'unpaid' } }));
  accepted(await deliver(delayed, { type: 'checkout.session.async_payment_failed' }));
  assert.deepEqual(await count(delayed), { orders: 1, jobs: 1 });
  assert.equal(sent.filter(message => message.to === delayed.customer_email).length, 1);
  ok('same event, different event IDs and out-of-order snapshots cannot duplicate settled fulfillment');

  const staleFailure = addSession('stale_failure');
  accepted(await deliver(staleFailure, { type: 'checkout.session.async_payment_failed' }));
  assert.deepEqual(await count(staleFailure), { orders: 0, jobs: 0 });
  accepted(await deliver(staleFailure, { type: 'checkout.session.async_payment_succeeded' }));
  assert.deepEqual(await count(staleFailure), { orders: 1, jobs: 1 });
  ok('even a stale failure notification cannot originate fulfillment; a later success can');

  const race = addSession('concurrent');
  const racing = await Promise.all(Array.from({ length: 12 }, (_, i) => deliver(race, {
    type: i % 2 ? 'checkout.session.async_payment_succeeded' : 'checkout.session.completed'
  })));
  racing.forEach(accepted);
  assert.deepEqual(await count(race), { orders: 1, jobs: 1 });
  assert.equal(racing.filter(response => response.json?.jobCreated === true).length, 1);
  assert.equal(sent.filter(message => message.to === race.customer_email).length, 1);
  ok('12 concurrent signed events for one session commit exactly one order/job');

  const rollback = addSession('rollback');
  const rollbackEvent = `evt_rollback_${randomUUID()}`;
  failJobInsert = true;
  assert.equal((await deliver(rollback, { id: rollbackEvent })).status, 500);
  assert.deepEqual(await count(rollback), { orders: 0, jobs: 0 });
  assert.equal((await pool.query('SELECT count(*)::integer AS n FROM users WHERE email=$1', [rollback.customer_email])).rows[0].n, 0);
  accepted(await deliver(rollback, { id: rollbackEvent }));
  assert.deepEqual(await count(rollback), { orders: 1, jobs: 1 });
  ok('a failed job insert rolls back its order/user claim and the same event retries successfully');

  const other = addSession('non_tuning', {}, [[line('li_non_tuning', 'price_other_business', [...NON_TUNING_PRODUCTS][0])]]);
  accepted(await deliver(other));
  assert.deepEqual(await count(other), { orders: 1, jobs: 0 });
  assert.equal(sent.filter(message => message.to === other.customer_email).length, 0);
  ok('an unrelated business payment is recorded without a tuning job or customer tuning email');

  for (const [label, changes, expectedStatus] of [
    ['subscription', { mode: 'subscription' }, 200],
    ['still_open', { status: 'open' }, 503],
    ['no_payment_required', { payment_status: 'no_payment_required' }, 200],
    ['provider_unpaid', { payment_status: 'unpaid' }, 200],
    ['unknown_payment_state', { payment_status: 'future_state' }, 503],
    ['missing_payment_state', { payment_status: undefined }, 503],
    ['unknown_session_mode', { mode: 'future_mode' }, 503],
    ['unknown_completion_state', { status: 'future_state' }, 503]
  ]) {
    const session = addSession(label, changes);
    const response = await deliver(session, { snapshot: { mode: 'payment', status: 'complete', payment_status: 'paid' } });
    assert.equal(response.status, expectedStatus, response.body);
    assert.deepEqual(await count(session), { orders: 0, jobs: 0 });
  }
  ok('signed snapshots cannot override authoritative session mode, completion or settled-payment state');

  const mismatch = addSession('event_mode_mismatch');
  const mismatchResponse = await deliver(mismatch, { eventMode: true });
  assert(mismatchResponse.status >= 400, mismatchResponse.body);
  assert.deepEqual(await count(mismatch), { orders: 0, jobs: 0 });
  const sessionMismatch = addSession('session_mode_mismatch', { livemode: true });
  assert((await deliver(sessionMismatch, { snapshot: { livemode: false } })).status >= 400);
  assert.deepEqual(await count(sessionMismatch), { orders: 0, jobs: 0 });
  ok('test credentials cannot process live-mode event or session data');

  const unknownPlatform = addSession('unknown_platform', { metadata: {} });
  accepted(await deliver(unknownPlatform));
  assert.deepEqual(await count(unknownPlatform), { orders: 1, jobs: 1 });
  const { rows: [unknownJob] } = await pool.query(`SELECT j.platform,j.fuel,j.induction FROM jobs j
    JOIN users u ON u.id=j.user_id WHERE u.email=$1`, [unknownPlatform.customer_email]);
  assert.deepEqual(unknownJob, { platform: 'UNKNOWN', fuel: null, induction: null });
  ok('a settled checkout with optional vehicle fields blank creates explicitly unknown, unconfirmed work');

  const paged = addSession('paginated', {}, [[line('li_other_page', 'price_unknown', 'prod_unknown')], [line('li_service_page')]]);
  const beforePages = lineReads;
  accepted(await deliver(paged));
  assert.equal(lineReads - beforePages, 2);
  assert.deepEqual(await count(paged), { orders: 1, jobs: 1 });
  ok('a service on the second line-item page is classified and fulfilled');

  console.log(JSON.stringify({ passed, syntheticOnly: true, databaseIsolated: true, realProviderRequests: 0, realEmails: 0 }));
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  if (applicationPool) await applicationPool.end();
  if (pool) await pool.end();
  if (databaseCreated) {
    assert(/^dd84_stripe_test_[a-f0-9]{32}$/.test(databaseName));
    await admin.query(`DROP DATABASE "${databaseName}"`);
  }
  await admin.end();
}
