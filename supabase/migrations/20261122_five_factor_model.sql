-- 하나더 마이그레이션 2026-11-22 — 프로젝트 보고서의 5변수 모델
-- 1) 판매글 withdrawn / 구매요청 open·closed 상태, 판매글 수정·내리기, 요청 닫기, 거래 상대 닉네임
-- 2) 보고서 4.2·4.3 입력 항목: 수량, 거래 방식, 상품 상태, 구매 희망수량
-- 3) 보고서 6장 5변수 매칭점수 (src/lib/matching.js 의 MODEL 과 반드시 같은 값)
--      M = 100 × (0.30P + 0.25D + 0.20T + 0.15R + 0.10U)
-- 4) 신뢰도 R = (완료+1)/(종료 전체+2), 판매자 노쇼 신고, 취소 책임자 기록
-- 5) 판매자용 추천 구매자 TOP 3 조회(recommend_buyers)와 선택(select_buyer)
-- 6) 구매자 우선순위(priority) 저장 — 구매자 화면 정렬에만 사용
--
-- 운영 중인 프로젝트의 SQL Editor 에서 이 파일 하나만 실행하세요. 여러 번 실행해도 안전합니다.
-- schema.sql 은 다시 실행하지 마세요.

begin;

-- ---------- 1. 상태 값 확장 ----------
-- products.status 에 'withdrawn'(판매자가 내림) 추가. 기존 CHECK 제약 이름을 몰라도 되도록 찾아서 교체.
do $$
declare c record;
begin
  for c in
    select con.conname from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public' and rel.relname = 'products' and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%status%'
  loop
    execute format('alter table public.products drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.products add constraint products_status_check
  check (status in ('active','reserved','sold','withdrawn'));

-- buyer_requests 에 open/closed 상태 추가
alter table public.buyer_requests add column if not exists status text not null default 'open';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'buyer_requests_status_check') then
    alter table public.buyer_requests add constraint buyer_requests_status_check check (status in ('open','closed'));
  end if;
end $$;

-- ---------- 2. 판매글 수정 (판매 중일 때만, 일부 칼럼만) ----------
revoke update on public.products from authenticated;
grant update (description, original_price, min_price, available_from, available_until,
              meetup_label, latitude, longitude, image_path) on public.products to authenticated;
drop policy if exists "products_owner_update_active" on public.products;
create policy "products_owner_update_active" on public.products for update to authenticated
  using (seller_id = (select auth.uid()) and status = 'active')
  with check (seller_id = (select auth.uid()) and status = 'active');

-- ---------- 3. 판매 내리기 / 요청 닫기 RPC ----------
create or replace function private._withdraw_product(p_product_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_status text;
begin
  if v_user is null then raise exception '로그인이 필요합니다'; end if;
  select status into v_status from public.products where id = p_product_id and seller_id = v_user for update;
  if not found then raise exception '본인의 판매글을 찾을 수 없습니다'; end if;
  if v_status <> 'active' then raise exception '판매 중인 글만 내릴 수 있습니다 (예약 중이면 먼저 예약을 취소하세요)'; end if;
  update public.products set status = 'withdrawn' where id = p_product_id;
  return p_product_id;
end $$;
revoke all on function private._withdraw_product(uuid) from public, anon;
grant execute on function private._withdraw_product(uuid) to authenticated;
create or replace function public.withdraw_product(p_product_id uuid)
returns uuid language sql security invoker set search_path = '' as $$ select private._withdraw_product(p_product_id); $$;
revoke all on function public.withdraw_product(uuid) from public, anon;
grant execute on function public.withdraw_product(uuid) to authenticated;

create or replace function private._close_request(p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception '로그인이 필요합니다'; end if;
  perform 1 from public.buyer_requests where id = p_request_id and buyer_id = v_user for update;
  if not found then raise exception '본인의 구매 요청을 찾을 수 없습니다'; end if;
  if exists (select 1 from public.matches where request_id = p_request_id and status = 'reserved') then
    raise exception '예약 중인 요청은 닫을 수 없습니다 (먼저 예약을 취소하세요)';
  end if;
  update public.buyer_requests set status = 'closed' where id = p_request_id;
  return p_request_id;
end $$;
revoke all on function private._close_request(uuid) from public, anon;
grant execute on function private._close_request(uuid) to authenticated;
create or replace function public.close_request(p_request_id uuid)
returns uuid language sql security invoker set search_path = '' as $$ select private._close_request(p_request_id); $$;
revoke all on function public.close_request(uuid) from public, anon;
grant execute on function public.close_request(uuid) to authenticated;

-- ---------- 4. 거래 상대방 닉네임 조회 ----------
drop policy if exists "profiles_trade_partner_select" on public.profiles;
create policy "profiles_trade_partner_select" on public.profiles for select to authenticated
  using (exists (
    select 1 from public.matches m
    where (m.buyer_id = (select auth.uid()) and m.seller_id = profiles.id)
       or (m.seller_id = (select auth.uid()) and m.buyer_id = profiles.id)
  ));

-- ---------- 5. 보고서 4.2·4.3 입력 항목 ----------
alter table public.products add column if not exists quantity integer not null default 1;
alter table public.products add column if not exists trade_method text not null default '직거래';
alter table public.products add column if not exists condition text not null default '미개봉 새 상품';
alter table public.buyer_requests add column if not exists quantity integer not null default 1;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_quantity_check') then
    alter table public.products add constraint products_quantity_check check (quantity between 1 and 99);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'buyer_requests_quantity_check') then
    alter table public.buyer_requests add constraint buyer_requests_quantity_check check (quantity between 1 and 99);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_text_len_check') then
    alter table public.products add constraint products_text_len_check
      check (char_length(trade_method) <= 30 and char_length(condition) <= 40);
  end if;
end $$;
grant update (quantity, trade_method, condition) on public.products to authenticated;

-- 취소 책임자, 노쇼 기록 (신뢰도 계산용)
alter table public.matches add column if not exists cancelled_by uuid references auth.users(id);
alter table public.matches add column if not exists no_show boolean not null default false;

-- 구매자 우선순위 (구매자 화면의 상품 추천 순서에만 사용, 판매자 TOP 3·저장 점수에는 사용 안 함)
alter table public.buyer_requests add column if not exists priority text[] not null default array['P','D','T','R','U'];
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'buyer_requests_priority_check') then
    alter table public.buyer_requests add constraint buyer_requests_priority_check
      check (cardinality(priority) = 5 and priority @> array['P','D','T','R','U'] and array['P','D','T','R','U'] @> priority);
  end if;
