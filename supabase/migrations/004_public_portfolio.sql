-- Folio 004: opt-in public writer portfolios.
-- Apply after 003_books_and_onboarding.sql.

alter table public.profiles
  add column if not exists is_portfolio_public boolean not null default false;
