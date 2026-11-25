-- Persist each student's uploaded material and tutoring sessions.
-- Existing authentication/profile migrations are intentionally left untouched.

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  file_size_bytes bigint not null default 0 check (file_size_bytes >= 0),
  page_count integer,
  character_count integer not null default 0 check (character_count >= 0),
  extracted_text text not null,
  page_ranges jsonb not null default '[]'::jsonb,
  ocr_used boolean not null default false,
  ocr_provider text check (ocr_provider in ('gemini', 'tesseract') or ocr_provider is null),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_user_created_idx
  on public.documents (user_id, created_at desc);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null,
  title text not null default 'New conversation',
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc);

alter table public.documents enable row level security;
alter table public.conversations enable row level security;

drop policy if exists "Students can read their own documents" on public.documents;
create policy "Students can read their own documents"
  on public.documents for select
  using (auth.uid() = user_id);

drop policy if exists "Students can create their own documents" on public.documents;
create policy "Students can create their own documents"
  on public.documents for insert
  with check (auth.uid() = user_id);

drop policy if exists "Students can update their own documents" on public.documents;
create policy "Students can update their own documents"
  on public.documents for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Students can delete their own documents" on public.documents;
create policy "Students can delete their own documents"
  on public.documents for delete
  using (auth.uid() = user_id);

drop policy if exists "Students can read their own conversations" on public.conversations;
create policy "Students can read their own conversations"
  on public.conversations for select
  using (auth.uid() = user_id);

drop policy if exists "Students can create their own conversations" on public.conversations;
create policy "Students can create their own conversations"
  on public.conversations for insert
  with check (
    auth.uid() = user_id
    and (
      document_id is null
      or exists (
        select 1 from public.documents d
        where d.id = document_id and d.user_id = auth.uid()
      )
    )
  );

drop policy if exists "Students can update their own conversations" on public.conversations;
create policy "Students can update their own conversations"
  on public.conversations for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      document_id is null
      or exists (
        select 1 from public.documents d
        where d.id = document_id and d.user_id = auth.uid()
      )
    )
  );

drop policy if exists "Students can delete their own conversations" on public.conversations;
create policy "Students can delete their own conversations"
  on public.conversations for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.documents to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