end $$;
-- 본인 요청의 우선순위만 수정 가능 (열린 요청일 때)
grant update (priority) on public.buyer_requests to authenticated;
drop policy if exists "requests_owner_update_priority" on public.buyer_requests;
create policy "requests_owner_update_priority" on public.buyer_requests for update to authenticated
  using (buyer_id = (select auth.uid()) and status = 'open')
  with check (buyer_id = (select auth.uid()) and status = 'open');

-- ---------- 6. 동적 가격 (보고서 5.2) ----------
-- P_s(t) = P_min + (P_0 − P_min)(1 − t/T),  t = 등록 후 경과, T = 등록 ~ 판매 종료
create or replace function private.dynamic_price(
  p_original integer, p_min integer, p_created timestamptz, p_expires timestamptz
) returns integer language sql stable set search_path = '' as $$
  select round(
    p_min + (p_original - p_min) * (1 - greatest(0.0, least(1.0,
      extract(epoch from (now() - p_created))::numeric
      / greatest(1, extract(epoch from (p_expires - p_created))::numeric)
    )))
  )::integer;
$$;
revoke all on function private.dynamic_price(integer,integer,timestamptz,timestamptz) from public, anon;

-- ---------- 7. 신뢰도 R (보고서 6.4) ----------
-- 종료된 거래 = 완료 + 구매자 본인이 취소한 거래 + 노쇼. 판매자가 취소한 건은 구매자 책임이 아니므로 제외.
create or replace function private.trade_stats(p_user uuid, out completed_count integer, out closed_count integer)
language sql stable security definer set search_path = '' as $$
  select
    count(*) filter (where status = 'completed')::integer,
    count(*) filter (where status = 'completed' or (status = 'cancelled' and cancelled_by = p_user))::integer
  from public.matches where buyer_id = p_user;
$$;
revoke all on function private.trade_stats(uuid) from public, anon, authenticated;

-- 누구의 거래 횟수든 조회 가능 (신뢰도는 공개 지표로 설계). 개별 거래 내용은 공개하지 않음.
create or replace function private._get_trade_stats(p_user uuid)
returns table(completed_count integer, closed_count integer)
language sql stable security definer set search_path = '' as $$
  select s.completed_count, s.closed_count from private.trade_stats(p_user) s;
$$;
revoke all on function private._get_trade_stats(uuid) from public, anon;
grant execute on function private._get_trade_stats(uuid) to authenticated;
create or replace function public.get_trade_stats(p_user uuid)
returns table(completed_count integer, closed_count integer)
language sql stable security invoker set search_path = '' as $$ select * from private._get_trade_stats(p_user); $$;
revoke all on function public.get_trade_stats(uuid) from public, anon;
grant execute on function public.get_trade_stats(uuid) to authenticated;

