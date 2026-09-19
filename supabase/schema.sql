-- Run in the Supabase SQL Editor before opening Folio.
create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'));
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  target_words integer not null default 65000 check (target_words > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.manuscript_items (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  parent_id uuid references public.manuscript_items(id) on delete cascade,
  kind text not null check (kind in ('part','chapter','scene')),
  title text not null check (char_length(title) between 1 and 180),
  content text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  name text not null,
  role text, description text, age text, goals text, motivation text, conflict text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.character_relationships (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  source_character_id uuid not null references public.characters(id) on delete cascade,
  target_character_id uuid not null references public.characters(id) on delete cascade,
  label text not null default 'knows', source_position jsonb, target_position jsonb
);
create table if not exists public.story_edges (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  source_scene_id uuid not null references public.manuscript_items(id) on delete cascade,
  target_scene_id uuid not null references public.manuscript_items(id) on delete cascade,
  label text not null default 'Leads to'
);
create table if not exists public.feed_posts (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  chapter_id uuid not null references public.manuscript_items(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  content_snapshot text not null,
  published_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.books enable row level security;
alter table public.manuscript_items enable row level security;
alter table public.characters enable row level security;
alter table public.character_relationships enable row level security;
alter table public.story_edges enable row level security;
alter table public.feed_posts enable row level security;

create policy "Read own profile" on public.profiles for select using (id = auth.uid());
create policy "Manage own profile" on public.profiles for update using (id = auth.uid());
create policy "Manage own books" on public.books for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Manage items in own books" on public.manuscript_items for all using (exists (select 1 from public.books where id = book_id and owner_id = auth.uid())) with check (exists (select 1 from public.books where id = book_id and owner_id = auth.uid()));
create policy "Manage characters in own books" on public.characters for all using (exists (select 1 from public.books where id = book_id and owner_id = auth.uid())) with check (exists (select 1 from public.books where id = book_id and owner_id = auth.uid()));
create policy "Manage own character relationships" on public.character_relationships for all using (exists (select 1 from public.books where id = book_id and owner_id = auth.uid())) with check (exists (select 1 from public.books where id = book_id and owner_id = auth.uid()));
create policy "Manage own story edges" on public.story_edges for all using (exists (select 1 from public.books where id = book_id and owner_id = auth.uid())) with check (exists (select 1 from public.books where id = book_id and owner_id = auth.uid()));
create policy "Authenticated users can read feed" on public.feed_posts for select using (auth.uid() is not null);
create policy "Authors can publish feed posts" on public.feed_posts for insert with check (author_id = auth.uid());
