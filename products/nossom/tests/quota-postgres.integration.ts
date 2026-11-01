import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const container = process.env.NOSSOM_TEST_POSTGRES_CONTAINER;
if (!container)
  throw new Error(
    'Set NOSSOM_TEST_POSTGRES_CONTAINER to an isolated PostgreSQL 17 test container.',
  );
const sql = (value: string) => {
  const result = spawnSync(
    'docker',
    ['exec', '-i', container, 'psql', '-U', 'postgres', '-tA', '-v', 'ON_ERROR_STOP=1'],
    { input: value, encoding: 'utf8' },
  );
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
};
const alice = '11111111-1111-4111-8111-111111111111',
  bob = '22222222-2222-4222-8222-222222222222',
  admin = '33333333-3333-4333-8333-333333333333',
  unconfirmed = '44444444-4444-4444-8444-444444444444';
function query(user: string, id?: string, op = 'auto') {
  return `begin; set local role authenticated; set local "request.jwt.claim.sub"='${user}'; select public.nossom_audio_usage(${id ? `'${id}'::uuid, '${op}'` : ''}); commit;`;
}
function usage(user: string, id?: string, op = 'auto') {
  return JSON.parse(
    sql(query(user, id, op))
      .split('\n')
      .find((x) => x.startsWith('{'))!,
  );
}
// Isolated container only: minimal GoTrue tables/roles, never a production project.
sql(
  `create role anon; create role authenticated; create role service_role; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}',created_at timestamptz default now()); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; insert into auth.users(id,email,email_confirmed_at) values ('${alice}','alice@example.test',now()),('${bob}','bob@example.test',now()),('${admin}','adm@example.test',now()),('${unconfirmed}','adm-sem-confirmar@example.test',null);`,
);
sql(readFileSync('supabase/migrations/202610220001_accounts_and_weekly_usage.sql', 'utf8'));
test('real PostgreSQL authorizes exactly 10 concurrent treatments per user across connections', async () => {
  const requests = Array.from(
    { length: 18 },
    () =>
      new Promise<any>((resolve, reject) => {
        const child = spawn('docker', [
          'exec',
          '-i',
          container,
          'psql',
          '-U',
          'postgres',
          '-tA',
          '-v',
          'ON_ERROR_STOP=1',
        ]);
        let out = '',
          err = '';
        child.stdout.on('data', (d) => (out += d));
        child.stderr.on('data', (d) => (err += d));
        child.on('close', (code) =>
          code
            ? reject(new Error(err))
            : resolve(JSON.parse(out.split('\n').find((x) => x.startsWith('{'))!)),
        );
        child.stdin.end(query(alice, randomUUID()));
      }),
  );
  const results = await Promise.all(requests);
  assert.equal(results.filter((x) => x.allowed).length, 10);
  assert.equal(results.filter((x) => !x.allowed).length, 8);
  assert.equal(usage(alice).used, 10);
  assert.equal(usage(bob).used, 0);
  assert.equal(usage(alice, randomUUID()).allowed, false);
});
test('verified admin exceeds 10 while an unconfirmed account with the same admin link has the normal quota', () => {
  for (let i = 0; i < 13; i++) assert.equal(usage(admin, randomUUID()).allowed, true);
  assert.equal(usage(admin).unlimited, true);
  assert.equal(usage(admin).remaining, null);
  for (let i = 0; i < 10; i++) assert.equal(usage(unconfirmed, randomUUID()).allowed, true);
  assert.equal(usage(unconfirmed, randomUUID()).allowed, false);
  assert.equal(usage(unconfirmed).unlimited, false);
});
test('weekly reset uses Monday midnight in Fortaleza and an old authorization cannot be reused', () => {
  const oldId = randomUUID();
  sql(
    `insert into nossom_private.audio_treatments(user_id,request_id,week_start,operation) values('${bob}','${oldId}',(date_trunc('week',now() at time zone 'America/Fortaleza') - interval '7 days') at time zone 'America/Fortaleza','auto');`,
  );
  assert.equal(usage(bob).used, 0);
  assert.throws(() => usage(bob, oldId), /already used/);
  const reset = usage(bob).resetAt;
  assert.equal(new Date(reset).getUTCDay(), 1);
  assert.equal(new Date(reset).getUTCHours(), 3);
  const id = randomUUID();
  assert.equal(usage(bob, id).used, 1);
  assert.equal(usage(bob, id).used, 1);
  assert.throws(() => usage(bob, id, 'eq'), /already used/);
});
test('anonymous calls, direct ledger edits and missing identities are rejected by database permissions', () => {
  assert.throws(
    () => sql('set role anon; select public.nossom_audio_usage();'),
    /permission denied/,
  );
  assert.throws(
    () => sql(`set role authenticated; select * from nossom_private.audio_treatments;`),
    /permission denied/,
  );
  assert.throws(
    () => sql(`set role authenticated; delete from nossom_private.audio_treatments;`),
    /permission denied/,
  );
  assert.throws(
    () => sql(`set role authenticated; select public.nossom_audio_usage();`),
    /Authentication required/,
  );
});

