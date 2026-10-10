-- BECOMING OS — row-level security tests.
-- Run against a database with the migration applied (local stack or
-- `supabase start`):  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.test.sql
-- Every check runs as the `authenticated` role with a JWT subject, exactly as
-- PostgREST does, so these test the policies themselves rather than the UI.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- A = owner, B = partner, C = stranger
delete from auth.users where id in ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000c');
insert into auth.users (id, email, aud, role, raw_user_meta_data)
values ('00000000-0000-4000-8000-00000000000a', 'rls-a@test.dev', 'authenticated', 'authenticated', '{"display_name":"A","timezone":"America/New_York"}'),
       ('00000000-0000-4000-8000-00000000000b', 'rls-b@test.dev', 'authenticated', 'authenticated', '{"display_name":"B","timezone":"Not/AZone"}'),
       ('00000000-0000-4000-8000-00000000000c', 'rls-c@test.dev', 'authenticated', 'authenticated', '{"display_name":"C"}');

do $$ begin
  assert (select count(*) from public.profiles where id::text like '00000000-0000-4000-8000-00000000000%') = 3, 'profiles created by trigger';
  assert (select timezone from public.profiles where id = '00000000-0000-4000-8000-00000000000b') = 'America/New_York', 'invalid time zone falls back';
  assert (select weight from public.share_settings where user_id = '00000000-0000-4000-8000-00000000000a') = 'percent', 'default weight share is percent';
  assert (select business from public.share_settings where user_id = '00000000-0000-4000-8000-00000000000a') = 'none', 'business private by default';
end $$;

-- ── A creates records ──────────────────────────────────────────────────────
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
insert into public.body_goals (start_weight, start_date, target_loss, stretch_loss) values (267, '2026-10-10', 50, 60);
insert into public.weight_entries (entry_date, weight) values ('2026-10-10', 267), ('2026-10-11', 265), ('2026-10-12', 263);
insert into public.daily_checkins (checkin_date, sleep_hours) values ('2026-10-10', 7);
insert into public.workouts (id, workout_date, activity, duration_min, distance_mi) values ('10000000-0000-4000-8000-000000000001', '2026-10-11', 'run_walk', 30, 2);
insert into public.habits (id, name, start_date) values ('20000000-0000-4000-8000-000000000001', 'Read', '2026-10-10');
insert into public.habit_completions (habit_id, completed_on) values ('20000000-0000-4000-8000-000000000001', '2026-10-10');
insert into public.businesses (id, name) values ('30000000-0000-4000-8000-000000000001', 'Biz');
insert into public.transactions (id, business_id, kind, txn_date, amount) values ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'sale', '2026-10-11', 1500);
insert into public.transactions (business_id, kind, txn_date, amount, expense_category) values ('30000000-0000-4000-8000-000000000001', 'expense', '2026-10-12', 100, 'software');
insert into public.payments (transaction_id, paid_on, amount) values ('40000000-0000-4000-8000-000000000001', '2026-10-11', 500);
insert into public.journal_entries (entry_date, body, shared) values ('2026-10-10', 'private thoughts', false), ('2026-10-10', 'shared thoughts', true);
insert into public.achievements (key, category, title, achieved_on) values
  ('weight.5', 'weight', '5 pounds lost', '2026-10-12'), ('biz.revenue.1000', 'business', 'First $1,000 month', '2026-10-11'),
  ('habit.first_review', 'habit', 'First review', '2026-10-12'), ('level.2', 'level', 'Level 2', '2026-10-12');
commit;

-- ── payment and ownership validation ───────────────────────────────────────
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$ begin
  begin
    insert into public.payments (transaction_id, paid_on, amount) values ('40000000-0000-4000-8000-000000000001', '2026-10-12', 1001);
    assert false, 'overpayment must be rejected';
  exception when check_violation then null; end;
  begin
    insert into public.transactions (kind, txn_date, amount) values ('sale', '2026-10-12', 10);
    assert false, 'a sale without a business must be rejected';
  exception when check_violation then null; end;
  begin
    insert into public.weight_entries (entry_date, weight) values ('2026-10-12', 262);
    assert false, 'duplicate weigh-in for a day must be rejected';
  exception when unique_violation then null; end;
end $$;
commit;

-- ── before partnering, B and C see nothing of A's ──────────────────────────
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.weight_entries) = 0, 'B sees no weights before partnership';
  assert (select count(*) from public.achievements) = 0, 'B sees no achievements before partnership';
  assert (select count(*) from public.profiles) = 1, 'B sees only own profile';
  assert public.get_partner_overview() is null, 'no overview without partner';
end $$;
commit;

-- ── partner up: A invites, B accepts ───────────────────────────────────────
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
create temp table invite on commit drop as select public.create_invite() as code;
grant select on invite to authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$ begin
  begin
    perform public.accept_invite('WRONGCOD');
    assert false, 'invalid code must fail';
  exception when no_data_found then null; end;
end $$;
select public.accept_invite((select code from invite));
commit;

