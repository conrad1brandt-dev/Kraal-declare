-- Kraal Declare — database schema
-- Run in Supabase SQL Editor. One establishment (farm), multiple owners,
-- each with their own brand marks and eartag ranges.

-- 1. ESTABLISHMENT (the farm itself — one per app instance) ------------------
create table establishments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  establishment_no text,
  district text,
  constituency text,
  postal_address text,
  farming_system text check (farming_system in ('commercial','communal','peri-urban','resettlement','other')),
  invite_code text unique not null default substr(md5(random()::text), 1, 8),
  created_by uuid references auth.users not null,
  created_at timestamptz default now()
);

create table establishment_members (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid references establishments on delete cascade not null,
  user_id uuid references auth.users not null,
  role text not null default 'member' check (role in ('owner_admin','member')),
  joined_at timestamptz default now(),
  unique (establishment_id, user_id)
);

-- 2. OWNERS (people with livestock on this establishment) --------------------
create table owners (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid references establishments on delete cascade not null,
  full_name text not null,
  surname text,
  id_number text,
  residential_address text,
  po_box text,
  email text,
  contact_number text,
  fanmeat_no text,
  livestock_keeper_key text,
  producer_registration_number text,
  created_at timestamptz default now()
);

-- 3. BRAND MARK (exactly one per owner) --------------------------------------
create table brand_marks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references owners on delete cascade not null unique,
  stock_brand_code text,   -- nullable: may not be issued yet
  status text not null default 'pending_registration'
    check (status in ('registered','pending_registration')),
  pending_reference text,  -- your own temporary description while awaiting the official code
  description text,
  registered_at date,
  created_at timestamptz default now()
);

-- 4. ANIMALS (individual animals, tagged, owned, branded) --------------------
create table animals (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid references establishments on delete cascade not null,
  owner_id uuid references owners on delete cascade not null,
  brand_mark_id uuid references brand_marks,
  eartag_number text not null,
  species text not null check (species in ('cattle','sheep','goats','pigs','donkeys','horses','ostriches','poultry','other')),
  breed_category text,   -- e.g. Beef Cattle, Karakul, Dorper, Boerbok
  sex text check (sex in ('M','F')),
  dob date,
  status text not null default 'active' check (status in ('active','sold','slaughtered','deceased','stolen')),
  dam_id uuid references animals(id),
  sire_id uuid references animals(id),
  imported boolean default false,
  created_at timestamptz default now(),
  unique (owner_id, eartag_number)
);
create index idx_animals_establishment on animals(establishment_id);
create index idx_animals_eartag on animals(eartag_number);

-- 5. DECLARATIONS (one per owner per 6-month period) --------------------------
create table declarations (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid references establishments on delete cascade not null,
  owner_id uuid references owners on delete cascade not null,
  period text not null check (period in ('jan_jun','jul_dec')),
  year int not null,
  -- section 6: identification compliance
  cattle_identified boolean,
  sheep_identified boolean,
  goats_identified boolean,
  other_identified boolean,
  -- section 7: document register checklist
  doc_livestock_register boolean,
  doc_feed_register boolean,
  doc_vet_drug_register boolean,
  doc_employee_training boolean,
  doc_departure_arrival boolean,
  -- section 8: traceability
  movements_up_to_date boolean,
  -- section 5: imported animals count
  imported_animals_count int default 0,
  status text not null default 'draft' check (status in ('draft','submitted')),
  signed_by text,
  signed_date date,
  created_at timestamptz default now(),
  unique (owner_id, period, year)
);

-- 6. LIVESTOCK NUMBERS (per declaration, species headcounts) ------------------
create table livestock_numbers (
  id uuid primary key default gen_random_uuid(),
  declaration_id uuid references declarations on delete cascade not null,
  beef_cattle int default 0,
  dairy_cattle int default 0,
  karakul int default 0,
  dorper int default 0,
  other_sheep int default 0,
  boerbok int default 0,
  other_goats int default 0,
  poultry int default 0,
  ostriches int default 0,
  horses int default 0,
  donkeys int default 0,
  mules int default 0,
  pigs int default 0,
  bulls int default 0,
  cows int default 0,
  heifers int default 0,
  oxen int default 0,
  calves_male_lt1 int default 0,
  calves_female_lt1 int default 0,
  sheep_1yr_plus int default 0,
  goats_1yr_plus int default 0,
  unique (declaration_id)
);

