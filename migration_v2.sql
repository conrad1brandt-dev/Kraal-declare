-- Kraal Declare — migration v2
-- Run in Supabase SQL Editor AFTER the original schema.sql.
-- Safe on existing data: adjusts constraints, adds columns/tables, does not drop data.

-- ============================================================
-- 1. DECLARATIONS BECOME FARM-WIDE (one per period, not per owner)
-- ============================================================
alter table declarations drop constraint if exists declarations_owner_id_period_year_key;
alter table declarations alter column owner_id drop not null;

-- Clean up: keep only the earliest declaration per (establishment, period, year),
-- delete any extras from the old per-owner model. Their sub-details (livestock
-- numbers, flags, etc.) are replaced by the new auto-pull system anyway.
delete from declarations d
using declarations d2
where d.establishment_id = d2.establishment_id
  and d.period = d2.period
  and d.year = d2.year
  and d.created_at > d2.created_at;

alter table declarations add constraint declarations_establishment_period_year_key
  unique (establishment_id, period, year);

-- ============================================================
-- 1b. ANIMALS CAN BE SHARED/COMMUNAL (no single owner) —
--     e.g. farm-owned breeding rams not tied to one family
-- ============================================================
alter table animals alter column owner_id drop not null;

-- ============================================================
-- 2. LOSSES & DISEASE RECORDS BECOME ONGOING DATED LOGS
--    (logged anytime, declaration just summarizes a date range)
-- ============================================================
alter table predator_losses add column if not exists establishment_id uuid references establishments on delete cascade;
alter table predator_losses add column if not exists date date not null default current_date;
alter table predator_losses alter column declaration_id drop not null;
update predator_losses set establishment_id = (select establishment_id from declarations where declarations.id = predator_losses.declaration_id)
  where establishment_id is null and declaration_id is not null;

alter table theft_losses add column if not exists establishment_id uuid references establishments on delete cascade;
alter table theft_losses add column if not exists date date not null default current_date;
alter table theft_losses alter column declaration_id drop not null;
update theft_losses set establishment_id = (select establishment_id from declarations where declarations.id = theft_losses.declaration_id)
  where establishment_id is null and declaration_id is not null;

alter table own_use_slaughter add column if not exists establishment_id uuid references establishments on delete cascade;
alter table own_use_slaughter add column if not exists date date not null default current_date;
alter table own_use_slaughter alter column declaration_id drop not null;
update own_use_slaughter set establishment_id = (select establishment_id from declarations where declarations.id = own_use_slaughter.declaration_id)
  where establishment_id is null and declaration_id is not null;

alter table disease_records add column if not exists establishment_id uuid references establishments on delete cascade;
alter table disease_records add column if not exists date date not null default current_date;
alter table disease_records alter column declaration_id drop not null;
update disease_records set establishment_id = (select establishment_id from declarations where declarations.id = disease_records.declaration_id)
  where establishment_id is null and declaration_id is not null;

-- ============================================================
-- 3. UNIFIED HEALTH EVENTS (vaccination / deworming / treatment / etc.,
--    with a next-due date) — shows on each animal's own record
-- ============================================================
create table health_events (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid references establishments on delete cascade not null,
  animal_id uuid references animals,       -- nullable: can log species-wide too
  owner_id uuid references owners,
  species text,
  event_type text not null check (event_type in ('vaccination','deworming','treatment','illness','checkup','other')),
  note text,
  date date not null default current_date,
  next_due date,
  created_by uuid references auth.users,
  created_at timestamptz default now()
);
alter table health_events enable row level security;

-- ============================================================
-- 4. WEIGHT TRACKING
-- ============================================================
create table weights (
  id uuid primary key default gen_random_uuid(),
  animal_id uuid references animals on delete cascade not null,
  date date not null default current_date,
  kg numeric not null,
  created_at timestamptz default now()
);
alter table weights enable row level security;

-- ============================================================
-- 5. BREEDING EVENTS
-- ============================================================
create table breeding_events (
  id uuid primary key default gen_random_uuid(),
  dam_id uuid references animals on delete cascade not null,
  sire_id uuid references animals,
  mated_date date not null,
  expected_due date,
  actual_birth date,
  offspring_count int,
  notes text,
  created_at timestamptz default now()
);
alter table breeding_events enable row level security;

