// Checks the database rules. Run: npm i --no-save @electric-sql/pglite && node supabase/test-sql.mjs
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import fs from 'node:fs'
const db = new PGlite({ extensions: { pgcrypto } })
await db.exec(`create extension pgcrypto; create schema if not exists extensions; create or replace function extensions.digest(t text, a text) returns bytea language sql as $$ select public.digest(t::bytea, a) $$;
create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('app.uid', true),'')::uuid $$;
create role anon; create role authenticated; grant usage on schema public, auth, extensions to anon, authenticated;`)
const sql = fs.readFileSync(new URL('./migrations/0001_chess_lab.sql', import.meta.url), 'utf8')
await db.exec(sql); await db.exec(sql) // twice: must be re-runnable
const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222'
await db.exec(`insert into auth.users values ('${A}'),('${B}'); insert into public.worker_key values (encode(digest('s3cret','sha256'),'hex'));`)
const as = async (role, uid, q, p) => { await db.exec(`set role ${role}; set app.uid='${uid}'`); try { return await db.query(q, p) } finally { await db.exec('reset role') } }
const ok = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }
const fails = async (f) => { try { await f(); return false } catch { return true } }
await as('authenticated', A, `insert into tracked_accounts (chess_username) values ('leeoonchess')`)
ok((await as('authenticated', A, 'select * from tracked_accounts')).rows.length === 1, 'A sees own account')
ok((await as('authenticated', B, 'select * from tracked_accounts')).rows.length === 0, 'B sees nothing of A')
ok(await fails(() => as('authenticated', A, `insert into tracked_accounts (chess_username, user_id) values ('x1', '${B}')`)), 'cannot add for someone else')
ok(await fails(() => as('authenticated', A, `update tracked_accounts set analysed = 99`)), 'cannot edit counters')
ok(await fails(() => as('authenticated', A, `insert into tracked_accounts (chess_username) values ('Bad Name')`)), 'bad username refused')
for (const n of ['a1','a2','a3','a4']) await as('authenticated', A, `insert into tracked_accounts (chess_username) values ('${n}')`)
ok(await fails(() => as('authenticated', A, `insert into tracked_accounts (chess_username) values ('a5')`)), 'limit of 5 accounts')
ok(await fails(() => as('anon', A, `select * from tracked_accounts`)), 'anon cannot read')
ok(await fails(() => as('anon', A, `select worker_claim('wrong')`)), 'wrong secret denied')
ok(await fails(() => as('anon', A, `select * from worker_key`)), 'worker_key unreadable')
const job = (await as('anon', '', `select worker_claim('s3cret') j`)).rows[0].j
ok(job && job.user, 'worker claims a job: ' + JSON.stringify(job))
await as('anon', '', `select worker_put_months('s3cret', $1, '{"2026/10":[{"id":"1"}]}'::jsonb)`, [job.id])
await as('anon', '', `select worker_put_analysis('s3cret', $1, 'g1', '{"ev":[1]}'::jsonb, '{"acc":90}'::jsonb)`, [job.id])
await as('anon', '', `select worker_status('s3cret', $1, 'ready', 10, 1, 1, null, true)`, [job.id])
ok((await as('authenticated', A, `select count(*) c from games_months`)).rows[0].c == 1, 'A reads own months')
ok((await as('authenticated', B, `select count(*) c from analyses`)).rows[0].c == 0, 'B cannot read A analyses')
ok((await as('anon', '', `select worker_done_ids('s3cret', $1) d`, [job.id])).rows[0].d[0] === 'g1', 'done ids')
await as('authenticated', A, `update tracked_accounts set status='pending' where id=$1`, [job.id])
ok((await as('anon', '', `select worker_claim('s3cret') j`)).rows[0].j !== null, 'retry makes it claimable again')
await as('authenticated', A, `delete from tracked_accounts where id=$1`, [job.id])
ok((await db.query('select count(*) c from games_months')).rows[0].c == 0, 'delete cascades')
