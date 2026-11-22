// 다대다 할당 (Assignment Problem) — 보고서 모델의 확장
// ---------------------------------------------------------------
// 판매자마다 TOP 3를 따로 추천하면 같은 구매자가 여러 상품의 1위가 될 수 있고,
// 먼저 선택한 판매자가 그 구매자를 가져가면 다른 상품은 차선책만 남습니다.
// 전체 판매글 j 와 구매요청 i 를 1:1 로 짝지어 매칭점수 합을 최대로 만드는 문제:
//   최대화  Σ_i Σ_j  M_ij · x_ij
//   조건    Σ_j x_ij ≤ 1 (구매요청 하나는 상품 하나)  /  Σ_i x_ij ≤ 1 (상품 하나는 구매자 한 명)
//           필터(4.4)를 통과하지 못한 쌍은 x_ij = 0
// 헝가리안 알고리즘: O(n²·m). 최소비용 버전을 쓰기 위해 cost = BIG − M 으로 바꿉니다.
// ---------------------------------------------------------------
import { evaluatePair } from './matching.js'

// 최소비용 헝가리안 알고리즘 (행 수 n ≤ 열 수 m). 반환: rowToCol[i] = 배정된 열
export function hungarianMin(cost) {
  const n = cost.length
  const m = n ? cost[0].length : 0
  if (n === 0) return []
  if (n > m) throw new Error('행 수는 열 수 이하여야 합니다')
  const INF = Number.POSITIVE_INFINITY
  // 1-based 인덱스: u, v 는 잠재값(potential), p[j] = 열 j 에 배정된 행
  const u = new Array(n + 1).fill(0)
  const v = new Array(m + 1).fill(0)
  const p = new Array(m + 1).fill(0)
  const way = new Array(m + 1).fill(0)
  for (let i = 1; i <= n; i++) {
    p[0] = i
    let j0 = 0
    const minv = new Array(m + 1).fill(INF)
    const used = new Array(m + 1).fill(false)
    do {
      used[j0] = true
      const i0 = p[j0]
      let delta = INF, j1 = 0
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j]
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0 }
        if (minv[j] < delta) { delta = minv[j]; j1 = j }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta } else minv[j] -= delta
      }
      j0 = j1
    } while (p[j0] !== 0)
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1 } while (j0)
  }
  const rowToCol = new Array(n).fill(-1)
  for (let j = 1; j <= m; j++) if (p[j]) rowToCol[p[j] - 1] = j - 1
  return rowToCol
}

// weights[i][j] = 효용(양수) 또는 null(불가능). 최대 가중치 매칭을 반환.
export function hungarianMax(weights) {
  const n = weights.length
  const m = n ? weights[0].length : 0
  if (!n || !m) return []
  const transpose = n > m
  const W = transpose ? Array.from({ length: m }, (_, j) => Array.from({ length: n }, (_, i) => weights[i][j])) : weights
  let max = 0
  for (const row of W) for (const w of row) if (w != null && w > max) max = w
  const BIG = max + 1
  // 불가능한 쌍은 비용 BIG(효용 0과 같음) → 배정돼도 나중에 버림
  const cost = W.map(row => row.map(w => (w == null ? BIG : BIG - w)))
  const rowToCol = hungarianMin(cost)
  const pairs = []
  rowToCol.forEach((j, i) => {
    if (j < 0) return
    const [bi, pj] = transpose ? [j, i] : [i, j]
    if (weights[bi][pj] != null) pairs.push([bi, pj])
  })
  return pairs
}

// 구매요청 × 상품 매칭점수 행렬 (필터 탈락 = null)
export function buildMatrix(products, requests, { now = Date.now(), cfg } = {}) {
  const detail = requests.map(req => products.map(prod => evaluatePair(prod, req, now, cfg)))
  const weights = detail.map(row => row.map(c => (c ? c.score : null)))
  return { weights, detail }
}

function summarize(method, pairs, products, requests, detail) {
  const rows = pairs.map(([i, j]) => ({
    request: requests[i], product: products[j],
    score: detail[i][j].score, price: detail[i][j].price, km: detail[i][j].km
  }))
  const matchedIdx = new Set(pairs.map(([i]) => i))
  return {
    method,
    pairs: rows,
    matched: rows.length,
    unmatched: requests.filter((_, i) => !matchedIdx.has(i)),
    totalScore: Math.round(rows.reduce((s, r) => s + r.score, 0) * 100) / 100,
    urgentServed: rows.filter(r => Number(r.request.urgency) >= 4).length
  }
}

// ① 선착순: 먼저 요청한 구매자부터 남은 상품 중 자기에게 최고 점수인 상품을 가져감
export function greedyFirstCome(products, requests, opts = {}) {
  const { detail } = buildMatrix(products, requests, opts)
  const order = requests.map((r, i) => i).sort((a, b) => new Date(requests[a].created_at) - new Date(requests[b].created_at))
  const taken = new Set()
  const pairs = []
  for (const i of order) {
    let best = -1
    detail[i].forEach((c, j) => { if (c && !taken.has(j) && (best < 0 || c.score > detail[i][best].score)) best = j })
    if (best >= 0) { taken.add(best); pairs.push([i, best]) }
  }
  return summarize('선착순 탐욕', pairs, products, requests, detail)
}

// ② 전체 쌍을 점수 높은 순으로 정렬해 차례로 확정 (흔한 근사 방법)
export function greedyBestPair(products, requests, opts = {}) {
  const { weights, detail } = buildMatrix(products, requests, opts)
  const all = []
  weights.forEach((row, i) => row.forEach((w, j) => { if (w != null) all.push([w, i, j]) }))
  all.sort((a, b) => b[0] - a[0])
  const usedB = new Set(), usedP = new Set(), pairs = []
  for (const [, i, j] of all) if (!usedB.has(i) && !usedP.has(j)) { usedB.add(i); usedP.add(j); pairs.push([i, j]) }
  return summarize('최고점 쌍 우선 탐욕', pairs, products, requests, detail)
}

// ③ 최적: 헝가리안 알고리즘
export function optimalAssignment(products, requests, opts = {}) {
  const { weights, detail } = buildMatrix(products, requests, opts)
  return summarize('헝가리안 최적', hungarianMax(weights), products, requests, detail)
}

export function compareAssignments(products, requests, opts = {}) {
  return [greedyFirstCome(products, requests, opts), greedyBestPair(products, requests, opts), optimalAssignment(products, requests, opts)]
}
