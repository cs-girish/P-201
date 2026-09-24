-- Run once in the Supabase SQL Editor. Then add your shopkeeper user ID as shown in README.md.
create table if not exists public.shop_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  category text not null default 'Other' check (length(category) between 1 and 40),
  unit text not null check (length(trim(unit)) between 1 and 30),
  price integer not null check (price between 1 and 100000),
  emoji text not null default '🛍️' check (length(emoji) between 1 and 8),
  description text not null default '' check (length(description) <= 160),
  available boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  created_at timestamptz not null default now(),
  name text not null check (length(trim(name)) between 1 and 80),
  phone text not null check (length(phone) between 9 and 18),
  note text not null default '' check (length(note) <= 300),
  status text not null default 'new' check (status in ('new', 'preparing', 'ready', 'collected', 'cancelled')),
  total bigint not null check (total > 0)
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null,
  unit text not null,
  price integer not null,
  quantity integer not null,
  subtotal bigint not null
);

create index if not exists orders_created_at_idx on public.orders(created_at desc);
create index if not exists order_items_order_id_idx on public.order_items(order_id);

alter table public.shop_admins enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

revoke all on public.shop_admins, public.products, public.orders, public.order_items from public, anon, authenticated;
grant select on public.shop_admins to authenticated;
grant select on public.products to anon, authenticated;
grant insert, update on public.products to authenticated;
grant select on public.orders, public.order_items to authenticated;
grant update(status) on public.orders to authenticated;

create policy "Shopkeeper can see own admin membership" on public.shop_admins
  for select to authenticated using (user_id = (select auth.uid()));

create policy "Available products are public and admins see all" on public.products
  for select to anon, authenticated using (
    available or exists (select 1 from public.shop_admins where user_id = (select auth.uid()))
  );
create policy "Only shopkeepers add products" on public.products
  for insert to authenticated with check (
    exists (select 1 from public.shop_admins where user_id = (select auth.uid()))
  );
create policy "Only shopkeepers edit products" on public.products
  for update to authenticated using (
    exists (select 1 from public.shop_admins where user_id = (select auth.uid()))
  ) with check (
    exists (select 1 from public.shop_admins where user_id = (select auth.uid()))
  );

create policy "Only shopkeepers see orders" on public.orders
  for select to authenticated using (
    exists (select 1 from public.shop_admins where user_id = (select auth.uid()))
  );
create policy "Only shopkeepers change status" on public.orders
  for update to authenticated using (
    exists (select 1 from public.shop_admins where user_id = (select auth.uid()))
  ) with check (
    exists (select 1 from public.shop_admins where user_id = (select auth.uid()))
  );
create policy "Only shopkeepers see order items" on public.order_items
  for select to authenticated using (
    exists (select 1 from public.shop_admins where user_id = (select auth.uid()))
  );

-- Customers call this function. Its owner reads prices from products, writes an
-- order and returns only its code and total. Browser-submitted prices are ignored.
create or replace function public.place_order(
  p_name text, p_phone text, p_note text, p_cart jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_phone text := trim(coalesce(p_phone, ''));
  v_note text := trim(coalesce(p_note, ''));
  v_line jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_seen text[] := array[]::text[];
  v_product public.products%rowtype;
  v_id text;
  v_quantity integer;
  v_total bigint := 0;
  v_order public.orders%rowtype;
begin
  if length(v_name) not between 1 and 80 or v_phone !~ '^\+?[0-9][0-9 -]{8,17}$' or length(v_note) > 300 then
    raise exception 'Enter a valid name, phone number and note';
  end if;
  if jsonb_typeof(p_cart) is distinct from 'array' then
    raise exception 'A cart is required';
  end if;
  if jsonb_array_length(p_cart) not between 1 and 50 then
    raise exception 'Choose between 1 and 50 products';
  end if;

  for v_line in select value from jsonb_array_elements(p_cart) loop
    v_id := v_line->>'id';
    if v_id is null or v_id = any(v_seen) or coalesce(v_line->>'quantity', '') !~ '^[1-9][0-9]?$' then
      raise exception 'Invalid or duplicate cart item';
    end if;
    v_quantity := (v_line->>'quantity')::integer;
    select * into v_product from public.products where id::text = v_id and available = true;
    if not found then raise exception 'A product is no longer available'; end if;
    v_seen := array_append(v_seen, v_id);
    v_total := v_total + v_product.price::bigint * v_quantity;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id, 'name', v_product.name, 'unit', v_product.unit,
      'price', v_product.price, 'quantity', v_quantity,
      'subtotal', v_product.price::bigint * v_quantity
    ));
  end loop;

  insert into public.orders (name, phone, note, total)
    values (v_name, v_phone, v_note, v_total) returning * into v_order;
  insert into public.order_items (order_id, product_id, name, unit, price, quantity, subtotal)
    select v_order.id, (value->>'product_id')::uuid, value->>'name', value->>'unit',
      (value->>'price')::integer, (value->>'quantity')::integer, (value->>'subtotal')::bigint
    from jsonb_array_elements(v_lines);
  return jsonb_build_object('code', v_order.code, 'total', v_order.total);
end;
$$;

revoke all on function public.place_order(text, text, text, jsonb) from public;
grant execute on function public.place_order(text, text, text, jsonb) to anon, authenticated;
