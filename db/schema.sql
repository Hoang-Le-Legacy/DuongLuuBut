-- Sổ Lưu Bút — Dương "Domino" — schema.
-- Applied by scripts/migrate.js against DATABASE_URL (Neon Postgres).

create extension if not exists pgcrypto;

create table if not exists entries (
  id          uuid primary key default gen_random_uuid(),
  sender      text not null,
  message     text not null,
  entry_date  date,
  is_private  boolean not null default false,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists entry_images (
  id         uuid primary key default gen_random_uuid(),
  entry_id   uuid not null references entries(id) on delete cascade,
  url        text not null,
  pathname   text not null,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists entry_images_entry_idx on entry_images(entry_id);

create table if not exists settings (
  key   text primary key,
  value text not null
);
