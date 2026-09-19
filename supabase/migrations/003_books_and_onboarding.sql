-- Folio 003: book presentation metadata and first-run onboarding.
-- Apply after 002_feed_and_character_tracking.sql.

alter table public.profiles
  add column if not exists onboarding_completed boolean not null default false;

alter table public.books
  add column if not exists description text not null default '',
  add column if not exists author_name text not null default '',
  add column if not exists cover_color text not null default '#556b5c';
