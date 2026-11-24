alter table public.invoices
 add column discounts numeric(14,2) not null default 0 check(discounts>=0),
 add column file_hash text check(file_hash ~ '^[0-9a-f]{64}$'),
 add column extraction jsonb, add column extraction_model text, add column extraction_error text,
 add column extraction_started timestamptz, add column extraction_token uuid,
 drop constraint invoices_check, drop constraint invoices_processing_status_check,
 add check(total_amount=subtotal-discounts+tax),
 add check(processing_status in ('uploaded','processing','awaiting_review','ready','failed','discarded'));
alter table public.invoice_items add column description text;
create unique index invoices_unique_content on public.invoices(restaurant_id,file_hash) where file_hash is not null and processing_status<>'discarded';
create unique index invoices_confirmed_identity on public.invoices(restaurant_id,supplier_id,lower(btrim(invoice_number))) where processing_status='ready';
create table invoiceeye_private.extraction_budget (
 restaurant_id uuid primary key references public.restaurants, window_start timestamptz not null, calls int not null
);
revoke all on invoiceeye_private.extraction_budget from public,anon,authenticated;
alter table invoiceeye_private.extraction_budget enable row level security;

-- Called only by the Edge Function, after checking identity, membership and file access.
create function public.claim_invoice_extraction(iid uuid, actor uuid, digest text) returns uuid
language plpgsql security definer set search_path='' as $$
declare inv public.invoices; lease uuid:=gen_random_uuid(); n int;
begin
 select * into strict inv from public.invoices where id=iid for update;
 if not exists(select 1 from public.restaurant_members where restaurant_id=inv.restaurant_id and user_id=actor)
 or inv.original_file_path is null then raise exception 'Access denied'; end if;
 if inv.processing_status in ('ready','discarded') then raise exception 'Invoice closed'; end if;
 if inv.processing_status='processing' and inv.extraction_started>now()-interval '2 minutes' then raise exception 'Extraction already running'; end if;
 insert into invoiceeye_private.extraction_budget as b values(inv.restaurant_id,date_trunc('hour',now()),1)
 on conflict(restaurant_id) do update set window_start=excluded.window_start,
 calls=case when b.window_start=excluded.window_start then b.calls+1 else 1 end returning calls into n;
 if n>20 then raise exception 'Hourly extraction limit reached'; end if;
 update public.invoices set file_hash=digest,processing_status='processing',extraction_started=now(),extraction_token=lease,extraction_error=null where id=iid;
 return lease;
end $$;
revoke all on function public.claim_invoice_extraction(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_invoice_extraction(uuid,uuid,text) to service_role;

create function public.discard_invoice(iid uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.invoices set processing_status='discarded',extraction=null,extraction_token=null
 where id=iid and invoiceeye_private.member_of(restaurant_id) and processing_status<>'ready';
 if not found then raise exception 'Draft unavailable'; end if;
end $$;
revoke all on function public.discard_invoice(uuid) from public,anon;
grant execute on function public.discard_invoice(uuid) to authenticated;

create function public.confirm_invoice(iid uuid, draft jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare inv public.invoices; sid uuid; supplier text:=btrim(draft->>'supplier'); item jsonb;
 qty numeric(14,4); price numeric(14,4); pack numeric(14,4); line numeric; sum_lines numeric:=0;
 sub numeric(14,2):=(draft->>'subtotal')::numeric; tx numeric(14,2):=(draft->>'tax')::numeric;
 disc numeric(14,2):=(draft->>'discounts')::numeric; amt numeric(14,2):=(draft->>'total')::numeric;
 ing uuid; matches uuid[]; base text;
begin
 select * into inv from public.invoices where id=iid and invoiceeye_private.member_of(restaurant_id) for update;
 if not found then raise exception 'Invoice unavailable'; end if;
 if inv.processing_status='ready' then return iid; end if;
 if inv.processing_status not in ('awaiting_review','failed') or inv.file_hash is null or inv.original_file_path is null then raise exception 'Draft unavailable'; end if;
 if nullif(supplier,'') is null or nullif(btrim(draft->>'number'),'') is null or nullif(draft->>'date','') is null
 or coalesce(draft->>'currency','') !~ '^[A-Z]{3}$' or sub is null or tx is null or disc is null or amt is null
 or coalesce(jsonb_typeof(draft->'items'),'')<>'array' or jsonb_array_length(draft->'items') not between 1 and 200
 then raise exception 'Complete required fields'; end if;
 perform pg_advisory_xact_lock(hashtextextended(inv.restaurant_id::text||lower(supplier),0));
 select array_agg(id) into matches from public.suppliers where restaurant_id=inv.restaurant_id and lower(btrim(name))=lower(supplier);
 if cardinality(matches)>1 then
  select id into strict sid from public.suppliers where restaurant_id=inv.restaurant_id and name=supplier;
 elsif matches is null then insert into public.suppliers(restaurant_id,name) values(inv.restaurant_id,supplier) returning id into sid;
 else sid:=matches[1]; end if;
 for item in select value from jsonb_array_elements(draft->'items') loop
  qty:=(item->>'quantity')::numeric; price:=(item->>'unitPrice')::numeric; pack:=(item->>'packageSize')::numeric; line:=(item->>'lineTotal')::numeric;
  ing:=nullif(item->>'ingredientId','')::uuid;
  if ing is not null then
   select base_unit into strict base from public.ingredients where restaurant_id=inv.restaurant_id and id=ing;
   if base is distinct from item->>'packageUnit' then raise exception 'Package unit must match the ingredient base unit'; end if;
  end if;
  if nullif(btrim(item->>'name'),'') is null or nullif(btrim(item->>'unit'),'') is null or line is null
  or line is distinct from round(qty*price,2) then raise exception 'Check line arithmetic and required values'; end if;
  insert into public.invoice_items(restaurant_id,invoice_id,ingredient_id,original_product_name,description,quantity,unit,package_size,unit_price)
  values(inv.restaurant_id,iid,ing,item->>'name',item->>'description',qty,item->>'unit',pack,price);
  sum_lines:=sum_lines+line;
 end loop;
 if sub<>sum_lines or amt<>sub-disc+tx then raise exception 'Invoice totals do not reconcile'; end if;
 update public.invoices set processing_status='ready',supplier_id=sid,invoice_number=btrim(draft->>'number'),invoice_date=(draft->>'date')::date,
 currency=draft->>'currency',subtotal=sub,tax=tx,discounts=disc,total_amount=amt,extraction_token=null where id=iid;
 return iid;
end $$;
revoke all on function public.confirm_invoice(uuid,jsonb) from public,anon;
grant execute on function public.confirm_invoice(uuid,jsonb) to authenticated;