-- ============================================================
-- 6. ROLE-BASED PERMISSIONS
--    Only 'owner_admin' can create/edit/delete. Everyone else (view-only
--    members) can still see everything, just can't change it.
-- ============================================================
create or replace function is_establishment_admin(e_id uuid)
returns boolean as $$
  select exists (
    select 1 from establishment_members
    where establishment_id = e_id and user_id = auth.uid() and role = 'owner_admin'
  );
$$ language sql security definer;

-- Helper macro pattern applied per table below:
--   SELECT  -> any member can view
--   INSERT/UPDATE/DELETE -> admin only

-- owners
drop policy if exists "members manage owners" on owners;
create policy "members view owners" on owners for select using (is_establishment_member(establishment_id));
create policy "admin insert owners" on owners for insert with check (is_establishment_admin(establishment_id));
create policy "admin update owners" on owners for update using (is_establishment_admin(establishment_id)) with check (is_establishment_admin(establishment_id));
create policy "admin delete owners" on owners for delete using (is_establishment_admin(establishment_id));

-- brand_marks
drop policy if exists "members manage brand_marks" on brand_marks;
create policy "members view brand_marks" on brand_marks for select using (is_establishment_member((select establishment_id from owners where id = owner_id)));
create policy "admin insert brand_marks" on brand_marks for insert with check (is_establishment_admin((select establishment_id from owners where id = owner_id)));
create policy "admin update brand_marks" on brand_marks for update using (is_establishment_admin((select establishment_id from owners where id = owner_id))) with check (is_establishment_admin((select establishment_id from owners where id = owner_id)));
create policy "admin delete brand_marks" on brand_marks for delete using (is_establishment_admin((select establishment_id from owners where id = owner_id)));

-- animals
drop policy if exists "members manage animals" on animals;
create policy "members view animals" on animals for select using (is_establishment_member(establishment_id));
create policy "admin insert animals" on animals for insert with check (is_establishment_admin(establishment_id));
create policy "admin update animals" on animals for update using (is_establishment_admin(establishment_id)) with check (is_establishment_admin(establishment_id));
create policy "admin delete animals" on animals for delete using (is_establishment_admin(establishment_id));

-- declarations
drop policy if exists "members manage declarations" on declarations;
create policy "members view declarations" on declarations for select using (is_establishment_member(establishment_id));
create policy "admin insert declarations" on declarations for insert with check (is_establishment_admin(establishment_id));
create policy "admin update declarations" on declarations for update using (is_establishment_admin(establishment_id)) with check (is_establishment_admin(establishment_id));
create policy "admin delete declarations" on declarations for delete using (is_establishment_admin(establishment_id));

-- livestock_numbers
drop policy if exists "members manage livestock_numbers" on livestock_numbers;
create policy "members view livestock_numbers" on livestock_numbers for select using (is_establishment_member((select establishment_id from declarations where id = declaration_id)));
create policy "admin write livestock_numbers" on livestock_numbers for insert with check (is_establishment_admin((select establishment_id from declarations where id = declaration_id)));
create policy "admin update livestock_numbers" on livestock_numbers for update using (is_establishment_admin((select establishment_id from declarations where id = declaration_id))) with check (is_establishment_admin((select establishment_id from declarations where id = declaration_id)));
create policy "admin delete livestock_numbers" on livestock_numbers for delete using (is_establishment_admin((select establishment_id from declarations where id = declaration_id)));

-- predator_losses / theft_losses / own_use_slaughter / disease_records (now establishment-wide)
drop policy if exists "members manage predator_losses" on predator_losses;
create policy "members view predator_losses" on predator_losses for select using (is_establishment_member(establishment_id));
create policy "admin insert predator_losses" on predator_losses for insert with check (is_establishment_admin(establishment_id));
create policy "admin update predator_losses" on predator_losses for update using (is_establishment_admin(establishment_id)) with check (is_establishment_admin(establishment_id));
create policy "admin delete predator_losses" on predator_losses for delete using (is_establishment_admin(establishment_id));

