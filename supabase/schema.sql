-- 하나더 1+1 나눔 매칭 MVP
-- 새 Supabase 프로젝트의 SQL Editor에서 실행하세요.
-- 기존 동일 명칭의 테이블이 있는 프로젝트에는 검토 없이 적용하지 마세요.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 32),
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_key text not null check (char_length(product_key) between 1 and 80),
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 500),
  original_price integer not null check (original_price > 0),
  min_price integer not null check (min_price >= 0 and min_price <= original_price),
  expires_at timestamptz not null,
  available_from timestamptz not null,
  available_until timestamptz not null,
  meetup_label text not null check (char_length(meetup_label) between 1 and 100),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  image_path text,
  status text not null default 'active' check (status in ('active','reserved','sold')),
  created_at timestamptz not null default now(),
  check (available_from < available_until),
  check (expires_at > created_at)
);

create table if not exists public.buyer_requests (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_key text not null check (char_length(product_key) between 1 and 80),
  max_budget integer not null check (max_budget > 0),
  urgency smallint not null check (urgency between 1 and 5),
  available_from timestamptz not null,
  available_until timestamptz not null,
  meetup_label text not null check (char_length(meetup_label) between 1 and 100),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  created_at timestamptz not null default now(),
  check (available_from < available_until)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  request_id uuid not null references public.buyer_requests(id),
  buyer_id uuid not null references auth.users(id),
  seller_id uuid not null references auth.users(id),
  score numeric(5,2) not null check (score between 0 and 100),
  booked_price integer not null check (booked_price >= 0),
  status text not null default 'reserved' check (status in ('reserved','completed','cancelled')),
  created_at timestamptz not null default now()
);

-- 한 상품과 한 구매요청은 한 번에 하나의 활성 예약만 허용
create unique index if not exists matches_one_active_product
  on public.matches(product_id) where status = 'reserved';
create unique index if not exists matches_one_active_request
  on public.matches(request_id) where status = 'reserved';
create index if not exists products_matching_idx on public.products(product_key,status,expires_at);
create index if not exists products_seller_idx on public.products(seller_id);
create index if not exists requests_buyer_idx on public.buyer_requests(buyer_id);
create index if not exists matches_seller_idx on public.matches(seller_id);
create index if not exists matches_buyer_idx on public.matches(buyer_id);

-- 회원가입 시 최소 프로필 자동 생성 (Auth 이메일 인증 사용 가능)
create or replace function private.create_profile_for_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles(id,nickname)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data->>'nickname'),''),'이웃'),32)
  ) on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function private.create_profile_for_new_user() from public, anon, authenticated;
drop trigger if exists after_auth_signup_create_profile on auth.users;
create trigger after_auth_signup_create_profile
  after insert on auth.users for each row
  execute function private.create_profile_for_new_user();

-- RLS: 소유권과 활성 공개 상품만 조회
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.buyer_requests enable row level security;
alter table public.matches enable row level security;
revoke all on public.profiles,public.products,public.buyer_requests,public.matches from anon,authenticated;
grant select,update on public.profiles to authenticated;
grant select,insert on public.products to authenticated;
grant select,insert on public.buyer_requests to authenticated;
grant select on public.matches to authenticated;

create policy "profiles_self_select" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "profiles_self_update" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "products_active_own_or_matched" on public.products for select to authenticated
  using (
    status = 'active' or seller_id = (select auth.uid()) or exists (
      select 1 from public.matches m
      where m.product_id = products.id and m.buyer_id = (select auth.uid())
    )
  );
create policy "products_owner_insert" on public.products for insert to authenticated
  with check (seller_id = (select auth.uid()) and status = 'active');

create policy "requests_owner_or_reserved_seller_select" on public.buyer_requests for select to authenticated
  using (
    buyer_id = (select auth.uid()) or exists (
      select 1 from public.matches m
      where m.request_id = buyer_requests.id
      and m.seller_id = (select auth.uid())
      and m.status in ('reserved','completed')
    )
  );
create policy "requests_owner_insert" on public.buyer_requests for insert to authenticated
  with check (buyer_id = (select auth.uid()));

create policy "matches_participants_select" on public.matches for select to authenticated
  using (buyer_id = (select auth.uid()) or seller_id = (select auth.uid()));

-- 가격 하락 공식. 앱의 JS 계산과 동일하게 맞춤.
create or replace function private.dynamic_price(
  p_original integer, p_min integer, p_created timestamptz, p_expires timestamptz
) returns integer
language sql stable set search_path = ''
as $$
  select round(
    p_original - (p_original-p_min) * greatest(0.0,least(1.0,
      extract(epoch from (now()-p_created))::numeric /
      greatest(1, extract(epoch from (p_expires-p_created))::numeric)
    ))
  )::integer;
$$;
revoke all on function private.dynamic_price(integer,integer,timestamptz,timestamptz) from public,anon;

