-- =====================================================================
-- eckert.fin · 2000 · weekly digest: calendar feeds, saved digests, digest settings
--   calendar links are private (they work like passwords): household members only, never in the repo
-- =====================================================================
create or replace function finance.set_household_setting(p_household uuid, p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not finance.can_write(p_household) then raise exception 'you have view-only access to this household'; end if;
  if p_key not in ('college_plan', 'kids', 'checks_ok', 'review', 'cat_groups', 'trust', 'digest') then raise exception 'setting % can''t be changed from the app', p_key; end if;
  if pg_column_size(p_value) > (case when p_key = 'trust' then 131072 else 32768 end) then raise exception 'setting too large'; end if;
  if p_key = 'kids' and (jsonb_typeof(p_value) <> 'array'
      or exists (select 1 from jsonb_array_elements(p_value) e
                  where coalesce(btrim(e ->> 'name'), '') = '' or (e ->> 'dob') !~ '^\d{4}-\d{2}-\d{2}$')) then
    raise exception 'each child needs a name and a birth date (YYYY-MM-DD)';
  end if;
  if p_key = 'checks_ok' and jsonb_typeof(p_value) <> 'array' then raise exception 'checks_ok must be a list'; end if;
  if p_key = 'cat_groups' and (jsonb_typeof(p_value) <> 'object' or jsonb_typeof(coalesce(p_value -> 'list', '[]')) <> 'array') then raise exception 'cat_groups must be {list, of}'; end if;
  if p_key = 'digest' and jsonb_typeof(p_value) <> 'object' then raise exception 'digest settings must be an object'; end if;
  if p_key = 'trust' and (jsonb_typeof(p_value) <> 'object' or coalesce(btrim(p_value ->> 'name'), '') = '') then raise exception 'trust summary needs a name'; end if;
  update finance.households
     set settings = jsonb_set(coalesce(settings, '{}'::jsonb), array[p_key], p_value, true)
   where id = p_household;
end $$;
grant execute on function finance.set_household_setting(uuid, text, jsonb) to authenticated;
revoke execute on function finance.set_household_setting(uuid, text, jsonb) from public, anon;


-- calendars to read (iCloud public calendar links, or any app's iCal / .ics link)
create table if not exists finance.calendar_feeds (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references finance.households(id) on delete cascade,
  label        text not null,                 -- Medical, Family, Trailer Folk…
  color        text not null default '#1a8f4e',
  url          text not null check (url ~* '^(https?|webcal)://'),
  enabled      boolean not null default true,
  sort_order   int not null default 100,
  last_fetched timestamptz,
  last_ok      boolean,
  last_error   text,
  last_count   int,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists calendar_feeds_hh_idx on finance.calendar_feeds (household_id);

-- one digest per household per week (week_start = the Monday it covers)
create table if not exists finance.digests (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references finance.households(id) on delete cascade,
  week_start   date not null,
  range_end    date not null,
  generated_at timestamptz not null default now(),
  payload      jsonb not null,
  notes        text,
  emailed_at   timestamptz,
  emailed_to   text[],
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (household_id, week_start)
);

grant select, insert, update, delete on finance.calendar_feeds to authenticated;
grant select, update on finance.digests to authenticated;
grant all on finance.calendar_feeds, finance.digests to service_role;
do $$
declare t text;
begin
  foreach t in array array['calendar_feeds', 'digests'] loop
    execute format('alter table finance.%I enable row level security', t);
    execute format('drop policy if exists hh_select on finance.%I', t);
    execute format('drop policy if exists hh_insert on finance.%I', t);
    execute format('drop policy if exists hh_update on finance.%I', t);
    execute format('drop policy if exists hh_delete on finance.%I', t);
    execute format('create policy hh_select on finance.%I for select to authenticated using (finance.is_member(household_id))', t);
    execute format('create policy hh_insert on finance.%I for insert to authenticated with check (finance.can_write(household_id))', t);
    execute format('create policy hh_update on finance.%I for update to authenticated using (finance.can_write(household_id)) with check (finance.can_write(household_id))', t);
    execute format('create policy hh_delete on finance.%I for delete to authenticated using (finance.can_write(household_id))', t);
    execute format('drop trigger if exists set_updated_at on finance.%I', t);
    execute format('create trigger set_updated_at before update on finance.%I for each row execute function finance.set_updated_at()', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
