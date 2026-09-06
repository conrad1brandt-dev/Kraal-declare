-- Kraal Declare — migration v3
-- Market reference prices (manual entries, e.g. current Agra/WLA category averages)

create table market_prices (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid references establishments on delete cascade not null,
  category text not null,        -- e.g. "Weaner calves", "Slaughter lambs"
  price_per_kg numeric,
  source text,                   -- e.g. "Agra", "WLA"
  as_of_date date not null default current_date,
  notes text,
  created_at timestamptz default now()
);
alter table market_prices enable row level security;

create policy "members view market_prices" on market_prices for select using (is_establishment_member(establishment_id));
create policy "admin insert market_prices" on market_prices for insert with check (is_establishment_admin(establishment_id));
create policy "admin update market_prices" on market_prices for update using (is_establishment_admin(establishment_id)) with check (is_establishment_admin(establishment_id));
create policy "admin delete market_prices" on market_prices for delete using (is_establishment_admin(establishment_id));
