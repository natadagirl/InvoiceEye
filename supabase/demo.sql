-- Run with psql -v demo_user=<authorized Auth user UUID> -f supabase/demo.sql
-- A single transaction creates one demo tenant. Replays never overwrite records.
begin;
select set_config('invoiceeye.demo_user', :'demo_user', true);
do $$
declare
 rid constant uuid := 'c0464521-6f28-48b5-9bc0-d82c51d51170';
 uid uuid := current_setting('invoiceeye.demo_user')::uuid;
 supplier_names text[] := array['Cedar Valley Produce','Willow Farm Dairy','Copper Mill Pantry','Spruce Market Foods','Juniper Wholesale'];
 names text[] := array['Roma tomatoes','Baby spinach','Carrots','Red onions','Potatoes','Bell peppers','Whole milk','Cream','Butter','Cheddar','Yogurt','Mozzarella','Flour','White rice','Lentils','Chickpeas','Sugar','Oats','Olive oil','Sunflower oil','Coffee beans','Cocoa','Chicken breast','Ground beef','Penne','Canned tomatoes','Basil','Garlic','Eggs','Lemons'];
 base_prices numeric[] := array[3.1,7.55,2.05,1.7,1.25,4.2,1.65,4.8,8.1,10.4,4.5,11,1.12,2.4,2.85,3.25,1.3,2.1,9.1,3.8,19,14,10.2,8.7,2.1,2.5,18,6,0.32,0.68];
 sid uuid; iid uuid; inv uuid; idx integer; base text; pack numeric; price numeric; qty integer; amount numeric;
begin
 if not exists(select 1 from auth.users where id=uid) then raise exception 'Select an existing authorized demo user'; end if;
 perform pg_advisory_xact_lock(hashtextextended(rid::text,0));
 if exists(select 1 from public.restaurants where id=rid) then
  if not exists(select 1 from public.restaurants r join public.restaurant_members m on m.restaurant_id=r.id where r.id=rid and r.is_demo and m.user_id=uid and m.role='owner') then raise exception 'Demo tenant already exists for a different owner'; end if;
  return;
 end if;
 insert into public.profiles(id) values(uid) on conflict do nothing;
 insert into public.restaurants(id,name,is_demo) values(rid,'Juniper Kitchen (synthetic)',true);
 insert into public.restaurant_members(restaurant_id,user_id,role) values(rid,uid,'owner');
 for s in 1..5 loop insert into public.suppliers(restaurant_id,name) values(rid,supplier_names[s]); end loop;
 for p in 1..30 loop
  base:=case when p in (7,8,19,20) then 'L' when p>=29 then 'each' else 'kg' end;
  insert into public.ingredients(restaurant_id,name,specification,base_unit) values(rid,names[p],case when p in (7,8) then 'Pasteurized' when p in (23,24) then 'Fresh, chilled' else 'Standard foodservice grade' end,base);
 end loop;
 for m in 0..5 loop for s in 1..5 loop for delivery in 1..3 loop
  select id into strict sid from public.suppliers where restaurant_id=rid and name=supplier_names[s];
  insert into public.invoices(restaurant_id,supplier_id,invoice_number,invoice_date)
   values(rid,sid,format('DEMO-%s-%s-%s',m+1,s,delivery),(date '2026-06-01'+make_interval(months=>m,days=>delivery*6+s))::date) returning id into inv;
  for j in 0..6 loop
   idx:=1+(((s-1)*6+j)%30);
   select id,base_unit into strict iid,base from public.ingredients where restaurant_id=rid and name=names[idx];
   pack:=case when base='each' then 24 when base='L' then 4 else 5 end;
   price:=round(base_prices[idx]*pack*(1+s*0.012)*(1+m*0.014)*(case when m=5 and idx%4=1 then 1.18 when m=5 and idx%4=2 then 0.89 else 1 end),2);
   qty:=2+(idx+m+delivery)%5;
   insert into public.invoice_items(restaurant_id,invoice_id,ingredient_id,original_product_name,quantity,unit,package_size,unit_price)
    values(rid,inv,iid,names[idx]||' · '||pack||' '||base||' case',qty,'case',pack,price);
  end loop;
  select sum(line_total) into amount from public.invoice_items where invoice_id=inv;
  update public.invoices set subtotal=amount,tax=0,total_amount=amount,processing_status='ready' where id=inv;
 end loop;end loop;end loop;
end $$;
commit;
