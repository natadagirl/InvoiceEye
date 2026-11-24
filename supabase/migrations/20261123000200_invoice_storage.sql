insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('invoices','invoices',false,10485760,array['application/pdf','image/jpeg','image/png']);

-- Files are immutable. A successful Storage insert registers the invoice in the same transaction.
create function invoiceeye_private.allowed_file(path text) returns boolean
language sql stable security invoker set search_path='' as $$
 select case when path ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}[.](pdf|jpe?g|png)$'
 then invoiceeye_private.member_of(split_part(path,'/',1)::uuid) else false end
$$;
revoke all on function invoiceeye_private.allowed_file(text) from public,anon;
grant execute on function invoiceeye_private.allowed_file(text) to authenticated;
create policy invoiceeye_upload on storage.objects for insert to authenticated with check(bucket_id='invoices' and invoiceeye_private.allowed_file(name));
create policy invoiceeye_download on storage.objects for select to authenticated using(bucket_id='invoices' and invoiceeye_private.allowed_file(name));
create policy invoiceeye_delete on storage.objects for delete to authenticated using(bucket_id='invoices' and invoiceeye_private.allowed_file(name));
create function invoiceeye_private.sync_invoice_file() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
 insert into public.invoices(id,restaurant_id,original_file_path)
 values(split_part(split_part(new.name,'/',2),'.',1)::uuid,split_part(new.name,'/',1)::uuid,new.name);
 else
 update public.invoices set original_file_path=null where original_file_path=old.name;
 end if;
 return null;
end $$;
revoke all on function invoiceeye_private.sync_invoice_file() from public,anon,authenticated;
create trigger invoiceeye_file_added after insert on storage.objects for each row when(new.bucket_id='invoices') execute function invoiceeye_private.sync_invoice_file();
create trigger invoiceeye_file_removed after delete on storage.objects for each row when(old.bucket_id='invoices') execute function invoiceeye_private.sync_invoice_file();