// New queue RPC is service-only; use the same isolated PostgreSQL container.
sql(readFileSync('supabase/migrations/202610230001_cloud_restoration.sql', 'utf8'));
const cloudUser = '55555555-5555-4555-8555-555555555555';
sql(
  `insert into auth.users(id,email,email_confirmed_at) values ('${cloudUser}','cloud@example.test',now());`,
);
function cloudQuery(action: string, id: string, user = cloudUser, data: unknown = {}) {
  return `set role service_role; select public.nossom_restoration_job('${action}','${user}','${id}','${JSON.stringify(data)}'::jsonb);`;
}
function cloud(action: string, id: string, user = cloudUser, data: unknown = {}) {
  return JSON.parse(
    sql(cloudQuery(action, id, user, data))
      .split('\n')
      .find((x) => x.startsWith('{'))!,
  );
}
test('GPU queue claims one dispatch across concurrent connections and enforces private ownership', async () => {
  const id = randomUUID();
  assert.equal(
    cloud('prepare', id, cloudUser, { input_bytes: 1000, input_parts: 1, duration: 1 }).job.id,
    id,
  );
  assert.equal(
    cloud('prepare', randomUUID(), cloudUser, { input_bytes: 1000, input_parts: 1, duration: 1 })
      .job,
    null,
  );
  const claims = await Promise.all(
    Array.from(
      { length: 8 },
      () =>
        new Promise<any>((resolve, reject) => {
          const child = spawn('docker', [
            'exec',
            '-i',
            container,
            'psql',
            '-U',
            'postgres',
            '-tA',
            '-v',
            'ON_ERROR_STOP=1',
          ]);
          let out = '',
            err = '';
          child.stdout.on('data', (d) => (out += d));
          child.stderr.on('data', (d) => (err += d));
          child.on('close', (code) =>
            code
              ? reject(new Error(err))
              : resolve(JSON.parse(out.split('\n').find((x) => x.startsWith('{'))!)),
          );
          child.stdin.end(cloudQuery('claim', id));
        }),
    ),
  );
  assert.equal(claims.filter((x) => x.claimed).length, 1);
  assert.equal(cloud('get', id, bob).job, null);
  assert.throws(
    () =>
      sql(
        `set role authenticated; select public.nossom_restoration_job('get','${cloudUser}','${id}');`,
      ),
    /permission denied/,
  );
  assert.throws(
    () =>
      sql(`set role anon; select public.nossom_restoration_job('prepare','${cloudUser}','${id}');`),
    /permission denied/,
  );
  assert.equal(usage(cloudUser, id).used, 1);
  assert.equal(cloud('fail', id).job.status, 'failed');
  assert.equal(usage(cloudUser).used, 0);
  assert.equal(cloud('claim', id).claimed, false);
  assert.equal(cloud('release', id).job.status, 'released');
});

