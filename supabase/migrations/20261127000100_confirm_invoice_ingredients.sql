-- Catalog identity mirrors the review matcher's normalized word comparison.
create function invoiceeye_private.ingredient_name_key(value text) returns text
language sql immutable strict set search_path='' as $$
 select coalesce(string_agg(token, ' ' order by token collate "C"), '')
 from (
  select case
   when word like '%toes' then left(word,-2)
   when char_length(word)>4 and word like '%s' and word !~ '(ss|us|is)$' then left(word,-1)
   else word end as token
  from regexp_split_to_table(lower(normalize(value,NFKC)), '[^[:alnum:]]+') as words(word)
  where word<>''
 ) normalized;
$$;
revoke all on function invoiceeye_private.ingredient_name_key(text) from public,anon,authenticated;

create or replace function public.confirm_invoice(iid uuid, draft jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare inv public.invoices; sid uuid; supplier text:=btrim(draft->>'supplier'); item jsonb;
 qty numeric(14,4); price numeric(14,4); pack numeric(14,4); line numeric; sum_lines numeric:=0;
 sub numeric(14,2):=(draft->>'subtotal')::numeric; tx numeric(14,2):=(draft->>'tax')::numeric;
 disc numeric(14,2):=(draft->>'discounts')::numeric; amt numeric(14,2):=(draft->>'total')::numeric;
 ing uuid; matches uuid[]; base text; candidate text; candidate_key text;
begin
 select * into inv from public.invoices where id=iid and invoiceeye_private.member_of(restaurant_id) for update;
 if not found then raise exception 'Invoice unavailable'; end if;
 if inv.processing_status='ready' then return iid; end if;
 if inv.processing_status not in ('awaiting_review','failed') or inv.file_hash is null or inv.original_file_path is null then raise exception 'Draft unavailable'; end if;
 if nullif(supplier,'') is null or nullif(btrim(draft->>'number'),'') is null or nullif(draft->>'date','') is null
 or coalesce(draft->>'currency','') !~ '^[A-Z]{3}$' or sub is null or tx is null or disc is null or amt is null
 or coalesce(jsonb_typeof(draft->'items'),'')<>'array' or jsonb_array_length(draft->'items') not between 1 and 200
 then raise exception 'Complete required fields'; end if;
 -- Serialize catalog creation within a tenant, including different suppliers and line orderings.
 if exists(select from jsonb_array_elements(draft->'items') x where x ? 'newIngredientName') then
  perform pg_advisory_xact_lock(hashtextextended('ingredient-confirmation:'||inv.restaurant_id::text,0));
 end if;
 perform pg_advisory_xact_lock(hashtextextended(inv.restaurant_id::text||lower(supplier),0));
 select array_agg(id) into matches from public.suppliers where restaurant_id=inv.restaurant_id and lower(btrim(name))=lower(supplier);
 if cardinality(matches)>1 then
  select id into strict sid from public.suppliers where restaurant_id=inv.restaurant_id and name=supplier;
 elsif matches is null then insert into public.suppliers(restaurant_id,name) values(inv.restaurant_id,supplier) returning id into sid;
 else sid:=matches[1]; end if;
 for item in select value from jsonb_array_elements(draft->'items') loop
  qty:=(item->>'quantity')::numeric; price:=(item->>'unitPrice')::numeric; pack:=(item->>'packageSize')::numeric; line:=(item->>'lineTotal')::numeric;
  ing:=nullif(item->>'ingredientId','')::uuid;
  if item ? 'newIngredientName' then
   if ing is not null or jsonb_typeof(item->'newIngredientName') is distinct from 'string' then
    raise exception 'Choose a new or existing ingredient for each line';
   end if;
   candidate:=btrim(item->>'newIngredientName');
   base:=item->>'packageUnit';
   candidate_key:=invoiceeye_private.ingredient_name_key(candidate);
   if char_length(candidate) not between 1 and 100 or candidate_key !~ '[[:alpha:]]'
     or base is null or base not in ('kg','L','each') then
    raise exception 'Enter an ingredient name (up to 100 characters) and a base unit of kg, L or each';
   end if;
   select array_agg(id) into matches from public.ingredients
    where restaurant_id=inv.restaurant_id and base_unit=base
      and invoiceeye_private.ingredient_name_key(name)=candidate_key;
   if cardinality(matches)>1 then
    raise exception 'Multiple ingredients match %. Select the existing ingredient explicitly.',candidate;
   elsif cardinality(matches)=1 then
    ing:=matches[1];
   else
    insert into public.ingredients(restaurant_id,name,specification,base_unit)
     values(inv.restaurant_id,candidate,'Standard',base) returning id into ing;
   end if;
  end if;
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
