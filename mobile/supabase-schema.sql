-- Run this SQL in Supabase Dashboard -> SQL Editor.
create table if not exists public.exchange_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  direction text not null check (direction in ('USDT_UAH', 'UAH_USDT')),
  give_amount numeric(24, 8) not null check (give_amount > 0),
  give_currency text not null check (give_currency in ('USDT', 'UAH')),
  receive_amount numeric(24, 8) not null check (receive_amount > 0),
  receive_currency text not null check (receive_currency in ('USDT', 'UAH')),
  rate numeric(24, 8) not null check (rate > 0),
  status text not null default 'new' check (status in ('new', 'processing', 'completed', 'cancelled')),
  created_at timestamptz not null default now()
);

alter table public.exchange_requests enable row level security;

drop policy if exists "Users can read their own requests" on public.exchange_requests;
create policy "Users can read their own requests"
on public.exchange_requests for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can create their own requests" on public.exchange_requests;
create policy "Users can create their own requests"
on public.exchange_requests for insert
to authenticated
with check (auth.uid() = user_id and email = (select email from auth.users where id = auth.uid()));

-- Users must not be able to change request status or edit/delete requests.
revoke update, delete on public.exchange_requests from anon, authenticated;
grant select, insert on public.exchange_requests to authenticated;