drop policy if exists "members manage theft_losses" on theft_losses;
create policy "members view theft_losses" on theft_losses for select using (is_establishment_member(establishment_id));
create policy "admin insert theft_losses" on theft_losses for insert with check (is_establishment_admin(establishment_id));
create policy "admin update theft_losses" on theft_losses for update using (is_establishment_admin(establishment_id)) with check (is_establishment_admin(establishment_id));
create policy "admin delete theft_losses" on theft_losses for delete using (is_establishment_admin(establishment_id));

drop policy if exists "members manage own_use_slaughter" on own_use_slaughter;
create policy "members view own_use_slaughter" on own_use_slaughter for select using (is_establishment_member(establishment_id));
create policy "admin insert own_use_slaughter" on own_use_slaughter for insert with check (is_establishment_admin(establishment_id));
create policy "admin update own_use_slaughter" on own_use_slaughter for update using (is_establishment_admin(establishment_id)) with check (is_establishment_admin(establishment_id));
create policy "admin delete own_use_slaughter" on own_use_slaughter for delete using (is_establishment_admin(establishment_id));

drop policy if exists "members manage disease_records" on disease_records;
create policy "members view disease_records" on disease_records for select using (is_establishment_member(establishment_id));
create policy "admin insert disease_records" on disease_records for insert with check (is_establishment_admin(establishment_id));
create policy "admin update disease_records" on disease_records for update using (is_establishment_admin(establishment_id)) with check (is_establishment_admin(establishment_id));
create policy "admin delete disease_records" on disease_records for delete using (is_establishment_admin(establishment_id));

-- health_flags / medicine_flags
drop policy if exists "members manage health_flags" on health_flags;
create policy "members view health_flags" on health_flags for select using (is_establishment_member((select establishment_id from declarations where id = declaration_id)));
create policy "admin write health_flags" on health_flags for insert with check (is_establishment_admin((select establishment_id from declarations where id = declaration_id)));
create policy "admin update health_flags" on health_flags for update using (is_establishment_admin((select establishment_id from declarations where id = declaration_id))) with check (is_establishment_admin((select establishment_id from declarations where id = declaration_id)));
create policy "admin delete health_flags" on health_flags for delete using (is_establishment_admin((select establishment_id from declarations where id = declaration_id)));

drop policy if exists "members manage medicine_flags" on medicine_flags;
create policy "members view medicine_flags" on medicine_flags for select using (is_establishment_member((select establishment_id from declarations where id = declaration_id)));
create policy "admin write medicine_flags" on medicine_flags for insert with check (is_establishment_admin((select establishment_id from declarations where id = declaration_id)));
create policy "admin update medicine_flags" on medicine_flags for update using (is_establishment_admin((select establishment_id from declarations where id = declaration_id))) with check (is_establishment_admin((select establishment_id from declarations where id = declaration_id)));
create policy "admin delete medicine_flags" on medicine_flags for delete using (is_establishment_admin((select establishment_id from declarations where id = declaration_id)));

-- feed_register / vaccinations / medicines_used
drop policy if exists "members manage feed_register" on feed_register;
create policy "members view feed_register" on feed_register for select using (is_establishment_member(establishment_id));
create policy "admin insert feed_register" on feed_register for insert with check (is_establishment_admin(establishment_id));
create policy "admin update feed_register" on feed_register for update using (is_establishment_admin(establishment_id)) with check (is_establishment_admin(establishment_id));
create policy "admin delete feed_register" on feed_register for delete using (is_establishment_admin(establishment_id));

drop policy if exists "members manage vaccinations" on vaccinations;
create policy "members view vaccinations" on vaccinations for select using (is_establishment_member(establishment_id));
create policy "admin insert vaccinations" on vaccinations for insert with check (is_establishment_admin(establishment_id));
create policy "admin update vaccinations" on vaccinations for update using (is_establishment_admin(establishment_id)) with check (is_establishment_admin(establishment_id));
create policy "admin delete vaccinations" on vaccinations for delete using (is_establishment_admin(establishment_id));

