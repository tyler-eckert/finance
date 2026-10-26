-- =====================================================================
set client_min_messages = warning;
-- eckert.fin · 2100 · faster app load (fixes "canceling statement due to statement timeout")
--
-- 1. Vendor key is stored on each transaction instead of recomputed by
--    regex for every row on every load (was ~2/3 of app_snapshot_extra).
-- 2. RLS checks membership once per query instead of once per row.
-- 3. The two load RPCs check membership up front, then read directly
--    (security definer), skipping row-by-row RLS on ~30k transactions.
-- 4. A little more headroom on the API statement timeout.
-- Safe to re-run.
-- =====================================================================

-- 1. stored vendor key ------------------------------------------------
alter table finance.transactions
  add column if not exists vendor_key text generated always as (finance.vendor_key(description)) stored;
create index if not exists transactions_hh_vendor_idx on finance.transactions (household_id, vendor_key);

create or replace view finance.v_vendor_monthly with (security_invoker = true) as
select t.household_id, finance.month_start(t.posted_on) as month, t.vendor_key,
       t.category_id, sum(t.amount) as amount, count(*) as n
  from finance.transactions t
 group by 1, 2, 3, 4;

-- 2. RLS: membership looked up once per statement ----------------------
create or replace function finance.hh_ids_member()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(m.household_id), '{}') from finance.household_members m where m.user_id = (select auth.uid())
$$;
create or replace function finance.hh_ids_write()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(m.household_id), '{}') from finance.household_members m
   where m.user_id = (select auth.uid()) and m.role in ('owner', 'editor')
$$;
grant execute on function finance.hh_ids_member(), finance.hh_ids_write() to authenticated;
revoke execute on function finance.hh_ids_member(), finance.hh_ids_write() from public, anon;

do $$
declare t record;
begin
  for t in select distinct p.tablename from pg_policies p
            where p.schemaname = 'finance' and p.policyname = 'hh_select'
  loop
    execute format('drop policy if exists hh_select on finance.%I', t.tablename);
    execute format('drop policy if exists hh_insert on finance.%I', t.tablename);
    execute format('drop policy if exists hh_update on finance.%I', t.tablename);
    execute format('drop policy if exists hh_delete on finance.%I', t.tablename);
    execute format('create policy hh_select on finance.%I for select to authenticated using (household_id = any ((select finance.hh_ids_member())::uuid[]))', t.tablename);
    execute format('create policy hh_insert on finance.%I for insert to authenticated with check (household_id = any ((select finance.hh_ids_write())::uuid[]))', t.tablename);
    execute format('create policy hh_update on finance.%I for update to authenticated using (household_id = any ((select finance.hh_ids_write())::uuid[])) with check (household_id = any ((select finance.hh_ids_write())::uuid[]))', t.tablename);
    execute format('create policy hh_delete on finance.%I for delete to authenticated using (household_id = any ((select finance.hh_ids_write())::uuid[]))', t.tablename);
  end loop;
end $$;

-- 3. load RPCs: membership checked at the top, then direct reads --------
--    (every query inside is already filtered to p_household; prefs to auth.uid())
alter function finance.app_snapshot(uuid, date) security definer;
alter function finance.app_snapshot_extra(uuid) security definer;

-- 4. API timeout headroom (Supabase default for signed-in requests is 8s)
alter role authenticated set statement_timeout = '20s';

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
