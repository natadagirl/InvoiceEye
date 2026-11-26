alter table public.restaurants add column alerts_enabled boolean not null default true;
grant update(alerts_enabled) on public.restaurants to authenticated;

create table public.alert_reads (
 restaurant_id uuid not null,
 user_id uuid not null default auth.uid(),
 supplier_id uuid not null,
 ingredient_id uuid not null,
 period date not null check(extract(day from period)=1),
 primary key(restaurant_id,user_id,period,supplier_id,ingredient_id),
 foreign key(restaurant_id,user_id) references public.restaurant_members(restaurant_id,user_id) on delete cascade,
 foreign key(restaurant_id,supplier_id) references public.suppliers(restaurant_id,id),
 foreign key(restaurant_id,ingredient_id) references public.ingredients(restaurant_id,id)
);
alter table public.alert_reads enable row level security;
revoke all on public.alert_reads from public,anon,authenticated,service_role;
grant select,insert(restaurant_id,period,supplier_id,ingredient_id) on public.alert_reads to authenticated;
create policy own_receipts on public.alert_reads for select to authenticated using(user_id=auth.uid() and invoiceeye_private.member_of(restaurant_id));
create policy mark_read on public.alert_reads for insert to authenticated with check(user_id=auth.uid() and invoiceeye_private.member_of(restaurant_id));
