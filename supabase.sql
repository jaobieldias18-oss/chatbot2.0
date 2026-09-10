-- Meridian · schema Supabase — rode no SQL Editor do seu projeto
-- Tabelas: conversations + messages (sem auth; políticas abertas p/ anon).
-- Se preferir com login, ative RLS com (auth.uid() = user_id).

create extension if not exists "pgcrypto";

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Nova conversa',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_convo on public.messages(conversation_id, created_at);
create index if not exists idx_convos_updated on public.conversations(updated_at desc);

alter table public.conversations disable row level security;
alter table public.messages disable row level security;

-- Alternativa com RLS restrito a anon (caso seu projeto exija RLS ativo):
-- alter table public.conversations enable row level security;
-- alter table public.messages enable row level security;
-- drop policy if exists "anon all" on public.conversations;
-- create policy "anon all" on public.conversations for all to anon using (true) with check (true);
-- drop policy if exists "anon all" on public.messages;
-- create policy "anon all" on public.messages for all to anon using (true) with check (true);
