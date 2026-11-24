-- Read one consistent snapshot of confirmed headers and lines, through caller RLS.
create function public.analysis_inputs(rid uuid, first_day date, last_day date)
returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
 'uuid',i.id,'id',i.invoice_number,'date',i.invoice_date,'amount',i.total_amount,'currency',i.currency,
 'status','ready','supplierId',s.id,'supplier',s.name,'lines',(
 select coalesce(jsonb_agg(jsonb_build_object('productKey',g.id,'ingredient',g.name,'specification',g.specification,
 'baseUnit',g.base_unit,'quantity',x.quantity,'packageSize',x.package_size,'normalizedPrice',x.normalized_unit_price)
 order by x.id),'[]') from public.invoice_items x left join public.ingredients g on g.id=x.ingredient_id where x.invoice_id=i.id))
 order by i.invoice_date,i.id),'[]')
 from public.invoices i join public.suppliers s on s.id=i.supplier_id where i.restaurant_id=rid and i.processing_status='ready'
 and i.invoice_date between first_day and last_day;
$$;
revoke all on function public.analysis_inputs(uuid,date,date) from public,anon;
grant execute on function public.analysis_inputs(uuid,date,date) to authenticated;

create table invoiceeye_private.analysis_jobs (
 restaurant_id uuid primary key references public.restaurants, token uuid, started timestamptz,
 window_start timestamptz not null, attempts int not null
);
alter table invoiceeye_private.analysis_jobs enable row level security;
revoke all on invoiceeye_private.analysis_jobs from public,anon,authenticated;

create function public.claim_analysis(rid uuid, actor uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare j invoiceeye_private.analysis_jobs; lease uuid:=gen_random_uuid();
begin
 if not exists(select from public.restaurant_members where restaurant_id=rid and user_id=actor) then raise exception 'Membership required'; end if;
 insert into invoiceeye_private.analysis_jobs(restaurant_id,window_start,attempts) values(rid,now(),0) on conflict do nothing;
 select * into strict j from invoiceeye_private.analysis_jobs where restaurant_id=rid for update;
 if j.token is not null and j.started>now()-interval '3 minutes' then raise exception 'Generation in progress'; end if;
 if j.window_start<=now()-interval '1 hour' then j.window_start:=now(); j.attempts:=0; end if;
 if j.attempts>=6 then raise exception 'Hourly limit reached'; end if;
 update invoiceeye_private.analysis_jobs set token=lease,started=now(),window_start=j.window_start,attempts=j.attempts+1 where restaurant_id=rid;
 return lease;
end $$;
create function public.finish_analysis(rid uuid, actor uuid, lease uuid, payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare report_id uuid;
begin
 update invoiceeye_private.analysis_jobs set token=null where restaurant_id=rid and token=lease;
 if not found then raise exception 'Analysis lease expired'; end if;
 if payload is not null and exists(select from public.restaurant_members where restaurant_id=rid and user_id=actor) then
 insert into public.ai_reports(restaurant_id,report) values(rid,payload) returning id into report_id;
 end if;
 return report_id;
end $$;
revoke all on function public.claim_analysis(uuid,uuid),public.finish_analysis(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.claim_analysis(uuid,uuid),public.finish_analysis(uuid,uuid,uuid,jsonb) to service_role;
