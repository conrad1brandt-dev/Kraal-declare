-- v6: store every answer of the official Animal Health Declaration (questions 1-51)
alter table declarations add column if not exists answers jsonb not null default '{}'::jsonb;
alter table declarations add column if not exists auto_snapshot jsonb;
alter table declarations add column if not exists updated_at timestamptz default now();