-- 예약은 하나의 DB 트랜잭션 안에서 상태 확인 -> 잠금 -> 매칭 INSERT -> 상품 변경
create or replace function private._reserve_match(p_product_id uuid,p_request_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_product public.products%rowtype;
  v_request public.buyer_requests%rowtype;
  v_price integer;
  v_a double precision;
  v_distance double precision;
  v_d double precision;
  v_p numeric;
  v_u numeric;
  v_score numeric(5,2);
  v_match_id uuid;
begin
  if v_user is null then raise exception '로그인이 필요합니다'; end if;

  select * into v_request from public.buyer_requests
  where id=p_request_id and buyer_id=v_user for update;
  if not found then raise exception '본인의 구매 요청을 찾을 수 없습니다'; end if;

  select * into v_product from public.products
  where id=p_product_id for update;
  if not found then raise exception '상품을 찾을 수 없습니다'; end if;

  if v_product.status <> 'active' or v_product.expires_at <= now() then
    raise exception '예약할 수 없는 상품입니다';
  end if;
  if v_product.seller_id = v_user then raise exception '본인 상품은 구매할 수 없습니다'; end if;
  if v_product.product_key <> v_request.product_key then
    raise exception '희망상품이 일치하지 않습니다';
  end if;
  if least(v_product.available_until,v_request.available_until) <= now()
     or greatest(v_product.available_from,v_request.available_from)
       >= least(v_product.available_until,v_request.available_until) then
    raise exception '예약 가능한 거래시간이 겹치지 않습니다';
  end if;

  v_price := private.dynamic_price(
    v_product.original_price,v_product.min_price,v_product.created_at,v_product.expires_at
  );
  if v_price > v_request.max_budget then raise exception '구매 예산을 초과합니다'; end if;

  v_a := power(sin(radians(v_product.latitude-v_request.latitude)/2),2)
    + cos(radians(v_request.latitude))*cos(radians(v_product.latitude))
    * power(sin(radians(v_product.longitude-v_request.longitude)/2),2);
  v_distance := 6371 * 2 * asin(least(1.0,sqrt(greatest(0.0,v_a))));
  v_d := greatest(0.0,1.0-v_distance/1.5);
  v_p := 0.5 + 0.5*(v_request.max_budget-v_price)::numeric/v_request.max_budget;
  v_u := v_request.urgency::numeric/5;
  v_score := round((100*(0.35*v_d+0.30*v_p+0.20*1+0.15*v_u))::numeric,2);

  insert into public.matches(product_id,request_id,buyer_id,seller_id,score,booked_price,status)
  values (v_product.id,v_request.id,v_user,v_product.seller_id,v_score,v_price,'reserved')
  returning id into v_match_id;

  update public.products set status='reserved' where id=v_product.id;
  return v_match_id;
end;
$$;
revoke all on function private._reserve_match(uuid,uuid) from public,anon;
grant execute on function private._reserve_match(uuid,uuid) to authenticated;

create or replace function public.reserve_match(p_product_id uuid,p_request_id uuid)
returns uuid language sql security invoker set search_path = ''
as $$ select private._reserve_match(p_product_id,p_request_id); $$;
revoke all on function public.reserve_match(uuid,uuid) from public,anon;
grant execute on function public.reserve_match(uuid,uuid) to authenticated;

create or replace function private._change_match_status(p_match_id uuid,p_action text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_match public.matches%rowtype;
begin
  if v_user is null then raise exception '로그인이 필요합니다'; end if;
  select * into v_match from public.matches where id=p_match_id for update;
  if not found then raise exception '매칭을 찾을 수 없습니다'; end if;
  if v_match.status <> 'reserved' then raise exception '활성 예약이 아닙니다'; end if;
  if p_action='cancel' then
    if v_user not in (v_match.buyer_id,v_match.seller_id) then
      raise exception '예약 취소 권한이 없습니다';
    end if;
    update public.matches set status='cancelled' where id=v_match.id;
    update public.products set status='active'
      where id=v_match.product_id and status='reserved';
  elsif p_action='complete' then
    if v_user <> v_match.seller_id then raise exception '판매자만 거래 완료할 수 있습니다'; end if;
    update public.matches set status='completed' where id=v_match.id;
    update public.products set status='sold' where id=v_match.product_id;
  else
    raise exception '허용되지 않은 작업입니다';
  end if;
  return v_match.id;
end;
$$;
revoke all on function private._change_match_status(uuid,text) from public,anon;
grant execute on function private._change_match_status(uuid,text) to authenticated;

create or replace function public.change_match_status(p_match_id uuid,p_action text)
returns uuid language sql security invoker set search_path = ''
as $$ select private._change_match_status(p_match_id,p_action); $$;
revoke all on function public.change_match_status(uuid,text) from public,anon;
grant execute on function public.change_match_status(uuid,text) to authenticated;

-- 공개 가능한 상품 사진 전용 버킷: 민감한 사진은 업로드하면 안 됩니다.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-images','product-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "product_image_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id='product-images'
    and (storage.foldername(name))[1]=(select auth.uid())::text
  );
create policy "product_image_owner_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id='product-images'
    and (storage.foldername(name))[1]=(select auth.uid())::text
  );
