-- Durable, content-addressed Gemini document embeddings.
-- The application uses the Supabase service role from server-side code only.
-- No source text, PDF bytes, or chat messages are stored in this table.

create table if not exists public.document_embeddings (
  document_key text not null,
  model text not null,
  chunk_index integer not null check (chunk_index >= 0),
  chunk_hash text not null,
  embedding jsonb not null check (jsonb_typeof(embedding) = 'array'),
  created_at timestamptz not null default now(),
  primary key (document_key, model, chunk_index)
);

create index if not exists document_embeddings_created_at_idx
  on public.document_embeddings (created_at);

alter table public.document_embeddings enable row level security;

-- No client-facing policies are intentionally created. Only trusted
-- server-side service-role requests should read or write these vectors.
