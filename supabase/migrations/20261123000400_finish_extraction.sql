-- Finish only the current leased job. The worker needs no direct invoice table grants.
create function public.finish_invoice_extraction(iid uuid, lease uuid, result jsonb, model text, failure text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if failure is null and (jsonb_typeof(result) is distinct from 'object' or model is null) then
  raise exception 'Missing extraction result';
 end if;
 update public.invoices set processing_status=case when failure is null then 'awaiting_review' else 'failed' end,
 extraction=coalesce(result,extraction),extraction_model=coalesce(model,extraction_model),
 extraction_error=failure,extraction_token=null
 where id=iid and extraction_token=lease and processing_status='processing';
 return found;
end $$;
revoke all on function public.finish_invoice_extraction(uuid,uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.finish_invoice_extraction(uuid,uuid,jsonb,text,text) to service_role;
