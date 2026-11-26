-- Run within a transaction followed by ROLLBACK.
do $$
declare rid uuid; uid uuid; cid uuid; token uuid; denied boolean:=false;
begin
 select restaurant_id,user_id into strict rid,uid from public.restaurant_members limit 1;
 insert into public.assistant_conversations(restaurant_id,user_id) values(rid,uid) returning id into cid;
 token:=public.claim_assistant(rid,uid,cid);
 begin perform public.claim_assistant(rid,uid,cid); exception when raise_exception then denied:=sqlerrm='Request in progress'; end;
 if not denied then raise exception 'Missing concurrency protection'; end if;
 perform public.finish_assistant(rid,uid,cid,token,gen_random_uuid(),'Test','{}','{}');
 if (select count(*) from public.assistant_turns where conversation_id=cid)<>1 then raise exception 'Atomic turn missing'; end if;
 if has_function_privilege('authenticated','public.claim_assistant(uuid,uuid,uuid)','execute') or has_table_privilege('authenticated','public.assistant_turns','insert') then raise exception 'Unexpected grant'; end if;
 for n in 2..30 loop
 token:=public.claim_assistant(rid,uid,cid);
 perform public.finish_assistant(rid,uid,cid,token,gen_random_uuid(),null,null,null);
 end loop;
 denied:=false;
 begin perform public.claim_assistant(rid,uid,cid); exception when raise_exception then denied:=sqlerrm='Hourly limit reached'; end;
 if not denied then raise exception 'Missing hourly limit'; end if;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 set local role authenticated;
 if exists(select from public.assistant_turns where conversation_id=cid) or exists(select from public.assistant_conversations where id=cid) then raise exception 'History disclosure'; end if;
 reset role;
end $$;
