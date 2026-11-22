import test from 'node:test'
import assert from 'node:assert/strict'
import { hungarianMax, hungarianMin, compareAssignments } from '../src/lib/assignment.js'
import { seededRandom } from '../src/lib/matching.js'
import { PRESENTATION_PRODUCTS, PRESENTATION_BUYERS } from '../src/data/presentation.js'

const total = (W, pairs) => pairs.reduce((s, [i, j]) => s + W[i][j], 0)

// 가능한 모든 배정을 다 해 보는 정답 (작은 행렬 전용)
function bruteForce(W) {
  const n = W.length, m = W[0].length
  let best = 0
  const used = new Array(m).fill(false)
  const go = (i, acc) => {
    if (i === n) { best = Math.max(best, acc); return }
    go(i + 1, acc) // 구매자 i 를 배정하지 않음
    for (let j = 0; j < m; j++) if (!used[j] && W[i][j] != null) { used[j] = true; go(i + 1, acc + W[i][j]); used[j] = false }
  }
  go(0, 0)
  return best
}

test('교과서 예제(최소비용 3×3)',()=>{
  const cost=[[4,1,3],[2,0,5],[3,2,2]]
  const a=hungarianMin(cost)
  assert.equal(a.reduce((s,j,i)=>s+cost[i][j],0),5)
})

test('탐욕이 틀리는 2×2 예제: 헝가리안은 전체 합을 최대화',()=>{
  // 구매자0: 상품A 80, 상품B 75 / 구매자1: 상품A 78, 상품B 30
  const W=[[80,75],[78,30]]
  const pairs=hungarianMax(W)
  assert.equal(total(W,pairs),153) // 0→B, 1→A
})

test('불가능한 쌍(null)은 배정하지 않는다',()=>{
  const W=[[null,50],[null,40]]
  const pairs=hungarianMax(W)
  assert.equal(pairs.length,1)
  assert.equal(total(W,pairs),50)
})

test('구매자가 상품보다 많아도(행>열) 동작한다',()=>{
  const W=[[10],[30],[20]]
  assert.equal(total(W,hungarianMax(W)),30)
})

test('무작위 행렬 300개에서 완전탐색과 결과가 같다',()=>{
  const rand=seededRandom(123)
  for(let t=0;t<300;t++){
    const n=1+Math.floor(rand()*5), m=1+Math.floor(rand()*5)
    const W=Array.from({length:n},()=>Array.from({length:m},()=>rand()<0.3?null:Math.round(rand()*100)+1))
    const got=total(W,hungarianMax(W))
    assert.equal(got,bruteForce(W),JSON.stringify(W))
  }
})

test('발표 데이터(상품 20·구매자 30): 최적 배정의 점수 합 ≥ 두 탐욕 방식',()=>{
  const [fcfs,best,opt]=compareAssignments(PRESENTATION_PRODUCTS,PRESENTATION_BUYERS)
  assert.ok(opt.totalScore>=fcfs.totalScore)
  assert.ok(opt.totalScore>=best.totalScore)
  assert.ok(opt.totalScore>fcfs.totalScore,'발표 예제는 선착순보다 좋아야 차이를 보여줄 수 있음')
  // 한 구매요청도 한 상품에만
  assert.equal(new Set(opt.pairs.map(p=>p.request.id)).size,opt.pairs.length)
  // 한 상품은 한 명에게만
  assert.equal(new Set(opt.pairs.map(p=>p.product.id)).size,opt.pairs.length)
})
