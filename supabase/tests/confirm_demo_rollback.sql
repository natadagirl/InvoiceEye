-- Transaction-only integration check. All rows below are synthetic and rolled back.
begin;
do $$
declare rid uuid; uid uuid; ing uuid; sid uuid; iid uuid:=gen_random_uuid(); prior numeric; draft jsonb; saved numeric;
begin
 select r.id,m.user_id into strict rid,uid from public.restaurants r join public.restaurant_members m on m.restaurant_id=r.id
 where r.id='c0464521-6f28-48b5-9bc0-d82c51d51170' and r.is_demo and m.role='owner';
 select id into strict ing from public.ingredients where restaurant_id=rid and name='Roma tomatoes';
 select id into strict sid from public.suppliers where restaurant_id=rid and name='Cedar Valley Produce';
 select sum(x.quantity*x.package_size*x.normalized_unit_price)/sum(x.quantity*x.package_size) into prior
 from public.invoice_items x join public.invoices i on i.id=x.invoice_id where i.restaurant_id=rid and i.supplier_id=sid and x.ingredient_id=ing and i.invoice_date between '2026-11-01' and '2026-11-30';
 insert into public.invoices(id,restaurant_id,processing_status,file_hash,original_file_path)
 values(iid,rid,'awaiting_review',md5(iid::text)||md5(rid::text),rid::text||'/'||iid::text||'.png');
 perform set_config('request.jwt.claim.sub',uid::text,true);
 execute 'set local role authenticated';
 draft:=jsonb_build_object('supplier',' Cedar Valley Produce ','number','REHEARSAL-'||iid,'date','2026-12-09','currency','CAD',
 'subtotal',85.50,'tax',0,'discounts',5,'total',80.50,'items',jsonb_build_array(jsonb_build_object(
 'name','Roma tomatoes','description','Verified against source','quantity',3,'unit','case','packageSize',5,
 'packageUnit','kg','unitPrice',28.50,'lineTotal',85.50,'ingredientId',ing)));
 perform public.confirm_invoice(iid,draft);
 select x.normalized_unit_price into strict saved from public.invoice_items x join public.invoices i on i.id=x.invoice_id
 where i.id=iid and i.processing_status='ready' and i.total_amount=80.50 and i.supplier_id=sid and x.ingredient_id=ing;
 if saved<>5.70 or prior is null or (saved/prior-1)*100<10 then raise exception 'Comparable price alert failed'; end if;
end $$;
rollback;