-- 7. LOSSES ---------------------------------------------------------------
create table predator_losses (
  id uuid primary key default gen_random_uuid(),
  declaration_id uuid references declarations on delete cascade not null,
  species text not null check (species in ('cattle','sheep','goats')),
  predator text not null,
  number_lost int not null default 0
);

create table theft_losses (
  id uuid primary key default gen_random_uuid(),
  declaration_id uuid references declarations on delete cascade not null,
  species text not null,
  number_stolen int not null default 0
);

create table own_use_slaughter (
  id uuid primary key default gen_random_uuid(),
  declaration_id uuid references declarations on delete cascade not null,
  species text not null check (species in ('cattle','sheep','goats')),
  number int not null default 0
);

-- 8. HEALTH ---------------------------------------------------------------
create table disease_records (
  id uuid primary key default gen_random_uuid(),
  declaration_id uuid references declarations on delete cascade not null,
  animal_type text not null,   -- cattle / sheep / goats / other
  disease text,
  clinical_signs text,
  record_type text not null default 'disease' check (record_type in ('disease','unknown_cause','nervous_signs')),
  no_sick int default 0,
  no_dead int default 0
);

create table health_flags (
  id uuid primary key default gen_random_uuid(),
  declaration_id uuid references declarations on delete cascade not null,
  abortions_cattle int default 0,
  abortions_sheep int default 0,
  abortions_goats int default 0,
  fmd_suspected boolean,
  fmd_number_affected int default 0,
  sheep_scab_suspected boolean,
  sheep_scab_number_affected int default 0,
  ticks_cattle boolean,
  ticks_sheep_goats boolean,
  unique (declaration_id)
);

-- 9. FEED, VACCINES, MEDICINES (linkable to an animal or species-wide) --------
create table feed_register (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid references establishments on delete cascade not null,
  animal_id uuid references animals,
  species text,   -- used when not linked to one animal
  feed_ingredients text,
  contains_meat_bone_meal boolean,
  contains_poultry_manure boolean,
  date date not null default current_date,
  created_at timestamptz default now()
);

create table vaccinations (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid references establishments on delete cascade not null,
  animal_id uuid references animals,
  species text,
  vaccine_name text not null,
  batch_no text,
  date_given date not null,
  count int default 1,
  created_at timestamptz default now()
);

create table medicines_used (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid references establishments on delete cascade not null,
  animal_id uuid references animals,
  animal_type text,
  medicine_name text not null,
  is_dip boolean default false,
  date_given date not null default current_date,
  withdrawal_end date,
  created_at timestamptz default now()
);

create table medicine_flags (
  id uuid primary key default gen_random_uuid(),
  declaration_id uuid references declarations on delete cascade not null,
  banned_substances_used boolean,
  banned_substances_detail text,
  antibiotics_in_feed boolean,
  antibiotics_detail text,
  vet_drugs_stored_correctly boolean,
  unique (declaration_id)
);

-- 10. GRAZING & WATER (current conditions, not tied to a specific animal) ----
create table grazing_water_reports (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid references establishments on delete cascade not null,
  report_date date not null default current_date,
  grazing_quality text check (grazing_quality in ('poor','medium','good','n/a')),
  grazing_quantity text check (grazing_quantity in ('poor','medium','good','n/a')),
  water_sources text[],   -- pipeline, borehole, dam, surface_water, river
  water_quantity text check (water_quantity in ('poor','medium','good','n/a')),
  water_quality text check (water_quality in ('poor','medium','good','n/a')),
  cattle_condition text check (cattle_condition in ('poor','medium','good','n/a')),
  sheep_condition text check (sheep_condition in ('poor','medium','good','n/a')),
  goats_condition text check (goats_condition in ('poor','medium','good','n/a')),
  notes text,
  created_at timestamptz default now()
);

-- ROW LEVEL SECURITY -----------------------------------------------------
alter table establishments enable row level security;
alter table establishment_members enable row level security;
alter table owners enable row level security;
alter table brand_marks enable row level security;
alter table animals enable row level security;
alter table declarations enable row level security;
alter table livestock_numbers enable row level security;
alter table predator_losses enable row level security;
alter table theft_losses enable row level security;
alter table own_use_slaughter enable row level security;
alter table disease_records enable row level security;
alter table health_flags enable row level security;
alter table feed_register enable row level security;
alter table vaccinations enable row level security;
alter table medicines_used enable row level security;
alter table medicine_flags enable row level security;
alter table grazing_water_reports enable row level security;

create or replace function is_establishment_member(e_id uuid)
returns boolean as $$
  select exists (
    select 1 from establishment_members
    where establishment_id = e_id and user_id = auth.uid()
  );