sql(readFileSync('supabase/migrations/202610230002_plans_and_admin.sql', 'utf8'));
function planUsage(user: string, id?: string) {
  return JSON.parse(
    sql(
      `begin; set local role authenticated; set local "request.jwt.claim.sub"='${user}'; select public.nossom_plan_usage(${id ? `'${id}'::uuid` : ''}); commit;`,
    )
      .split('\n')
      .find((x) => x.startsWith('{'))!,
  );
}
function adminRpc(user: string, action: string, data: unknown = {}) {
  return JSON.parse(
    sql(
      `begin; set local role authenticated; set local "request.jwt.claim.sub"='${user}'; select public.nossom_admin('${action}','${JSON.stringify(data)}'::jsonb); commit;`,
    )
      .split('\n')
      .find((x) => x.startsWith('{'))!,
  );
}
test('monthly GPU minutes enforce free duration atomically, minimum one minute, and refund confirmed failures', async () => {
  assert.equal(planUsage(cloudUser).limitSeconds, 300);
  const ids = Array.from({ length: 4 }, () => randomUUID());
  for (const id of ids)
    sql(
      `insert into nossom_private.restoration_jobs(id,user_id,status,input_bytes,input_parts,duration) values('${id}','${cloudUser}','submitting',1000,1,120);`,
    );
  const results = await Promise.all(
    ids.map(
      (id) =>
        new Promise<any>((resolve, reject) => {
          const child = spawn('docker', [
            'exec',
            '-i',
            container,
            'psql',
            '-U',
            'postgres',
            '-tA',
            '-v',
            'ON_ERROR_STOP=1',
          ]);
          let out = '',
            err = '';
          child.stdout.on('data', (d) => (out += d));
          child.stderr.on('data', (d) => (err += d));
          child.on('close', (code) =>
            code
              ? reject(new Error(err))
              : resolve(JSON.parse(out.split('\n').find((x) => x.startsWith('{'))!)),
          );
          child.stdin.end(
            `begin;set local role authenticated;set local "request.jwt.claim.sub"='${cloudUser}';select public.nossom_plan_usage('${id}');commit;`,
          );
        }),
    ),
  );
  assert.equal(results.filter((r) => r.allowed).length, 2);
  assert.equal(planUsage(cloudUser).usedSeconds, 240);
  const approved = ids.find((_, i) => results[i].allowed)!;
  assert.equal(planUsage(cloudUser, approved).usedSeconds, 240);
  cloud('fail', approved);
  assert.equal(planUsage(cloudUser).usedSeconds, 120);
  const short = randomUUID();
  sql(
    `insert into nossom_private.restoration_jobs(id,user_id,status,input_bytes,input_parts,duration) values('${short}','${cloudUser}','submitting',1000,1,2);`,
  );
  assert.equal(planUsage(cloudUser, short).usedSeconds, 180);
  assert.throws(() => planUsage(bob, short), /not authorized/);
  assert.equal(planUsage(admin).unlimited, true);
});
test('admin alone assigns paid plans, changes catalog, views charts; expired membership falls back to free', () => {
  assert.throws(() => adminRpc(bob, 'dashboard'), /Admin required/);
  assert.throws(() => adminRpc(unconfirmed, 'dashboard'), /Admin required/);
  assert.throws(
    () =>
      adminRpc(bob, 'set_member', {
        userId: bob,
        planId: 'studio',
        secondsOverride: null,
        expiresAt: null,
        blocked: false,
      }),
    /Admin required/,
  );
  assert.equal(
    adminRpc(admin, 'set_member', {
      userId: bob,
      planId: 'essential',
      secondsOverride: null,
      expiresAt: null,
      blocked: false,
    }).ok,
    true,
  );
  assert.equal(planUsage(bob).limitSeconds, 7200);
  assert.equal(
    adminRpc(admin, 'set_member', {
      userId: bob,
      planId: 'studio',
      secondsOverride: 900,
      expiresAt: null,
      blocked: false,
    }).ok,
    true,
  );
  assert.equal(planUsage(bob).limitSeconds, 900);
  adminRpc(admin, 'set_member', {
    userId: bob,
    planId: 'studio',
    secondsOverride: 900,
    expiresAt: '2020-01-01T00:00:00Z',
    blocked: false,
  });
  assert.equal(planUsage(bob).planId, 'free');
  assert.equal(planUsage(bob).limitSeconds, 300);
  adminRpc(admin, 'set_plan', {
    planId: 'essential',
    name: 'Essencial',
    monthlySeconds: 7500,
    priceCents: 3900,
  });
  const dashboard = adminRpc(admin, 'dashboard');
  assert.equal(dashboard.days.length, 30);
  assert.ok(dashboard.users.length >= 5);
  assert.equal(dashboard.plans.find((p: any) => p.id === 'essential').monthly_seconds, 7500);
  assert.ok(dashboard.totals.monthlySeconds >= 180);
  assert.throws(
    () => sql('set role anon; select public.nossom_plan_usage();'),
    /permission denied/,
  );
  assert.throws(
    () => sql('set role authenticated; select * from nossom_private.memberships;'),
    /permission denied/,
  );
});

