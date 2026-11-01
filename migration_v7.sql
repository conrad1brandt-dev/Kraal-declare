-- v7: official (DVS) ear tags allocated per owner, and the previous temporary ID on each animal
alter table animals add column if not exists previous_tag text;

create table if not exists official_tags (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references establishments(id) on delete cascade,
  owner_id uuid not null references owners(id) on delete cascade,
  tag_number text not null,
  species text,
  animal_id uuid references animals(id) on delete set null,
  assigned_at date,
  note text,
  created_at timestamptz default now(),
  unique (establishment_id, tag_number)
);
create unique index if not exists official_tags_animal_uidx on official_tags(animal_id) where animal_id is not null;
create index if not exists official_tags_owner_idx on official_tags(owner_id);

alter table official_tags enable row level security;
drop policy if exists "members view official_tags" on official_tags;
create policy "members view official_tags" on official_tags for select using (is_establishment_member(establishment_id));
drop policy if exists "admin insert official_tags" on official_tags;
create policy "admin insert official_tags" on official_tags for insert with check (is_establishment_admin(establishment_id));
drop policy if exists "admin update official_tags" on official_tags;
create policy "admin update official_tags" on official_tags for update using (is_establishment_admin(establishment_id)) with check (is_establishment_admin(establishment_id));
drop policy if exists "admin delete official_tags" on official_tags;
create policy "admin delete official_tags" on official_tags for delete using (is_establishment_admin(establishment_id));
