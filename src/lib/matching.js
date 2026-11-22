// 하나더 매칭 알고리즘 — 프로젝트 보고서 3~7장의 5변수 모델 구현
// ---------------------------------------------------------------
// [4.4 필터링]  아래를 모두 통과한 구매자만 후보
//   상품 일치 · 판매 중(판매기간 내) · 수량 충족 · 현재가 ≤ 예산 · 거래 가능시간이 조금이라도 겹침 · 본인 아님
// [5.2 동적 가격]  P_s(t) = P_min + (P_0 − P_min) × (1 − t / T)
// [6 적합도]  모두 0~1
//   P 가격   = max(0, 1 − 0.5 × P_s / B)
//   D 거리   = max(0, 1 − d / 1.5)
//   T 시간   = min(1, h / 60)                   h = 겹치는 분
//   R 신뢰도 = (완료 + 1) / (종료된 전체 + 2)     종료 = 완료 + 구매자 책임 취소·노쇼
//   U 긴급도 = 긴급도 / 5
// [7.1 최종]  M = 100 × (0.30P + 0.25D + 0.20T + 0.15R + 0.10U)
// [4.1]  판매자에게 매칭점수 상위 3명의 구매자를 추천
// ---------------------------------------------------------------

export const MODEL = {
  weights: { P: 0.30, D: 0.25, T: 0.20, R: 0.15, U: 0.10 },
  maxKm: 1.5,
  fullOverlapMin: 60,
  topN: 3
}

export const FACTORS = ['P', 'D', 'T', 'R', 'U']

// ---------- 구매자 우선순위 → 가중치 ----------
// 보고서 가중치 값(30·25·20·15·10%)은 그대로 두고, 구매자가 정한 1~5순위에 차례대로 배정합니다.
// 예) [D, P, T, R, U] → D 30%, P 25%, T 20%, R 15%, U 10%
// 판매자 TOP 3 와 서버에 저장되는 매칭점수는 공정성을 위해 항상 MODEL(보고서 기본값)을 씁니다.
export const RANK_WEIGHTS = [0.30, 0.25, 0.20, 0.15, 0.10]
export const DEFAULT_PRIORITY = ['P', 'D', 'T', 'R', 'U']

export function isValidPriority(order) {
  return Array.isArray(order) && order.length === FACTORS.length && FACTORS.every(k => order.includes(k))
}

export function weightsFromPriority(order) {
  const valid = isValidPriority(order) ? order : DEFAULT_PRIORITY
  return Object.fromEntries(valid.map((k, i) => [k, RANK_WEIGHTS[i]]))
}

// 구매자 화면용 설정: 요청에 저장된 우선순위가 있으면 그 가중치로
export function buyerConfig(request, cfg = MODEL) {
  return { ...cfg, weights: weightsFromPriority(request?.priority) }
}
export const FACTOR_LABELS = { P: '가격', D: '거리', T: '거래시간', R: '신뢰도', U: '구매 긴급도' }

const clamp = (number, min = 0, max = 1) => Math.min(max, Math.max(min, number))
const ms = value => new Date(value).getTime()

export function distanceKm(aLat, aLng, bLat, bLng) {
  const rad = Math.PI / 180
  const dLat = (bLat - aLat) * rad
  const dLng = (bLng - aLng) * rad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)))
}

// 5.2  t = 등록 후 경과시간, T = 전체 판매 가능시간(등록 ~ 판매 종료)
export function currentPrice(product, now = Date.now()) {
  const start = ms(product.created_at)
  const end = ms(product.expires_at)
  const p0 = Number(product.original_price), pmin = Number(product.min_price)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return p0
  const ratio = clamp((now - start) / Math.max(end - start, 1))
  return Math.round(pmin + (p0 - pmin) * (1 - ratio))
}

// 거래 가능시간이 지금 이후로 겹치는 길이(분)
export function overlapMinutes(aStart, aEnd, bStart, bEnd, now = Date.now()) {
  const start = Math.max(ms(aStart), ms(bStart), now)
  const end = Math.min(ms(aEnd), ms(bEnd))
  return Math.max(0, (end - start) / 60000)
}

export function overlap(aStart, aEnd, bStart, bEnd) {
  return ms(aStart) < ms(bEnd) && ms(bStart) < ms(aEnd)
}

// 6.4  거래 이력이 없으면 (0+1)/(0+2) = 0.5
export function reliability(completed = 0, closed = 0) {
  return (Number(completed) + 1) / (Number(closed) + 2)
}

export function normalizeWeights(weights) {
  const total = Object.values(weights).reduce((sum, w) => sum + Math.max(0, w), 0) || 1
  return Object.fromEntries(Object.entries(weights).map(([k, w]) => [k, Math.max(0, w) / total]))
}

export function scoreFromFactors(values, weights = MODEL.weights) {
  const w = normalizeWeights(weights)
  const raw = 100 * Object.keys(w).reduce((sum, k) => sum + w[k] * (values[k] ?? 0), 0)
  return Math.round(raw * 100) / 100
}

// 4.4  필터 — 통과 못한 이유를 돌려줌 (화면에서 단계별 탈락 수를 보여주기 위해)
export function filterReason(product, request, now = Date.now()) {
  if (product.product_key !== request.product_key) return 'product'
  if (product.status !== 'active' || ms(product.expires_at) <= now) return 'status'
  if (product.seller_id === request.buyer_id) return 'self'
  if (Number(product.quantity ?? 1) < Number(request.quantity ?? 1)) return 'quantity'
  if (currentPrice(product, now) > Number(request.max_budget)) return 'budget'
  if (overlapMinutes(product.available_from, product.available_until, request.available_from, request.available_until, now) <= 0) return 'time'
  return null
}