sql(readFileSync('supabase/migrations/202610240001_ai_allowance_and_orphan_sweep.sql', 'utf8'));
function aiSession(user: string) {
  return JSON.parse(
    sql(
      `begin; set local role authenticated; set local "request.jwt.claim.sub"='${user}'; select public.nossom_ai_session(); commit;`,
    )
      .split('\n')
      .find((x) => x.startsWith('{'))!,
  );
}
test('assistant sessions are capped per account per day; the confirmed admin is not', () => {
  for (let i = 1; i <= 40; i++)
    assert.deepEqual(aiSession(bob), { allowed: true, used: i, limit: 40 });
  assert.equal(aiSession(bob).allowed, false);
  assert.equal(aiSession(alice).used, 1);
  assert.equal(aiSession(admin).allowed, true);
  assert.equal(aiSession(unconfirmed).used, 1);
  assert.throws(
    () => sql(`set role anon; select public.nossom_ai_session();`),
    /permission denied/,
  );
});
test('released jobs stay listed for an orphan sweep and repeated prepares are bounded per day', () => {
  const user = '66666666-6666-4666-8666-666666666666';
  sql(
    `insert into auth.users(id,email,email_confirmed_at) values ('${user}','sweep@example.test',now());`,
  );
  const id = randomUUID();
  cloud('prepare', id, user, { input_bytes: 1000, input_parts: 1, duration: 1 });
  cloud('fail', id, user);
  cloud('release', id, user);
  sql(
    `update nossom_private.restoration_jobs set updated_at=now()-interval '4 hours' where id='${id}';`,
  );
  const before = sql(`select updated_at from nossom_private.restoration_jobs where id='${id}';`);
  cloud('release', id, user);
  assert.equal(
    sql(`select updated_at from nossom_private.restoration_jobs where id='${id}';`),
    before,
  );
  const orphans = JSON.parse(
    sql(`set role service_role; select public.nossom_restoration_job('orphans',null);`)
      .split('\n')
      .find((x) => x.startsWith('{'))!,
  );
  assert.ok(orphans.jobs.some((j: { id: string }) => j.id === id));
  for (let i = 0; i < 39; i++) {
    const next = randomUUID();
    assert.equal(
      cloud('prepare', next, user, { input_bytes: 1000, input_parts: 1, duration: 1 }).job.id,
      next,
    );
    cloud('fail', next, user);
  }
  const blocked = cloud('prepare', randomUUID(), user, {
    input_bytes: 1000,
    input_parts: 1,
    duration: 1,
  });
  assert.equal(blocked.job, null);
  assert.equal(blocked.limited, true);
});
sql(readFileSync('supabase/migrations/202610250001_stripe_subscriptions.sql', 'utf8'));
function subscription(user: string, action: string, data: unknown = {}) {
  return JSON.parse(
    sql(
      `set role service_role; select public.nossom_subscription('${action}','${user}','${JSON.stringify(data)}'::jsonb);`,
    )
      .split('\n')
      .find((x) => x.startsWith('{'))!,
  );
}
test('a Stripe subscription grants its plan while paid, ends it when cancelled, and never touches a manual plan', () => {
  const payer = '77777777-7777-4777-8777-777777777777',
    manual = '88888888-8888-4888-8888-888888888888',
    end = new Date(Date.now() + 30 * 86400000).toISOString();
  sql(
    `insert into auth.users(id,email,email_confirmed_at) values ('${payer}','payer@example.test',now()),('${manual}','manual@example.test',now());`,
  );
  // Browsers and anonymous callers cannot reach it, even for their own account.
  assert.throws(
    () =>
      sql(
        `begin; set local role authenticated; set local "request.jwt.claim.sub"='${payer}'; select public.nossom_subscription('get','${payer}'); commit;`,
      ),
    /permission denied/,
  );
  assert.throws(
    () => sql(`set role anon; select public.nossom_subscription('get','${payer}');`),
    /permission denied/,
  );
  assert.equal(subscription(payer, 'get').subscription, null);
  assert.equal(
    subscription(payer, 'customer', { customerId: 'cus_a' }).subscription.customer_id,
    'cus_a',
  );
  // One customer per account: a second creation keeps the first.
  assert.equal(
    subscription(payer, 'customer', { customerId: 'cus_b' }).subscription.customer_id,
    'cus_a',
  );
  const paid = {
    customerId: 'cus_a',
    subscriptionId: 'sub_a',
    planId: 'studio',
    status: 'active',
    periodEnd: end,
    cancelAtPeriodEnd: false,
  };
  // Another account's customer cannot be applied to this one.
  assert.throws(
    () => subscription(payer, 'apply', { ...paid, customerId: 'cus_x' }),
    /does not belong/,
  );
  assert.throws(
    () => subscription(payer, 'apply', { ...paid, planId: 'free' }),
    /Invalid subscription/,
  );
  subscription(payer, 'apply', paid);
  assert.equal(planUsage(payer).planId, 'studio');
  assert.equal(planUsage(payer).limitSeconds, 21600);
  // A late event about an older, ended subscription is ignored.
  assert.equal(
    subscription(payer, 'apply', { ...paid, subscriptionId: 'sub_old', status: 'canceled' })
      .ignored,
    true,
  );
  assert.equal(planUsage(payer).planId, 'studio');
  // Payment pending keeps the plan; cancellation ends it.
  subscription(payer, 'apply', { ...paid, status: 'past_due' });
  assert.equal(planUsage(payer).planId, 'studio');
  subscription(payer, 'apply', { ...paid, status: 'canceled' });
  assert.equal(planUsage(payer).planId, 'free');
  // A plan the ADM set by hand survives an ended subscription.
  adminRpc(admin, 'set_member', {
    userId: manual,
    planId: 'essential',
    secondsOverride: null,
    expiresAt: null,
    blocked: false,
  });
  subscription(manual, 'customer', { customerId: 'cus_m' });
  subscription(manual, 'apply', {
    ...paid,
    customerId: 'cus_m',
    subscriptionId: 'sub_m',
    planId: 'essential',
    status: 'canceled',
  });
  assert.equal(planUsage(manual).planId, 'essential');
  // Each applied state is audited; the ignored late event is not.
  assert.equal(
    sql(
      `select count(*) from nossom_private.plan_audit where action='stripe' and target='${payer}';`,
    ),
    '3',
  );
});
sql(readFileSync('supabase/migrations/202610250002_zro_links.sql', 'utf8'));
sql(readFileSync('supabase/migrations/202610280001_zro_release.sql', 'utf8'));
sql(readFileSync('supabase/migrations/202611010001_admin_da_plataforma.sql', 'utf8'));
// Os testes rodam depois de todas as migrações: o ADM é o admin da plataforma Absolute ZRO guardado no vínculo
// (claim `zro_admin`), com e-mail confirmado aqui. A conta sem e-mail confirmado tem o mesmo vínculo e não é ADM.
zroLink('link', admin, 'zro-adm', { email: 'adm@example.test', products: ['nossom'], admin: true });
zroLink('link', unconfirmed, 'zro-adm-2', {
  email: 'adm2@example.test',
  products: ['nossom'],
  admin: true,
});
function zroLink(action: string, user: string | null, sub: string | null, data: unknown = {}) {
  return JSON.parse(
    sql(
      `set role service_role; select public.nossom_zro_link('${action}',${user ? `'${user}'` : 'null'},${sub ? `'${sub}'` : 'null'},'${JSON.stringify(data)}'::jsonb);`,
    )
      .split('\n')
      .find((x) => x.startsWith('{'))!,
  );
}
test('Absolute ZRO links stay server-only, one person per account, and the only login is kept', () => {
  const linked = '99999999-9999-4999-8999-999999999999',
    created = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  sql(
    `insert into auth.users(id,email,email_confirmed_at) values ('${linked}','lia@example.test',now()),('${created}','zro@example.test',now()),('${other}','other@example.test',now());`,
  );
  // Browsers and anonymous callers reach neither the table nor the function, even for themselves.
  for (const role of ['anon', 'authenticated']) {
    assert.throws(
      () =>
        sql(
          `begin; set local role ${role}; set local "request.jwt.claim.sub"='${linked}'; select public.nossom_zro_link('get','${linked}'); commit;`,
        ),
      /permission denied/,
    );
    assert.throws(
      () =>
        sql(
          `begin; set local role ${role}; set local "request.jwt.claim.sub"='${linked}'; select * from nossom_private.zro_links; commit;`,
        ),
      /permission denied/,
    );
  }
  assert.equal(
    sql(`select relrowsecurity from pg_class where oid='nossom_private.zro_links'::regclass;`),
    't',
  );
  const lia = { email: 'Lia@Example.test', organization: 'Produtora', products: ['nossom'] };
  assert.equal(zroLink('find', null, 'zro-lia', lia).userId, null);
  assert.equal(zroLink('get', linked, null).link, null);
  assert.equal(zroLink('link', linked, 'zro-lia', lia).ok, true);
  assert.equal(zroLink('find', null, 'zro-lia', lia).userId, linked);
  assert.equal(zroLink('get', linked, null).link.email, 'lia@example.test');
  // Same person on another account, or another person on this account: refused.
  assert.equal(zroLink('link', other, 'zro-lia', lia).error, 'other_account');
  assert.equal(zroLink('link', linked, 'zro-outra', lia).error, 'already_linked');
  assert.throws(() => zroLink('link', null, 'zro-x', lia), /Account required/);
  // An account with a password may unlink; one created by the ZRO keeps its only login.
  assert.equal(zroLink('unlink', linked, null).ok, true);
  assert.equal(zroLink('find', null, 'zro-lia', lia).userId, null);
  zroLink('link', created, 'zro-new', { ...lia, email: 'zro@example.test', createdByZro: true });
  assert.equal(zroLink('get', created, null).link.createdByZro, true);
  assert.equal(zroLink('unlink', created, null).error, 'only_login');
  assert.equal(zroLink('find', null, 'zro-new', lia).userId, created);
  // Deleting the account removes the link.
  sql(`delete from auth.users where id='${created}';`);
  assert.equal(zroLink('find', null, 'zro-new', lia).userId, null);
});
test('ADM is only the platform admin saved on the Absolute ZRO link, re-read at each login; never an e-mail', () => {
  const pessoa = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  sql(
    `insert into auth.users(id,email,email_confirmed_at) values ('${pessoa}','nova@example.test',now());`,
  );
  const dados = { email: 'nova@example.test', products: ['nossom'] };
  zroLink('link', pessoa, 'zro-nova', dados);
  assert.equal(zroLink('get', pessoa, null).link.admin, false);
  assert.equal(planUsage(pessoa).unlimited, false);
  assert.throws(() => adminRpc(pessoa, 'dashboard'), /Admin required/);
  // Entrou de novo pela Absolute ZRO, agora admin da plataforma: vira ADM em toda função.
  assert.equal(zroLink('find', null, 'zro-nova', { ...dados, admin: true }).userId, pessoa);
  assert.equal(zroLink('get', pessoa, null).link.admin, true);
  assert.equal(planUsage(pessoa).unlimited, true);
  assert.equal(usage(pessoa).unlimited, true);
  assert.equal(aiSession(pessoa).limit, null);
  assert.ok(
    adminRpc(pessoa, 'dashboard').users.some((u: any) => u.id === pessoa && u.is_admin === true),
  );
  // Um texto no lugar do booleano não vale; perdeu o papel no HUB, deixa de ser ADM no próximo login.
  zroLink('find', null, 'zro-nova', { ...dados, admin: 'true' });
  assert.equal(planUsage(pessoa).unlimited, false);
  // Sem vínculo, ninguém é ADM.
  zroLink('find', null, 'zro-nova', { ...dados, admin: true });
  assert.equal(zroLink('unlink', pessoa, null).ok, true);
  assert.equal(planUsage(pessoa).unlimited, false);
  assert.equal(planUsage(unconfirmed).unlimited, false);
  assert.equal(
    sql(
      `select count(*) from pg_proc where prosrc like '%@%.com%' and pronamespace in ('public'::regnamespace,'nossom_private'::regnamespace);`,
    ),
    '0',
  );
});
