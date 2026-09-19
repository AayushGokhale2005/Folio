-- Folio 002: finished-chapter feed and character-tracking support.
-- Apply after the original schema.

create table if not exists public.feed_posts (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  chapter_id uuid not null references public.manuscript_items(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  content_snapshot text not null,
  published_at timestamptz not null default now()
);

create index if not exists feed_posts_published_at_idx
  on public.feed_posts (published_at desc);

create index if not exists characters_book_name_idx
  on public.characters (book_id, lower(name));

alter table public.feed_posts enable row level security;

drop policy if exists "Authenticated users can read feed" on public.feed_posts;
create policy "Authenticated users can read feed"
  on public.feed_posts for select
  using (auth.uid() is not null);

drop policy if exists "Authors can publish feed posts" on public.feed_posts;
create policy "Authors can publish feed posts"
  on public.feed_posts for insert
  with check (author_id = auth.uid());
