-- LEEO Chess Lab: tracked chess.com accounts, their games and engine results.
-- Safe to run more than once. Run in Supabase: SQL Editor, New query, paste, Run.

create table if not exists public.tracked_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  chess_username text not null check (chess_username ~ '^[a-z0-9_-]{2,40}$'),
  status text not null default 'pending' check (status in ('pending','reading','analysing','ready','error')),
  games_total int not null default 0,
  analysed int not null default 0,
  analysis_target int not null default 0,
  depth int not null default 14 check (depth between 8 and 20),
  last_error text,
  touched_at timestamptz,
  refreshed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, chess_username)
);

create table if not exists public.games_months (
  account_id uuid not null references public.tracked_accounts(id) on delete cascade,
  ym text not null,
  data jsonb not null,
  primary key (account_id, ym)
);

create table if not exists public.analyses (
  account_id uuid not null references public.tracked_accounts(id) on delete cascade,
  game_id text not null,
  data jsonb not null,
  summary jsonb not null default '{}',
  primary key (account_id, game_id)
);
alter table public.analyses add column if not exists summary jsonb not null default '{}';

-- holds the sha256 of the worker secret; no policies, so nobody can read it through the API
create table if not exists public.worker_key (h text not null);

alter table public.tracked_accounts enable row level security;
alter table public.games_months enable row level security;
alter table public.analyses enable row level security;
alter table public.worker_key enable row level security;

-- people only ever see and change their own accounts
drop policy if exists ta_select on public.tracked_accounts;
create policy ta_select on public.tracked_accounts for select to authenticated using (user_id = auth.uid());
drop policy if exists ta_insert on public.tracked_accounts;
create policy ta_insert on public.tracked_accounts for insert to authenticated
  with check (user_id = auth.uid() and (select count(*) from public.tracked_accounts t where t.user_id = auth.uid()) < 5);
drop policy if exists ta_update on public.tracked_accounts;
create policy ta_update on public.tracked_accounts for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and status = 'pending');
drop policy if exists ta_delete on public.tracked_accounts;
create policy ta_delete on public.tracked_accounts for delete to authenticated using (user_id = auth.uid());

drop policy if exists gm_select on public.games_months;
create policy gm_select on public.games_months for select to authenticated
  using (exists (select 1 from public.tracked_accounts a where a.id = account_id and a.user_id = auth.uid()));
drop policy if exists an_select on public.analyses;
create policy an_select on public.analyses for select to authenticated
  using (exists (select 1 from public.tracked_accounts a where a.id = account_id and a.user_id = auth.uid()));

revoke all on public.tracked_accounts, public.games_months, public.analyses, public.worker_key from anon, authenticated;
grant select, delete on public.tracked_accounts to authenticated;
grant insert (chess_username, depth) on public.tracked_accounts to authenticated;
grant update (status, depth) on public.tracked_accounts to authenticated;
grant select on public.games_months, public.analyses to authenticated;

-- Worker functions. The background job calls these with the public key plus the worker secret.
-- They can only do the few things below, so no powerful database key is ever stored anywhere.
create or replace function public._worker_ok(secret text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.worker_key where h = encode(extensions.digest(secret, 'sha256'), 'hex'))
$$;
revoke all on function public._worker_ok(text) from public, anon, authenticated;

create or replace function public.worker_claim(secret text) returns json
language plpgsql security definer set search_path = '' as $$
declare a public.tracked_accounts;
begin
  if not public._worker_ok(secret) then raise exception 'denied'; end if;
  select * into a from public.tracked_accounts
    where status in ('pending', 'reading', 'analysing') or (status = 'ready' and refreshed_at < now() - interval '12 hours')
    order by touched_at asc nulls first limit 1 for update skip locked;
  if not found then return null; end if;
  update public.tracked_accounts set touched_at = now(), status = case when status = 'ready' then 'reading' else status end where id = a.id;
  return json_build_object('id', a.id, 'user', a.chess_username, 'depth', a.depth, 'first', a.games_total = 0);
end $$;

create or replace function public.worker_status(secret text, acc uuid, st text, total int, done int, target int, err text, finished boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public._worker_ok(secret) then raise exception 'denied'; end if;
  update public.tracked_accounts set status = st, games_total = coalesce(total, games_total), analysed = coalesce(done, analysed),
    analysis_target = coalesce(target, analysis_target), last_error = err, touched_at = now(),
    refreshed_at = case when finished then now() else refreshed_at end
  where id = acc;
end $$;

create or replace function public.worker_put_months(secret text, acc uuid, months jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public._worker_ok(secret) then raise exception 'denied'; end if;
  insert into public.games_months (account_id, ym, data)
    select acc, key, value from jsonb_each(months)
    on conflict (account_id, ym) do update set data = excluded.data;
end $$;

create or replace function public.worker_put_analysis(secret text, acc uuid, gid text, d jsonb, s jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public._worker_ok(secret) then raise exception 'denied'; end if;
  insert into public.analyses (account_id, game_id, data, summary) values (acc, gid, d, s)
    on conflict (account_id, game_id) do update set data = excluded.data, summary = excluded.summary;
end $$;

create or replace function public.worker_done_ids(secret text, acc uuid) returns text[]
language plpgsql security definer set search_path = '' as $$
begin
  if not public._worker_ok(secret) then raise exception 'denied'; end if;
  return coalesce((select array_agg(game_id) from public.analyses where account_id = acc), '{}');
end $$;

revoke all on function public.worker_claim(text), public.worker_status(text, uuid, text, int, int, int, text, boolean),
  public.worker_put_months(text, uuid, jsonb), public.worker_put_analysis(text, uuid, text, jsonb, jsonb), public.worker_done_ids(text, uuid) from public;
grant execute on function public.worker_claim(text), public.worker_status(text, uuid, text, int, int, int, text, boolean),
  public.worker_put_months(text, uuid, jsonb), public.worker_put_analysis(text, uuid, text, jsonb, jsonb), public.worker_done_ids(text, uuid) to anon, authenticated;
