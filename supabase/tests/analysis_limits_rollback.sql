begin;
do $$
declare rid uuid; uid uuid; lease uuid; prevented boolean:=false;
begin
 select m.user_id into strict uid from public.restaurant_members m where m.restaurant_id='c0464521-6f28-48b5-9bc0-d82c51d51170' and m.role='owner';
 insert into public.restaurants(name,is_demo) values('Transaction-only analysis fixture',true) returning id into rid;
 insert into public.restaurant_members(restaurant_id,user_id,role) values(rid,uid,'owner');
 lease:=public.claim_analysis(rid,uid);
 begin perform public.claim_analysis(rid,uid); exception when raise_exception then prevented:=sqlerrm='Generation in progress'; end;
 if not prevented then raise exception 'Concurrent claim accepted'; end if;
 perform public.finish_analysis(rid,uid,lease,null);
 for n in 2..6 loop
  lease:=public.claim_analysis(rid,uid);
  perform public.finish_analysis(rid,uid,lease,null);
 end loop;
 prevented:=false;
 begin perform public.claim_analysis(rid,uid); exception when raise_exception then prevented:=sqlerrm='Hourly limit reached'; end;
 if not prevented then raise exception 'Hourly ceiling failed'; end if;
 if has_function_privilege('authenticated','public.finish_analysis(uuid,uuid,uuid,jsonb)','execute') then raise exception 'Unexpected client privilege'; end if;
end $$;
rollback;
