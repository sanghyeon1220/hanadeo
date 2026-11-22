-- 하나더 마이그레이션 2026-11-22 (b) — 판매자 평점
-- 구매자가 거래 완료 후 판매자에게 별점(1~5)을 남기고,
-- 구매자 화면의 매칭점수에서 R(신뢰도) 대신 판매자 평점을 사용합니다.
--
-- 먼저 20261122_five_factor_model.sql 이 적용되어 있어야 합니다.
-- SQL Editor 에서 이 파일 하나만 실행하세요. 여러 번 실행해도 안전합니다.

begin;

-- ---------- 1. 평가 테이블 ----------
create table if not exists public.seller_reviews (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null unique references public.matches(id) on delete cascade,  -- 거래 한 건당 한 번
  seller_id uuid not null references auth.users(id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now()
);
create index if not exists seller_reviews_seller_idx on public.seller_reviews(seller_id);

alter table public.seller_reviews enable row level security;
-- 본인이 남긴 평가만 직접 조회 가능. 다른 사람의 평점은 아래 집계 함수로만(평균·개수) 공개.
drop policy if exists "seller_reviews_own_select" on public.seller_reviews;
create policy "seller_reviews_own_select" on public.seller_reviews for select to authenticated
  using (buyer_id = (select auth.uid()));
revoke all on public.seller_reviews from anon, authenticated;
grant select on public.seller_reviews to authenticated;
-- 직접 insert/update 는 막고, 아래 RPC 로만 작성

-- ---------- 2. 평가 남기기 (구매자, 완료된 거래만, 한 번만) ----------
create or replace function private._rate_seller(p_match_id uuid, p_rating integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_match public.matches%rowtype; v_id uuid;
begin
  if v_user is null then raise exception '로그인이 필요합니다'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception '별점은 1~5점이어야 합니다'; end if;
  select * into v_match from public.matches where id = p_match_id;
  if not found then raise exception '거래를 찾을 수 없습니다'; end if;
  if v_match.buyer_id <> v_user then raise exception '구매자만 판매자를 평가할 수 있습니다'; end if;
  if v_match.status <> 'completed' then raise exception '거래가 완료된 뒤에 평가할 수 있습니다'; end if;
  if exists (select 1 from public.seller_reviews where match_id = p_match_id) then
    raise exception '이미 평가한 거래입니다';
  end if;
  insert into public.seller_reviews(match_id, seller_id, buyer_id, rating)
  values (v_match.id, v_match.seller_id, v_user, p_rating)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function private._rate_seller(uuid, integer) from public, anon;
grant execute on function private._rate_seller(uuid, integer) to authenticated;
create or replace function public.rate_seller(p_match_id uuid, p_rating integer)
returns uuid language sql security invoker set search_path = '' as $$ select private._rate_seller(p_match_id, p_rating); $$;
revoke all on function public.rate_seller(uuid, integer) from public, anon;
grant execute on function public.rate_seller(uuid, integer) to authenticated;

-- ---------- 3. 판매자 평점 조회 (평균·개수만 공개) ----------
create or replace function private._get_seller_ratings(p_sellers uuid[])
returns table(seller_id uuid, rating_avg numeric, rating_count integer)
language sql stable security definer set search_path = '' as $$
  select r.seller_id, round(avg(r.rating)::numeric, 2), count(*)::integer
  from public.seller_reviews r
  where r.seller_id = any(p_sellers)
  group by r.seller_id;
$$;
revoke all on function private._get_seller_ratings(uuid[]) from public, anon;
grant execute on function private._get_seller_ratings(uuid[]) to authenticated;
create or replace function public.get_seller_ratings(p_sellers uuid[])
returns table(seller_id uuid, rating_avg numeric, rating_count integer)
language sql stable security invoker set search_path = '' as $$ select * from private._get_seller_ratings(p_sellers); $$;
revoke all on function public.get_seller_ratings(uuid[]) from public, anon;
grant execute on function public.get_seller_ratings(uuid[]) to authenticated;

commit;
