-- A second member of the same synthetic workspace must not see the owner's chat.
begin;
do $$
declare rid uuid; owner_id uuid; peer_id uuid; cid uuid; token uuid; changed int;
begin
 select r.id,m.user_id into strict rid,owner_id from public.restaurants r join public.restaurant_members m on m.restaurant_id=r.id where r.is_demo and r.id='c0464521-6f28-48b5-9bc0-d82c51d51170' and m.role='owner' limit 1;
 select user_id into strict peer_id from public.restaurant_members where user_id<>owner_id and restaurant_id<>rid limit 1;
 insert into public.restaurant_members(restaurant_id,user_id,role) values(rid,peer_id,'member') on conflict do nothing;
 insert into public.assistant_conversations(restaurant_id,user_id,title) values(rid,owner_id,'Rollback only') returning id into cid;
 token:=public.claim_assistant(rid,owner_id,cid);
 perform public.finish_assistant(rid,owner_id,cid,token,gen_random_uuid(),'Verification','{}','{}');
 perform set_config('request.jwt.claim.sub',peer_id::text,true);
 set local role authenticated;
 if not invoiceeye_private.member_of(rid) then raise exception 'Missing peer membership'; end if;
 if exists(select from public.assistant_conversations where id=cid) or exists(select from public.assistant_turns where conversation_id=cid) then raise exception 'Peer could read conversation'; end if;
 update public.assistant_conversations set title='Unexpected edit' where id=cid;
 get diagnostics changed=row_count; if changed<>0 then raise exception 'Unauthorized edit'; end if;
 reset role;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 set local role authenticated;
 update public.assistant_conversations set title='Test renamed' where id=cid;
 get diagnostics changed=row_count; if changed<>1 then raise exception 'Owner rename failed'; end if;
 delete from public.assistant_conversations where id=cid;
 get diagnostics changed=row_count; if changed<>1 then raise exception 'Owner deletion failed'; end if;
 reset role;
 if exists(select from public.assistant_turns where conversation_id=cid) then raise exception 'Orphaned turn'; end if;
end $$;
rollback;
