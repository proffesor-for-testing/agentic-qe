// mint-bench-keys.mjs — mint the two benchmark-scoped cog_ keys for the
// Cognitum QE cost-Pareto benchmark. DRY-RUN BY DEFAULT (pure local, no creds,
// no Firestore calls). `--commit` performs the writes and reveals the key once.
//
// WHY TWO KEYS (the cost discipline, made architectural):
//   worker  — scopes completions:low + completions:mid  (NO high). Runs every
//             cheap attempt (policy P1 + the cheap leg of P3). Because the key
//             LACKS completions:high, no bug, greedy router, or runaway loop can
//             spend frontier money on bulk work — a server-side guarantee, not a
//             harness policy we hope holds.
//   judge   — scopes completions:high + completions:mid. The ONLY key that can
//             reach high tier, used solely in the advisor / final-judge / overturn
//             role (policy P2 reference + P3 escalations). Its spend is isolated
//             on its own accountId so "the expensive oracle" is separately meterable.
//
// WHY TWO WRITES PER KEY (the footgun this script exists to avoid):
//   A cog_ key with an api_keys/ doc but NO subscriptions/{accountId} doc is
//   admitted by meta-llm via its UNMETERED fast-path — i.e. UNCAPPED spend
//   (see cognitum website functions src/api/plans.ts header comment). So each
//   key MUST be seeded with a subscription (metered + hard-capped) BEFORE the
//   key doc exists. This script writes the subscription first, then the key.
//
// The subscription body mirrors subscriptionDocForPlan() in the website's
// functions/src/api/plans.ts EXACTLY, so meta-llm's FirestoreBudgetTracker /
// UsageReader read it without surprise. The api_keys body mirrors
// manageApiKeys' `create` (public-api.ts), same as api-explorer/mint-key.mjs.
//
// Usage:
//   node mint-bench-keys.mjs --role worker            # dry-run (prints the exact plan)
//   node mint-bench-keys.mjs --role judge --cap 5     # dry-run, $5 monthly cap
//   node mint-bench-keys.mjs --role worker --commit   # WRITE (needs firebase-admin + ADC + GOOGLE_CLOUD_PROJECT)
//
// Store the revealed key in Secret Manager (never commit it):
//   worker -> COG_QE_BENCH_WORKER_KEY   judge -> COG_QE_BENCH_JUDGE_KEY
import crypto from 'node:crypto';

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const COMMIT = argv.includes('--commit');
const ROLE = arg('--role');
const MONTHLY_CAP_USD = Number(arg('--cap', '5'));
const OWNER_EMAIL = arg('--owner', 'dragan@cognitum.one');
// --append-env <path>: write `export SECRET=key` straight into a shell rc / .env
// and print ONLY a masked prefix, so the plaintext key never reaches stdout.
const APPEND_ENV = arg('--append-env', null);

// Role → accountId + scopes. The scope split is the whole point: worker CANNOT
// hold completions:high. analytics:read lets each key read its own /v1/usage.
const ROLES = {
  worker: {
    accountId: 'qe-bench-worker',
    name: 'dragan+qe-bench-worker@cognitum.one',
    permissions: ['completions:low', 'completions:mid', 'analytics:read', 'bench:run'],
    secret: 'COG_QE_BENCH_WORKER_KEY',
  },
  judge: {
    accountId: 'qe-bench-judge',
    name: 'dragan+qe-bench-judge@cognitum.one',
    permissions: ['completions:high', 'completions:mid', 'analytics:read'],
    secret: 'COG_QE_BENCH_JUDGE_KEY',
  },
  // lowonly — mirrors a real SEED-ORDER key, which carries completions:low and nothing
  // higher. As of 2026-07-20 that is 529 of 535 active prod keys, so it is the shape most
  // customers actually hold; worker/judge both hold `mid` and therefore cannot exercise the
  // scope-shortfall paths (best_effort degradation, 402 upgrade_required) at all. Needed to
  // regression-test meta-llm#187 against the live service rather than only in unit/e2e.
  lowonly: {
    accountId: 'qe-bench-lowonly',
    name: 'dragan+qe-bench-lowonly@cognitum.one',
    permissions: ['completions:low', 'analytics:read'],
    secret: 'COG_QE_BENCH_LOWONLY_KEY',
  },
};

if (!ROLES[ROLE]) {
  console.error(`ERR: --role must be one of: ${Object.keys(ROLES).join(', ')}`);
  process.exit(2);
}
if (!Number.isFinite(MONTHLY_CAP_USD) || MONTHLY_CAP_USD <= 0) {
  console.error('ERR: --cap must be a positive number (USD).');
  process.exit(2);
}

const role = ROLES[ROLE];
const RATE_LIMIT = 60; // req/min — separate axis from the $ cap

// addOneMonth — anchor-stable, UTC. Mirrors plans.ts:addOneMonth so the period
// boundary lines up with meta-llm's lazy rollPeriodTo.
function addOneMonth(ts) {
  const d = new Date(ts);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  const daysInNewMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, daysInNewMonth));
  return d.getTime();
}

// Subscription body — mirrors website functions/src/api/plans.ts:subscriptionDocForPlan.
// monthlyCapUsd is the OPERATIVE hard cap meta-llm DENYs past each period.
// hardCapUsd is the lifetime runaway backstop (kept modestly above monthly).
function subscriptionBody(nowMs) {
  return {
    plan: 'qe-bench',
    status: 'active',
    servingBudgetUsd: MONTHLY_CAP_USD,
    hardCapUsd: MONTHLY_CAP_USD * 2,
    monthlyCapUsd: MONTHLY_CAP_USD,
    perAgentCapUsd: MONTHLY_CAP_USD,
    shardCount: 1,
    periodStart: nowMs,
    periodEnd: addOneMonth(nowMs),
    periodBaselineCommittedUsd: 0,
    committedUsd: 0,
    reservedUsd: 0,
    headroomExhausted: false,
  };
}

