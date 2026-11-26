create table public.assistant_conversations (
 id uuid primary key default gen_random_uuid(),
 restaurant_id uuid not null,
 user_id uuid not null default auth.uid(),
 title text not null default 'New conversation' check(length(trim(title)) between 1 and 100),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key (restaurant_id,user_id) references public.restaurant_members(restaurant_id,user_id) on delete cascade
);
create index assistant_history on public.assistant_conversations(restaurant_id,user_id,updated_at desc);
alter table public.assistant_conversations enable row level security;
create policy own_history on public.assistant_conversations for all to authenticated
 using(user_id=auth.uid() and invoiceeye_private.member_of(restaurant_id))
 with check(user_id=auth.uid() and invoiceeye_private.member_of(restaurant_id));
revoke all on public.assistant_conversations from public,anon,authenticated,service_role;
grant select,insert(restaurant_id,title),update(title),delete on public.assistant_conversations to authenticated;

-- Store both messages of a completed turn together. A provider failure leaves no half-turn.
create table public.assistant_turns (
 id uuid primary key,
 conversation_id uuid not null references public.assistant_conversations on delete cascade,
 question text not null check(length(question) between 1 and 1600),
 answer jsonb not null check(jsonb_typeof(answer)='object'),
 context jsonb not null,
 created_at timestamptz not null default now()
);
create index assistant_thread on public.assistant_turns(conversation_id,created_at);
alter table public.assistant_turns enable row level security;
create policy own_messages on public.assistant_turns for select to authenticated using
 (exists(select from public.assistant_conversations c where c.id=conversation_id));
revoke all on public.assistant_turns from public,anon,authenticated,service_role;
grant select on public.assistant_turns to authenticated;

create table invoiceeye_private.assistant_jobs(
 restaurant_id uuid not null, actor uuid not null, conversation uuid, lease uuid,
 started timestamptz, window_start timestamptz not null default now(), attempts int not null default 0,
 primary key(restaurant_id,actor),
 foreign key(restaurant_id,actor) references public.restaurant_members(restaurant_id,user_id) on delete cascade
);
alter table invoiceeye_private.assistant_jobs enable row level security;
revoke all on invoiceeye_private.assistant_jobs from public,anon,authenticated,service_role;

create function public.claim_assistant(rid uuid, actor_id uuid, cid uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare job invoiceeye_private.assistant_jobs; token uuid:=gen_random_uuid();
begin
 if not exists(select from public.assistant_conversations where id=cid and restaurant_id=rid and user_id=actor_id) then raise exception 'Conversation unavailable'; end if;
 insert into invoiceeye_private.assistant_jobs(restaurant_id,actor) values(rid,actor_id) on conflict do nothing;
 select * into strict job from invoiceeye_private.assistant_jobs where restaurant_id=rid and actor=actor_id for update;
 if job.lease is not null and job.started>now()-interval '3 minutes' then raise exception 'Request in progress'; end if;
 if job.window_start<=now()-interval '1 hour' then job.window_start:=now(); job.attempts:=0; end if;
 if job.attempts>=30 then raise exception 'Hourly limit reached'; end if;
 update invoiceeye_private.assistant_jobs set lease=token,conversation=cid,started=now(),window_start=job.window_start,attempts=job.attempts+1 where restaurant_id=rid and actor=actor_id;
 return token;
end $$;
create function public.finish_assistant(rid uuid, actor_id uuid,cid uuid,token uuid,turn_id uuid,prompt text,result jsonb,scope jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 update invoiceeye_private.assistant_jobs set lease=null where restaurant_id=rid and actor=actor_id and conversation=cid and lease=token;
 if not found then raise exception 'Request expired'; end if;
 if result is null then return; end if;
 update public.assistant_conversations set updated_at=now() where id=cid and restaurant_id=rid and user_id=actor_id;
 if not found then raise exception 'Conversation unavailable'; end if;
 insert into public.assistant_turns(id,conversation_id,question,answer,context) values(turn_id,cid,prompt,result,scope);
end $$;
revoke all on function public.claim_assistant(uuid,uuid,uuid),public.finish_assistant(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.claim_assistant(uuid,uuid,uuid),public.finish_assistant(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb) to service_role;
