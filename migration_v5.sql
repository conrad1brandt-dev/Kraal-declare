-- Monthly budget: price list, months, expense lines, contributors (per owner).
-- Mirrors the "Plaas Damas – Maandelikse Begroting" spreadsheet.

alter table owners add column if not exists nickname text;  -- short name used in the budget (e.g. Belinda, Haas)

create table if not exists budget_items (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references establishments(id) on delete cascade,
  name text not null,
  category text not null,          -- Voer, Veeartseny, Lone & werkers, Brandstof, Onderhoud, Dienste & admin, Nutrition, Ander
  unit text,
  unit_price numeric,
  sort int default 0,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists budget_months (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references establishments(id) on delete cascade,
  month date not null,              -- first day of the month
  petrol_total numeric default 0,
  status text not null default 'open',   -- open | final
  finalized_at timestamptz,
  created_at timestamptz default now(),
  unique (establishment_id, month)
);

create table if not exists budget_expenses (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references establishments(id) on delete cascade,
  month_id uuid not null references budget_months(id) on delete cascade,
  item_id uuid references budget_items(id) on delete set null,
  item_name text not null,
  category text,
  qty numeric default 1,
  unit_price numeric default 0,
  receipt_no text,
  receipt_amount numeric,           -- overrides qty x unit_price when filled in
  include boolean not null default true,   -- false = parked
  note text,
  transaction_id uuid references transactions(id) on delete set null,
  sort int default 0,
  created_at timestamptz default now()
);

create table if not exists budget_contributors (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references establishments(id) on delete cascade,
  month_id uuid not null references budget_months(id) on delete cascade,
  owner_id uuid not null references owners(id) on delete cascade,
  shares_petrol boolean not null default true,
  paid boolean not null default false,
  paid_date date,
  note text,
  sort int default 0,
  unique (month_id, owner_id)
);

do $$
declare t text;
begin
  foreach t in array array['budget_items','budget_months','budget_expenses','budget_contributors'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "members view %1$s" on %1$I', t);
    execute format('create policy "members view %1$s" on %1$I for select using (is_establishment_member(establishment_id))', t);
    execute format('drop policy if exists "admin insert %1$s" on %1$I', t);
    execute format('create policy "admin insert %1$s" on %1$I for insert with check (is_establishment_admin(establishment_id))', t);
    execute format('drop policy if exists "admin update %1$s" on %1$I', t);
    execute format('create policy "admin update %1$s" on %1$I for update using (is_establishment_admin(establishment_id)) with check (is_establishment_admin(establishment_id))', t);
    execute format('drop policy if exists "admin delete %1$s" on %1$I', t);
    execute format('create policy "admin delete %1$s" on %1$I for delete using (is_establishment_admin(establishment_id))', t);
  end loop;
end $$;

create index if not exists budget_expenses_month_idx on budget_expenses(month_id);
create index if not exists budget_contributors_month_idx on budget_contributors(month_id);
