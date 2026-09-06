-- Kraal Declare — migration v4
-- Adds the data foundation for the Veterinary Drug/Treatment Register
-- and the Departure & Arrival (movements) register.

-- Batch number and withdrawal period on health events — needed for a
-- real vet-drug register (identifies exactly what was used, and the
-- safety window before meat/milk from a treated animal can be used).
alter table health_events add column if not exists batch_no text;
alter table health_events add column if not exists withdrawal_end date;

-- Movements: animals arriving, leaving, or transferred, independent of slaughter
create table movements (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid references establishments on delete cascade not null,
  animal_id uuid references animals,
  movement_type text not null check (movement_type in ('arrival','departure','transfer')),
  date date not null default current_date,
  from_location text,
  to_location text,
  permit_number text,
  transported_by text,
  reason text,
  created_by uuid references auth.users,
  created_at timestamptz default now()
);
alter table movements enable row level security;

create policy "members view movements" on movements for select using (is_establishment_member(establishment_id));
create policy "admin insert movements" on movements for insert with check (is_establishment_admin(establishment_id));
create policy "admin update movements" on movements for update using (is_establishment_admin(establishment_id)) with check (is_establishment_admin(establishment_id));
create policy "admin delete movements" on movements for delete using (is_establishment_admin(establishment_id));