$$ language sql security definer;

-- establishments: members can view; owner can insert; owner+self can view immediately
create policy "members can view establishment" on establishments
  for select using (is_establishment_member(id) or auth.uid() = created_by);
create policy "authenticated users can create establishment" on establishments
  for insert with check (auth.uid() = created_by);

create policy "members can view roster" on establishment_members
  for select using (is_establishment_member(establishment_id));
create policy "users can add themselves via invite" on establishment_members
  for insert with check (auth.uid() = user_id);

-- everything else: gated on establishment membership
create policy "members manage owners" on owners
  for all using (is_establishment_member(establishment_id)) with check (is_establishment_member(establishment_id));

create policy "members manage brand_marks" on brand_marks
  for all using (is_establishment_member((select establishment_id from owners where id = owner_id)))
  with check (is_establishment_member((select establishment_id from owners where id = owner_id)));

create policy "members manage animals" on animals
  for all using (is_establishment_member(establishment_id)) with check (is_establishment_member(establishment_id));

create policy "members manage declarations" on declarations
  for all using (is_establishment_member(establishment_id)) with check (is_establishment_member(establishment_id));

create policy "members manage livestock_numbers" on livestock_numbers
  for all using (is_establishment_member((select establishment_id from declarations where id = declaration_id)))
  with check (is_establishment_member((select establishment_id from declarations where id = declaration_id)));

create policy "members manage predator_losses" on predator_losses
  for all using (is_establishment_member((select establishment_id from declarations where id = declaration_id)))
  with check (is_establishment_member((select establishment_id from declarations where id = declaration_id)));

create policy "members manage theft_losses" on theft_losses
  for all using (is_establishment_member((select establishment_id from declarations where id = declaration_id)))
  with check (is_establishment_member((select establishment_id from declarations where id = declaration_id)));

create policy "members manage own_use_slaughter" on own_use_slaughter
  for all using (is_establishment_member((select establishment_id from declarations where id = declaration_id)))
  with check (is_establishment_member((select establishment_id from declarations where id = declaration_id)));

create policy "members manage disease_records" on disease_records
  for all using (is_establishment_member((select establishment_id from declarations where id = declaration_id)))
  with check (is_establishment_member((select establishment_id from declarations where id = declaration_id)));

create policy "members manage health_flags" on health_flags
  for all using (is_establishment_member((select establishment_id from declarations where id = declaration_id)))
  with check (is_establishment_member((select establishment_id from declarations where id = declaration_id)));

create policy "members manage feed_register" on feed_register
  for all using (is_establishment_member(establishment_id)) with check (is_establishment_member(establishment_id));

create policy "members manage vaccinations" on vaccinations
  for all using (is_establishment_member(establishment_id)) with check (is_establishment_member(establishment_id));

create policy "members manage medicines_used" on medicines_used
  for all using (is_establishment_member(establishment_id)) with check (is_establishment_member(establishment_id));

create policy "members manage medicine_flags" on medicine_flags
  for all using (is_establishment_member((select establishment_id from declarations where id = declaration_id)))
  with check (is_establishment_member((select establishment_id from declarations where id = declaration_id)));

-- 11. FINANCES ---------------------------------------------------------------
create table transactions (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid references establishments on delete cascade not null,
  owner_id uuid references owners,
  animal_id uuid references animals,
  type text not null check (type in ('income','expense')),
  category text not null,
  amount numeric not null check (amount > 0),
  date date not null,
  description text,
  created_by uuid references auth.users,
  created_at timestamptz default now()
);

-- 12. SLAUGHTER RECORDS ---------------------------------------------------
create table slaughter_records (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid references establishments on delete cascade not null,
  animal_id uuid references animals not null,
  declaration_id uuid references declarations,
  date date not null default current_date,
  weight_kg numeric,
  purpose text not null check (purpose in ('sold','own_consumption')),
  price_per_kg numeric,
  total_value numeric,
  buyer_name text,
  buyer_contact text,
  linked_transaction_id uuid references transactions,
  created_by uuid references auth.users,
  created_at timestamptz default now()
);

-- ROW LEVEL SECURITY (continued) ------------------------------------------
alter table transactions enable row level security;
alter table slaughter_records enable row level security;

create policy "members manage transactions" on transactions
  for all using (is_establishment_member(establishment_id)) with check (is_establishment_member(establishment_id));

create policy "members manage slaughter_records" on slaughter_records
  for all using (is_establishment_member(establishment_id)) with check (is_establishment_member(establishment_id));
