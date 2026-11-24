create schema invoiceeye_private;
revoke all on schema invoiceeye_private from public;
grant usage on schema invoiceeye_private to authenticated;

create table public.profiles (
 id uuid primary key references auth.users(id), display_name text,
 created_at timestamptz not null default now()
);
create table public.restaurants (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 100),
 is_demo boolean not null default false, alert_threshold integer not null default 10 check(alert_threshold in (5,10,15,20)),
 created_at timestamptz not null default now()
);
create table public.restaurant_members (
 restaurant_id uuid not null references public.restaurants, user_id uuid not null references public.profiles,
 role text not null check(role in ('owner','member')), primary key(restaurant_id,user_id),
 created_at timestamptz not null default now()
);
create index restaurant_members_user on public.restaurant_members(user_id,restaurant_id);
create table public.suppliers (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants,
 name text not null check(trim(name)<>''), unique(restaurant_id,id), unique(restaurant_id,name),
 created_at timestamptz not null default now()
);
create table public.ingredients (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants,
 name text not null, specification text not null check(trim(specification)<>''), base_unit text not null check(base_unit in ('kg','L','each')),
 unique(restaurant_id,id), unique(restaurant_id,name,specification,base_unit),
 created_at timestamptz not null default now()
);
create table public.invoices (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants,
 supplier_id uuid, invoice_number text, invoice_date date not null default current_date,
 currency text not null default 'CAD' check(currency ~ '^[A-Z]{3}$'),
 subtotal numeric(14,2) check(subtotal>=0), tax numeric(14,2) check(tax>=0),
 total_amount numeric(14,2) check(total_amount>=0), check(total_amount=subtotal+tax),
 original_file_path text unique, processing_status text not null default 'uploaded' check(processing_status in ('uploaded','processing','ready','failed')),
 check(processing_status<>'ready' or (supplier_id is not null and total_amount is not null and tax is not null and subtotal is not null and invoice_number is not null)),
 check(original_file_path is null or original_file_path ~ ('^'||restaurant_id::text||'/'||id::text||'[.](pdf|jpe?g|png)$')),
 unique(restaurant_id,id), unique(restaurant_id,supplier_id,invoice_number),
 foreign key(restaurant_id,supplier_id) references public.suppliers(restaurant_id,id),
 created_at timestamptz not null default now()
);
create index invoices_restaurant_date on public.invoices(restaurant_id,invoice_date desc);
create table public.invoice_items (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants,
 invoice_id uuid not null, ingredient_id uuid, original_product_name text not null,
 quantity numeric(14,4) not null check(quantity>0), unit text not null, package_size numeric(14,4) not null check(package_size>0),
 unit_price numeric(14,4) not null check(unit_price>=0),
 normalized_unit_price numeric(16,6) generated always as (unit_price/package_size) stored,
 line_total numeric(14,2) generated always as (round(quantity*unit_price,2)) stored,
 foreign key(restaurant_id,invoice_id) references public.invoices(restaurant_id,id),
 foreign key(restaurant_id,ingredient_id) references public.ingredients(restaurant_id,id),
 created_at timestamptz not null default now()
);
create index invoice_items_parent on public.invoice_items(restaurant_id,invoice_id);
create index invoice_items_product on public.invoice_items(restaurant_id,ingredient_id);
create table public.price_alerts (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants,
 ingredient_id uuid not null, supplier_id uuid not null, period date not null,
 previous_price numeric(16,6) not null check(previous_price>0), current_price numeric(16,6) not null check(current_price>previous_price),
 foreign key(restaurant_id,ingredient_id) references public.ingredients(restaurant_id,id),
 foreign key(restaurant_id,supplier_id) references public.suppliers(restaurant_id,id),
 unique(restaurant_id,period,ingredient_id,supplier_id), created_at timestamptz not null default now()
);
create table public.ai_reports (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants,
 report jsonb not null, created_at timestamptz not null default now()
);
create index ai_reports_restaurant on public.ai_reports(restaurant_id,created_at);

create function invoiceeye_private.member_of(rid uuid, owner_only boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.restaurant_members where restaurant_id=rid and user_id=(select auth.uid()) and (not owner_only or role='owner'))
$$;
revoke all on function invoiceeye_private.member_of(uuid,boolean) from public,anon;
grant execute on function invoiceeye_private.member_of(uuid,boolean) to authenticated;

do $$ declare t text; begin
 foreach t in array array['profiles','restaurants','restaurant_members','suppliers','ingredients','invoices','invoice_items','price_alerts','ai_reports'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 if t not in ('profiles','restaurants') then
 execute format('create policy member_read on public.%I for select to authenticated using (invoiceeye_private.member_of(restaurant_id))',t);
 end if;
 end loop;
end $$;
create policy self_read on public.profiles for select to authenticated using(id=(select auth.uid()));
create policy member_read on public.restaurants for select to authenticated using(invoiceeye_private.member_of(id));
grant update(alert_threshold) on public.restaurants to authenticated;
create policy owner_settings on public.restaurants for update to authenticated using(invoiceeye_private.member_of(id,true)) with check(invoiceeye_private.member_of(id,true));

create function public.onboard_restaurant(restaurant_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid(); rid uuid;
begin
 if uid is null then raise exception 'Sign in required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text,0));
 select restaurant_id into rid from public.restaurant_members where user_id=uid limit 1;
 if found then return rid; end if;
 insert into public.profiles(id) values(uid) on conflict do nothing;
 insert into public.restaurants(name) values(trim(restaurant_name)) returning id into rid;
 insert into public.restaurant_members values(rid,uid,'owner',now());
 return rid;
end $$;
revoke all on function public.onboard_restaurant(text) from public,anon;
grant execute on function public.onboard_restaurant(text) to authenticated;