// 한 (상품, 구매요청) 쌍의 매칭 결과. 필터 탈락이면 null.
export function evaluatePair(product, request, now = Date.now(), cfg = MODEL) {
  if (!product || !request || filterReason(product, request, now)) return null
  const price = currentPrice(product, now)
  const budget = Number(request.max_budget)
  const km = distanceKm(Number(product.latitude), Number(product.longitude), Number(request.latitude), Number(request.longitude))
  const minutes = overlapMinutes(product.available_from, product.available_until, request.available_from, request.available_until, now)
  const factors = {
    P: clamp(1 - 0.5 * price / budget),
    D: clamp(1 - km / cfg.maxKm),
    T: clamp(minutes / cfg.fullOverlapMin),
    R: reliability(request.completed_count, request.closed_count),
    U: clamp(Number(request.urgency) / 5)
  }
  return { price, km, overlapMinutes: minutes, factors, score: scoreFromFactors(factors, cfg.weights) }
}

// 판매자 관점: 한 상품에 대해 구매자 추천 (점수 높은 순)
export function rankBuyers(product, requests, now = Date.now(), cfg = MODEL) {
  return requests
    .map(request => { const r = evaluatePair(product, request, now, cfg); return r && { ...r, request, id: request.id } })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
}

export function topBuyers(product, requests, now = Date.now(), cfg = MODEL) {
  return rankBuyers(product, requests, now, cfg).slice(0, cfg.topN)
}

// 구매자 관점: 내 요청에 맞는 상품 (같은 식, 같은 점수)
export function matchingResult(product, request, currentUserId, now = Date.now(), cfg = MODEL) {
  if (!request || !product || product.seller_id === currentUserId) return null
  const r = evaluatePair(product, { ...request, buyer_id: request.buyer_id ?? currentUserId }, now, cfg)
  return r && { ...product, ...r, timeOverlap: true, feasible: true }
}

export function rankProducts(products, request, currentUserId, now = Date.now(), cfg = MODEL) {
  return products.map(p => matchingResult(p, request, currentUserId, now, cfg)).filter(Boolean).sort((a, b) => b.score - a.score)
}

// 필터 단계별 남은 후보 수 (깔때기)
export function filterFunnel(product, requests, now = Date.now()) {
  const order = ['product', 'status', 'self', 'quantity', 'budget', 'time']
  const reasons = requests.map(r => filterReason(product, r, now))
  const counts = { all: requests.length }
  let remaining = requests.length
  for (const step of order) { remaining -= reasons.filter(x => x === step).length; counts[step] = remaining }
  return counts
}

// ---------- 가중치 검증 도구 ----------

// 유효 가중치: 후보들 사이에서 각 변수가 실제로 만드는 점수 차이(최대−최소)
export function effectiveSpread(results, weights = MODEL.weights) {
  const w = normalizeWeights(weights)
  return Object.fromEntries(Object.keys(w).map(k => {
    const pts = results.map(r => 100 * w[k] * r.factors[k])
    return [k, pts.length ? Math.max(...pts) - Math.min(...pts) : 0]
  }))
}

// 각 변수 "한 단위"가 몇 점인가 → 서로 바꿔 읽을 수 있게
export function unitPoints(weights = MODEL.weights, cfg = MODEL) {
  const w = normalizeWeights(weights)
  return {
    per100m: 100 * w.D * 0.1 / cfg.maxKm,
    per10min: 100 * w.T * Math.min(1, 10 / cfg.fullOverlapMin),
    perUrgencyLevel: 100 * w.U * 0.2,
    newUserVsPerfect5: 100 * w.R * (reliability(5, 5) - reliability(0, 0))
  }
}

export function seededRandom(seed = 42) {
  let s = seed >>> 0
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

export function kendallTau(orderA, orderB) {
  const pos = new Map(orderB.map((id, i) => [id, i]))
  const ids = orderA.filter(id => pos.has(id))
  let c = 0, d = 0
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) (pos.get(ids[i]) < pos.get(ids[j]) ? c++ : d++)
  return c + d ? (c - d) / (c + d) : 1
}

// 민감도: 가중치를 ±jitter 로 흔들었을 때 TOP3 구성과 1위가 유지되는가
export function sensitivity(product, requests, { trials = 300, jitter = 0.3, seed = 7, now = Date.now(), cfg = MODEL } = {}) {
  const base = rankBuyers(product, requests, now, cfg)
  if (base.length < 2) return { candidates: base.length, top1Stability: 1, top3Stability: 1, meanTau: 1, trials: 0 }
  const baseOrder = base.map(r => r.id)
  const baseTop3 = baseOrder.slice(0, cfg.topN).sort().join()
  const rand = seededRandom(seed)
  let top1 = 0, top3 = 0, tau = 0
  for (let t = 0; t < trials; t++) {
    const weights = Object.fromEntries(Object.entries(cfg.weights).map(([k, w]) => [k, w * (1 - jitter + 2 * jitter * rand())]))
    const order = rankBuyers(product, requests, now, { ...cfg, weights }).map(r => r.id)
    if (order[0] === baseOrder[0]) top1++
    if (order.slice(0, cfg.topN).sort().join() === baseTop3) top3++
    tau += kendallTau(baseOrder, order)
  }
  return { candidates: base.length, top1Stability: top1 / trials, top3Stability: top3 / trials, meanTau: tau / trials, trials }
}

export function hoursLeft(date, now = Date.now()) {
  const h = Math.ceil((ms(date) - now) / 3600000)
  if (h <= 0) return '판매 종료'
  if (h < 24) return `${h}시간 남음`
  return `${Math.ceil(h / 24)}일 남음`
}