-- ── default sharing: percent / summary / milestones; business & health private
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
declare o jsonb := public.get_partner_overview();
begin
  assert o->>'display_name' = 'A', 'overview names partner';
  -- 7-day average of 267, 265, 263 = 265 → 2 lb of a 50 lb goal = 4%
  assert (o->'weight'->>'pct_primary')::numeric = 4, format('pct_primary was %s', o->'weight'->>'pct_primary');
  assert not (o->'weight' ? 'lost'), 'percent level hides pounds';
  assert not (o->'weight' ? 'start_weight'), 'percent level hides weights';
  assert (o->'training'->>'sessions_week') is not null, 'training summary shared';
  assert not (o ? 'business'), 'business hidden by default';
  assert (select count(*) from public.weight_entries) = 0, 'raw weights hidden at percent level';
  assert (select count(*) from public.body_goals) = 0, 'goals hidden at percent level';
  assert (select count(*) from public.workouts) = 0, 'raw workouts hidden at summary level';
  assert (select count(*) from public.habits) = 0, 'raw habits hidden at summary level';
  assert (select count(*) from public.daily_checkins) = 0, 'health private';
  assert (select count(*) from public.transactions) = 0, 'transactions private';
  assert (select count(*) from public.payments) = 0, 'payments private';
  assert (select count(*) from public.businesses) = 0, 'businesses private';
  assert (select count(*) from public.journal_entries) = 1, 'only the shared journal entry';
  assert (select body from public.journal_entries) = 'shared thoughts', 'shared entry body';
  assert (select count(*) from public.achievements where category = 'weight') = 0, 'weight milestones need pounds level';
  assert (select count(*) from public.achievements where category = 'business') = 0, 'business milestones need business sharing';
  assert (select count(*) from public.achievements where category in ('habit', 'level')) = 2, 'habit and level milestones shared';
  assert (select count(*) from public.profiles) = 2, 'partner profile visible';
end $$;
commit;

-- ── B can never write A's data ─────────────────────────────────────────────
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
declare n int;
begin
  begin
    insert into public.weight_entries (user_id, entry_date, weight) values ('00000000-0000-4000-8000-00000000000a', '2026-10-13', 200);
    assert false, 'B must not insert rows for A';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.habit_completions (habit_id, completed_on) values ('20000000-0000-4000-8000-000000000001', '2026-10-11');
    assert false, 'B must not complete A''s habit';
  exception when insufficient_privilege then null; end;
  update public.share_settings set business = 'full' where user_id = '00000000-0000-4000-8000-00000000000a';
  get diagnostics n = row_count;
  assert n = 0, 'B cannot change A''s sharing';
  delete from public.journal_entries where user_id = '00000000-0000-4000-8000-00000000000a';
  get diagnostics n = row_count;
  assert n = 0, 'B cannot delete A''s shared journal entry';
  update public.journal_entries set body = 'hacked';
  get diagnostics n = row_count;
  assert n = 0, 'B cannot edit A''s shared journal entry';
end $$;
commit;

-- ── A widens sharing; B sees exactly that much ─────────────────────────────
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
update public.share_settings set weight = 'pounds', business = 'summary';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
declare o jsonb := public.get_partner_overview();
begin
  assert (o->'weight'->>'lost')::numeric = 2, 'pounds level shows pounds lost';
  assert not (o->'weight' ? 'start_weight'), 'pounds level still hides weights';
  assert (select count(*) from public.weight_entries) = 0, 'pounds level still hides raw weights';
  assert (select count(*) from public.achievements where category = 'weight') = 1, 'weight milestones visible at pounds level';
  assert (o->'business'->>'value')::numeric = 1500, format('business summary = revenue earned, got %s', o->'business'->>'value');
  assert (select count(*) from public.transactions) = 0, 'summary level hides transactions';
  assert (select count(*) from public.achievements where category = 'business') = 1, 'business milestones visible at summary';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
update public.share_settings set weight = 'full', business = 'full', health = 'full', training = 'full';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
declare o jsonb := public.get_partner_overview();
begin
  assert (o->'weight'->>'start_weight')::numeric = 267, 'full level shows start weight';
  assert (select count(*) from public.weight_entries) = 3, 'full level shows raw weights';
  assert (select count(*) from public.transactions) = 2, 'full business shows transactions';
  assert (select count(*) from public.payments) = 1, 'full business shows payments';
  assert (select count(*) from public.daily_checkins) = 1, 'full health shows check-ins';
  assert (select count(*) from public.workouts) = 1, 'full training shows workouts';
  assert (select count(*) from public.journal_entries) = 1, 'journal still per-entry';
  assert (select count(*) from public.roadmap_notes) = 0, 'roadmap notes never shared';
end $$;
commit;

-- ── a stranger sees nothing even at full sharing ───────────────────────────
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.weight_entries) = 0, 'C sees no weights';
  assert (select count(*) from public.transactions) = 0, 'C sees no transactions';
  assert (select count(*) from public.journal_entries) = 0, 'C sees no journal';
  assert (select count(*) from public.achievements) = 0, 'C sees no achievements';
  assert (select count(*) from public.profiles) = 1, 'C sees only own profile';
  assert public.get_partner_overview() is null, 'C has no partner';
  begin
    perform public.accept_invite('ANYTHING');
    assert false, 'C cannot join';
  exception when no_data_found then null; end;
end $$;
commit;

-- ── anonymous requests get nothing ─────────────────────────────────────────
begin;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  begin
    perform count(*) from public.weight_entries;
    assert false, 'anon must not read tables';
  exception when insufficient_privilege then null; end;
end $$;
commit;

-- ── disconnecting removes access immediately ───────────────────────────────
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
select public.end_partnership();
do $$ begin
  assert (select count(*) from public.weight_entries) = 0, 'no access after disconnect';
  assert public.get_partner_overview() is null, 'no overview after disconnect';
end $$;
commit;

-- ── reset deletes only the caller's rows ───────────────────────────────────
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
insert into public.weight_entries (entry_date, weight) values ('2026-10-10', 180);
select public.reset_my_data();
do $$ begin
  assert (select count(*) from public.weight_entries) = 0, 'B data reset';
end $$;
commit;
do $$ begin
  assert (select count(*) from public.weight_entries where user_id = '00000000-0000-4000-8000-00000000000a') = 3, 'A data untouched by B reset';
end $$;

delete from auth.users where id in ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000c');
select 'RLS tests passed' as result;
