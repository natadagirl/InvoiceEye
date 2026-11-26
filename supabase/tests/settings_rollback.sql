begin;
do $$
declare rid uuid:='c0464521-6f28-48b5-9bc0-d82c51d51170'; a uuid; b uuid; s uuid; i uuid; n int;
begin
 select user_id into strict a from public.restaurant_members where restaurant_id=rid and role='owner' limit 1;
 select user_id into strict b from public.restaurant_members where user_id<>a limit 1;
 select id into strict s from public.suppliers where restaurant_id=rid limit 1;
 select id into strict i from public.ingredients where restaurant_id=rid limit 1;
 insert into public.restaurant_members(restaurant_id,user_id,role) values(rid,b,'member') on conflict do nothing;
 perform set_config('request.jwt.claim.sub',a::text,true); set local role authenticated;
 update public.restaurants set name='Rollback only',alerts_enabled=false where id=rid;
 if not found then raise exception 'Owner save failed'; end if;
 update public.profiles set display_name='Rollback' where id=a;
 if not found then raise exception 'Profile save failed'; end if;
 insert into public.alert_reads(restaurant_id,period,supplier_id,ingredient_id) values(rid,'2000-01-01',s,i) on conflict do nothing;
 perform set_config('request.jwt.claim.sub',b::text,true);
 if exists(select from public.alert_reads where user_id=a) then raise exception 'Peer receipt visible'; end if;
 update public.restaurants set name='Denied' where id=rid;
 if found then raise exception 'Member rename'; end if;
 update public.profiles set display_name='Denied' where id=a;
 if found then raise exception 'Peer profile edit'; end if;
 reset role;
end $$;
rollback;