async function main() {
  const key = 'cog_' + crypto.randomBytes(32).toString('hex');
  const prefix = key.slice(0, 12);
  const hash = crypto.createHash('sha256').update(key).digest('hex');

  console.log(`=== MINT ${ROLE} (${COMMIT ? 'COMMIT' : 'DRY-RUN'}) ===`);
  console.log(`owner        : ${OWNER_EMAIL}`);
  console.log(`accountId    : ${role.accountId}`);
  console.log(`scopes (${role.permissions.length})   : ${role.permissions.join(', ')}`);
  console.log(`high tier?   : ${role.permissions.includes('completions:high') ? 'YES (judge/advisor only)' : 'NO — cannot spend frontier'}`);
  console.log(`monthly cap  : $${MONTHLY_CAP_USD}  (hardCap $${MONTHLY_CAP_USD * 2}, rateLimit ${RATE_LIMIT}/min)`);
  console.log(`subscription : subscriptions/${role.accountId}   (metered — NOT the unmetered fast-path)`);
  console.log(`api key doc  : api_keys/${hash}`);
  console.log(`env var      : ${role.secret}   (put the key in ~/.zshrc/.bashrc or .env — never in code)`);

  if (!COMMIT) {
    console.log('\ndry-run — no Firestore calls made. Re-run with --commit to write + reveal the key.');
    console.log('commit needs: firebase-admin installed, GOOGLE_CLOUD_PROJECT=<the api_keys/subscriptions project>, ADC with Firestore write.');
    return;
  }

  // Lazy-load firebase-admin ONLY on commit, so dry-run needs no deps/creds.
  const { initializeApp } = await import('firebase-admin/app');
  const { getAuth } = await import('firebase-admin/auth');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
  initializeApp(); // ADC + GOOGLE_CLOUD_PROJECT
  const db = getFirestore();

  let ownerUid = null;
  try { ownerUid = (await getAuth().getUserByEmail(OWNER_EMAIL)).uid; }
  catch { console.warn(`WARN: no Firebase Auth user for ${OWNER_EMAIL}; writing ownerEmail only.`); }

  // Idempotency: never clobber an existing wallet/key for this accountId.
  const subRef = db.collection('subscriptions').doc(role.accountId);
  if ((await subRef.get()).exists) {
    console.error(`ERR: subscriptions/${role.accountId} already exists — refusing to overwrite. Delete it first if re-minting.`);
    process.exit(1);
  }

  const now = Date.now();
  // 1. Subscription FIRST — so the key is metered the instant it exists.
  await subRef.set({
    ...subscriptionBody(now),
    accountId: role.accountId,
    ownerEmail: OWNER_EMAIL,
    createdAt: FieldValue.serverTimestamp(),
  });
  // 2. The scope-split key.
  await db.collection('api_keys').doc(hash).set({
    key: hash, prefix, name: role.name,
    accountId: role.accountId,
    ownerUid: ownerUid ?? OWNER_EMAIL, ownerEmail: OWNER_EMAIL,
    permissions: role.permissions, rateLimit: RATE_LIMIT,
    lastUsedAt: null, usageCount: 0, active: true,
    createdAt: FieldValue.serverTimestamp(), expiresAt: null,
  });
  // 3. Audit trail.
  await db.collection('audit_log').add({
    adminEmail: OWNER_EMAIL, action: 'api_key_created',
    targetCollection: 'api_keys', targetId: hash,
    details: { name: role.name, prefix, accountId: role.accountId, permissions: role.permissions, monthlyCapUsd: MONTHLY_CAP_USD, purpose: 'qe-cost-pareto-benchmark' },
    createdAt: FieldValue.serverTimestamp(),
  });

  console.log('\n✅ written (subscription + key + audit).');
  if (APPEND_ENV) {
    const { appendFileSync, readFileSync, existsSync } = await import('node:fs');
    const path = APPEND_ENV.startsWith('~') ? APPEND_ENV.replace('~', process.env.HOME) : APPEND_ENV;
    if (existsSync(path) && readFileSync(path, 'utf8').includes(`export ${role.secret}=`)) {
      console.log(`⚠ ${role.secret} already present in ${APPEND_ENV} — NOT appended (remove the old line to replace). Full key was minted but not written; re-run after cleaning the line.`);
    } else {
      appendFileSync(path, `\n# Cognitum QE benchmark — ${role.accountId} key (minted ${new Date().toISOString().slice(0, 10)})\nexport ${role.secret}=${key}\n`);
      console.log(`🔑 written to ${APPEND_ENV} as ${role.secret}=${key.slice(0, 12)}…  (full key NOT printed)`);
      console.log(`   load it:  source ${APPEND_ENV}   (or open a new shell)`);
    }
  } else {
    console.log('\n🔑 NEW KEY (copy now — shown once, do NOT commit it):\n\n   ' + key + '\n');
    console.log('Put it in your LOCAL CONFIG (the benchmark reads it from the env, never from code):');
    console.log(`   • ~/.zshrc or ~/.bashrc:   export ${role.secret}=<key>`);
    console.log(`   • or scripts/cognitum-qe-bench/.env   (gitignored):   ${role.secret}=<key>`);
  }
}
main().catch((e) => { console.error('ERR', e?.message || e); process.exit(1); });