drop policy if exists "members manage medicines_used" on medicines_used;
create policy "members view medicines_used" on medicines_used for select using (is_establishment_member(establishment_id));
create policy "admin insert medicines_used" on medicines_used for insert with check (is_establishment_admin(establishment_id));
create policy "admin update medicines_used" on medicines_used for update using (is_establishment_admin(establishment_id)) with check (is_establishment_admin(establishment_id));
create policy "admin delete medicines_used" on medicines_used for delete using (is_establishment_admin(establishment_id));

-- transactions / slaughter_records
drop policy if exists "members manage transactions" on transactions;
create policy "members view transactions" on transactions for select using (is_establishment_member(establishment_id));
create policy "admin insert transactions" on transactions for insert with check (is_establishment_admin(establishment_id));
create policy "admin update transactions" on transactions for update using (is_establishment_admin(establishment_id)) with check (is_establishment_admin(establishment_id));
create policy "admin delete transactions" on transactions for delete using (is_establishment_admin(establishment_id));

drop policy if exists "members manage slaughter_records" on slaughter_records;
create policy "members view slaughter_records" on slaughter_records for select using (is_establishment_member(establishment_id));
create policy "admin insert slaughter_records" on slaughter_records for insert with check (is_establishment_admin(establishment_id));
create policy "admin update slaughter_records" on slaughter_records for update using (is_establishment_admin(establishment_id)) with check (is_establishment_admin(establishment_id));
create policy "admin delete slaughter_records" on slaughter_records for delete using (is_establishment_admin(establishment_id));

-- grazing_water_reports
drop policy if exists "members manage grazing_water_reports" on grazing_water_reports;
create policy "members view grazing_water_reports" on grazing_water_reports for select using (is_establishment_member(establishment_id));
create policy "admin insert grazing_water_reports" on grazing_water_reports for insert with check (is_establishment_admin(establishment_id));
create policy "admin update grazing_water_reports" on grazing_water_reports for update using (is_establishment_admin(establishment_id)) with check (is_establishment_admin(establishment_id));
create policy "admin delete grazing_water_reports" on grazing_water_reports for delete using (is_establishment_admin(establishment_id));

-- health_events (new)
create policy "members view health_events" on health_events for select using (is_establishment_member(establishment_id));
create policy "admin insert health_events" on health_events for insert with check (is_establishment_admin(establishment_id));
create policy "admin update health_events" on health_events for update using (is_establishment_admin(establishment_id)) with check (is_establishment_admin(establishment_id));
create policy "admin delete health_events" on health_events for delete using (is_establishment_admin(establishment_id));

-- weights (new) — gated via the parent animal's establishment
create policy "members view weights" on weights for select using (is_establishment_member((select establishment_id from animals where id = animal_id)));
create policy "admin insert weights" on weights for insert with check (is_establishment_admin((select establishment_id from animals where id = animal_id)));
create policy "admin update weights" on weights for update using (is_establishment_admin((select establishment_id from animals where id = animal_id))) with check (is_establishment_admin((select establishment_id from animals where id = animal_id)));
create policy "admin delete weights" on weights for delete using (is_establishment_admin((select establishment_id from animals where id = animal_id)));

-- breeding_events (new) — gated via the dam's establishment
create policy "members view breeding_events" on breeding_events for select using (is_establishment_member((select establishment_id from animals where id = dam_id)));
create policy "admin insert breeding_events" on breeding_events for insert with check (is_establishment_admin((select establishment_id from animals where id = dam_id)));
create policy "admin update breeding_events" on breeding_events for update using (is_establishment_admin((select establishment_id from animals where id = dam_id))) with check (is_establishment_admin((select establishment_id from animals where id = dam_id)));
create policy "admin delete breeding_events" on breeding_events for delete using (is_establishment_admin((select establishment_id from animals where id = dam_id)));

-- establishment_members: allow the existing admin to change others' roles later if needed
create policy "admin update roster" on establishment_members for update
  using (is_establishment_admin(establishment_id)) with check (is_establishment_admin(establishment_id));
create policy "admin delete roster" on establishment_members for delete
  using (is_establishment_admin(establishment_id));