-- ---------- 8. 필터 + 5변수 점수 (보고서 4.4, 6, 7) ----------
drop function if exists private.match_score_v2(public.products, public.buyer_requests, integer);
create or replace function private.pair_eval(p public.products, r public.buyer_requests)
returns table(reason text, price integer, km double precision, minutes numeric,
              f_p numeric, f_d numeric, f_t numeric, f_r numeric, f_u numeric, score numeric,
              completed_count integer, closed_count integer)
language plpgsql stable security definer set search_path = '' as $$
declare v_a double precision;
begin
  price := private.dynamic_price(p.original_price, p.min_price, p.created_at, p.expires_at);
  minutes := greatest(0, extract(epoch from (
      least(p.available_until, r.available_until) - greatest(p.available_from, r.available_from, now())
    )) / 60);
  reason := case
    when p.product_key <> r.product_key then 'product'
    when p.status <> 'active' or p.expires_at <= now() then 'status'
    when p.seller_id = r.buyer_id then 'self'
    when p.quantity < r.quantity then 'quantity'
    when price > r.max_budget then 'budget'
    when minutes <= 0 then 'time'
    else null end;
  v_a := power(sin(radians(p.latitude - r.latitude) / 2), 2)
       + cos(radians(r.latitude)) * cos(radians(p.latitude)) * power(sin(radians(p.longitude - r.longitude) / 2), 2);
  km := 6371 * 2 * asin(least(1.0, sqrt(greatest(0.0, v_a))));
  select s.completed_count, s.closed_count into completed_count, closed_count from private.trade_stats(r.buyer_id) s;
  f_p := greatest(0, least(1, 1 - 0.5 * price::numeric / r.max_budget));
  f_d := greatest(0, least(1, 1 - km::numeric / 1.5));
  f_t := least(1, minutes / 60);
  f_r := (completed_count + 1)::numeric / (closed_count + 2);
  f_u := greatest(0, least(1, r.urgency::numeric / 5));
  score := round(100 * (0.30 * f_p + 0.25 * f_d + 0.20 * f_t + 0.15 * f_r + 0.10 * f_u), 2);
  return next;
end $$;
revoke all on function private.pair_eval(public.products, public.buyer_requests) from public, anon, authenticated;

create or replace function private.reason_text(p_reason text) returns text language sql immutable set search_path = '' as $$
  select case p_reason
    when 'product' then '희망상품이 일치하지 않습니다'
    when 'status' then '판매 중인 상품이 아닙니다'
    when 'self' then '본인 상품입니다'
    when 'quantity' then '수량이 부족합니다'
    when 'budget' then '구매 예산을 초과합니다'
    when 'time' then '거래 가능시간이 겹치지 않습니다'
    else '매칭할 수 없습니다' end;
$$;

-- 매칭 생성 (구매자 예약과 판매자 선택이 함께 사용)
create or replace function private.create_match(p_product_id uuid, p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_product public.products%rowtype; v_request public.buyer_requests%rowtype; v_eval record; v_id uuid;
begin
  select * into v_request from public.buyer_requests where id = p_request_id for update;
  if not found then raise exception '구매 요청을 찾을 수 없습니다'; end if;
  if v_request.status <> 'open' then raise exception '닫힌 구매 요청입니다'; end if;
  select * into v_product from public.products where id = p_product_id for update;
  if not found then raise exception '상품을 찾을 수 없습니다'; end if;
  select * into v_eval from private.pair_eval(v_product, v_request);
  if v_eval.reason is not null then raise exception '%', private.reason_text(v_eval.reason); end if;
  if exists (select 1 from public.matches where request_id = p_request_id and status = 'reserved') then
    raise exception '이 구매 요청은 이미 다른 상품과 매칭되어 있습니다';
  end if;
  insert into public.matches(product_id, request_id, buyer_id, seller_id, score, booked_price, status)
  values (v_product.id, v_request.id, v_request.buyer_id, v_product.seller_id, v_eval.score, v_eval.price, 'reserved')
  returning id into v_id;
  update public.products set status = 'reserved' where id = v_product.id;
  return v_id;
end $$;
revoke all on function private.create_match(uuid, uuid) from public, anon, authenticated;

-- 구매자가 직접 예약
create or replace function private._reserve_match(p_product_id uuid, p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  if not exists (select 1 from public.buyer_requests where id = p_request_id and buyer_id = auth.uid()) then
    raise exception '본인의 구매 요청을 찾을 수 없습니다';
  end if;
  return private.create_match(p_product_id, p_request_id);
end $$;
revoke all on function private._reserve_match(uuid, uuid) from public, anon;
grant execute on function private._reserve_match(uuid, uuid) to authenticated;

-- 판매자가 추천 TOP 3 조회 (보고서 4.1 "매칭점수 순위에 따른 구매자 TOP 3 추천")
create or replace function private._recommend_buyers(p_product_id uuid, p_limit integer default 3)
returns table(request_id uuid, nickname text, meetup_label text, max_budget integer, urgency smallint, quantity integer,
              completed_count integer, closed_count integer, distance_km double precision, overlap_minutes numeric,
              price integer, f_p numeric, f_d numeric, f_t numeric, f_r numeric, f_u numeric, score numeric)
language plpgsql stable security definer set search_path = '' as $$
declare v_product public.products%rowtype;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  select * into v_product from public.products where id = p_product_id and seller_id = auth.uid();
  if not found then raise exception '본인의 판매글을 찾을 수 없습니다'; end if;
  return query
    select r.id, coalesce(pr.nickname, '이웃'), r.meetup_label, r.max_budget, r.urgency, r.quantity,
           e.completed_count, e.closed_count, e.km, e.minutes, e.price, e.f_p, e.f_d, e.f_t, e.f_r, e.f_u, e.score
    from public.buyer_requests r
    cross join lateral private.pair_eval(v_product, r) e
    left join public.profiles pr on pr.id = r.buyer_id
    where r.status = 'open' and r.product_key = v_product.product_key and e.reason is null
      and not exists (select 1 from public.matches m where m.request_id = r.id and m.status = 'reserved')
    order by e.score desc, r.created_at
    limit greatest(1, least(p_limit, 20));
end $$;
revoke all on function private._recommend_buyers(uuid, integer) from public, anon;
grant execute on function private._recommend_buyers(uuid, integer) to authenticated;
create or replace function public.recommend_buyers(p_product_id uuid, p_limit integer default 3)
returns table(request_id uuid, nickname text, meetup_label text, max_budget integer, urgency smallint, quantity integer,
              completed_count integer, closed_count integer, distance_km double precision, overlap_minutes numeric,
              price integer, f_p numeric, f_d numeric, f_t numeric, f_r numeric, f_u numeric, score numeric)
language sql stable security invoker set search_path = '' as $$ select * from private._recommend_buyers(p_product_id, p_limit); $$;
revoke all on function public.recommend_buyers(uuid, integer) from public, anon;
grant execute on function public.recommend_buyers(uuid, integer) to authenticated;

-- 판매자가 추천 구매자 선택 (보고서 4.1 "판매자 선택 및 거래 진행")
create or replace function private._select_buyer(p_product_id uuid, p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  if not exists (select 1 from public.products where id = p_product_id and seller_id = auth.uid()) then
    raise exception '본인의 판매글을 찾을 수 없습니다';
  end if;
  return private.create_match(p_product_id, p_request_id);
end $$;
revoke all on function private._select_buyer(uuid, uuid) from public, anon;
grant execute on function private._select_buyer(uuid, uuid) to authenticated;
create or replace function public.select_buyer(p_product_id uuid, p_request_id uuid)
returns uuid language sql security invoker set search_path = '' as $$ select private._select_buyer(p_product_id, p_request_id); $$;
revoke all on function public.select_buyer(uuid, uuid) from public, anon;
grant execute on function public.select_buyer(uuid, uuid) to authenticated;

-- ---------- 9. 예약 상태 변경: 취소 / 완료 / 노쇼 ----------
create or replace function private._change_match_status(p_match_id uuid, p_action text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_match public.matches%rowtype;
begin
  if v_user is null then raise exception '로그인이 필요합니다'; end if;
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then raise exception '매칭을 찾을 수 없습니다'; end if;
  if v_match.status <> 'reserved' then raise exception '활성 예약이 아닙니다'; end if;
  if p_action = 'cancel' then
    if v_user not in (v_match.buyer_id, v_match.seller_id) then raise exception '예약 취소 권한이 없습니다'; end if;
    update public.matches set status = 'cancelled', cancelled_by = v_user where id = v_match.id;
    update public.products set status = 'active' where id = v_match.product_id and status = 'reserved';
  elsif p_action = 'complete' then
    if v_user <> v_match.seller_id then raise exception '판매자만 거래 완료할 수 있습니다'; end if;
    update public.matches set status = 'completed' where id = v_match.id;
    update public.products set status = 'sold' where id = v_match.product_id;
    update public.buyer_requests set status = 'closed' where id = v_match.request_id;
  elsif p_action = 'no_show' then
    if v_user <> v_match.seller_id then raise exception '판매자만 노쇼를 신고할 수 있습니다'; end if;
    update public.matches set status = 'cancelled', no_show = true, cancelled_by = v_match.buyer_id where id = v_match.id;
    update public.products set status = 'active' where id = v_match.product_id and status = 'reserved';
  else
    raise exception '허용되지 않은 작업입니다';
  end if;
  return v_match.id;
end $$;
revoke all on function private._change_match_status(uuid, text) from public, anon;
grant execute on function private._change_match_status(uuid, text) to authenticated;

commit;
