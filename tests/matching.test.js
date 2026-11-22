import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MODEL, currentPrice, distanceKm, overlapMinutes, reliability, scoreFromFactors, evaluatePair,
  filterReason, rankBuyers, topBuyers, filterFunnel, matchingResult, effectiveSpread, kendallTau, sensitivity
} from '../src/lib/matching.js'

const H = 3600000
const t0 = new Date('2026-11-20T09:00:00Z').getTime()
const iso = h => new Date(t0 + h * H).toISOString()

// 보고서 5.3 예시 상품: 최초 4,000원, 최저 2,000원, 판매 가능시간 72시간
const product = { id:'p1', seller_id:'seller', product_key:'banana', status:'active', quantity:1,
  original_price:4000, min_price:2000, created_at:iso(0), expires_at:iso(72),
  available_from:iso(0), available_until:iso(72), latitude:37.4486, longitude:126.6530 }
const buyer = { id:'r1', buyer_id:'b1', product_key:'banana', max_budget:4000, urgency:4, quantity:1,
  completed_count:0, closed_count:0, available_from:iso(0), available_until:iso(72), latitude:37.4486, longitude:126.6530 }

test('5.3 동적 가격 표: 0h 4,000 / 24h 3,333 / 48h 2,667 / 72h 2,000',()=>{
  assert.equal(currentPrice(product,t0),4000)
  assert.equal(currentPrice(product,t0+24*H),3333)
  assert.equal(currentPrice(product,t0+48*H),2667)
  assert.equal(currentPrice(product,t0+72*H),2000)
  assert.equal(currentPrice(product,t0+100*H),2000) // 최저가 아래로 내려가지 않음
})

test('6.1 가격 적합도 P = 1 − 0.5·Ps/B',()=>{
  const at24=evaluatePair(product,buyer,t0+24*H)       // Ps 3333, B 4000
  assert.ok(Math.abs(at24.factors.P-(1-0.5*3333/4000))<1e-9)
  const equal=evaluatePair(product,{...buyer,max_budget:4000},t0) // Ps = B
  assert.equal(equal.factors.P,0.5)
})

test('6.2 거리 적합도: 0km 1점, 0.75km 0.5점, 1.5km 이상 0점',()=>{
  const lat075=37.4486+0.75/111.195 // 위도 1도 ≈ 111.195km
  const r=evaluatePair(product,{...buyer,latitude:lat075},t0)
  assert.ok(Math.abs(r.factors.D-0.5)<0.002)
  assert.equal(evaluatePair(product,buyer,t0).factors.D,1)
  assert.equal(evaluatePair(product,{...buyer,latitude:37.4486+2/111.195},t0).factors.D,0)
})

test('6.3 거래시간 적합도: 30분 겹침 0.5, 60분 이상 1, 안 겹치면 후보 제외',()=>{
  assert.equal(evaluatePair(product,{...buyer,available_from:iso(1),available_until:iso(1.5)},t0).factors.T,0.5)
  assert.equal(evaluatePair(product,{...buyer,available_from:iso(1),available_until:iso(3)},t0).factors.T,1)
  assert.equal(evaluatePair(product,{...buyer,available_from:iso(80),available_until:iso(90)},t0),null)
  assert.equal(overlapMinutes(iso(0),iso(2),iso(1),iso(5),t0),60)
})

test('6.4 신뢰도: 신규 0.5, 완료 6/종료 6 → 0.875, 완료 2/종료 5 → 0.429',()=>{
  assert.equal(reliability(0,0),0.5)
  assert.equal(reliability(6,6),7/8)
  assert.ok(Math.abs(reliability(2,5)-3/7)<1e-12)
})

test('6.5 긴급도: 1→0.2, 3→0.6, 5→1.0',()=>{
  for(const [u,v] of [[1,0.2],[3,0.6],[5,1]]) assert.ok(Math.abs(evaluatePair(product,{...buyer,urgency:u},t0).factors.U-v)<1e-12)
})

test('7.2 계산 예시: P .75 D .80 T 1 R .60 U .80 → 79.5점',()=>{
  assert.equal(scoreFromFactors({P:0.75,D:0.80,T:1,R:0.60,U:0.80}),79.5)
})

test('가중치는 보고서 표와 같고 합이 1',()=>{
  assert.deepEqual(MODEL.weights,{P:0.30,D:0.25,T:0.20,R:0.15,U:0.10})
  assert.ok(Math.abs(Object.values(MODEL.weights).reduce((a,b)=>a+b)-1)<1e-12)
})

test('4.4 필터: 상품·판매상태·본인·수량·예산·시간',()=>{
  assert.equal(filterReason(product,buyer,t0),null)
  assert.equal(filterReason(product,{...buyer,product_key:'milk_1l'},t0),'product')
  assert.equal(filterReason({...product,status:'reserved'},buyer,t0),'status')
  assert.equal(filterReason(product,buyer,t0+73*H),'status')
  assert.equal(filterReason(product,{...buyer,buyer_id:'seller'},t0),'self')
  assert.equal(filterReason(product,{...buyer,quantity:2},t0),'quantity')
  assert.equal(filterReason(product,{...buyer,max_budget:3000},t0),'budget')
  assert.equal(filterReason(product,{...buyer,max_budget:3000},t0+48*H),null) // 가격이 내려가면 후보가 됨
  assert.equal(filterReason(product,{...buyer,available_from:iso(80),available_until:iso(90)},t0),'time')
})

test('판매자 추천: 신뢰도·긴급도가 다르면 순위가 바뀐다',()=>{
  const a={...buyer,id:'a',buyer_id:'a',urgency:1,completed_count:0,closed_count:4}
  const b={...buyer,id:'b',buyer_id:'b',urgency:5,completed_count:5,closed_count:5}
  const rows=rankBuyers(product,[a,b],t0)
  assert.equal(rows[0].id,'b')
})

test('TOP 3 만 추천하고 점수 내림차순',()=>{
  const reqs=[0,0.2,0.4,0.6,0.8].map((km,i)=>({...buyer,id:'r'+i,buyer_id:'b'+i,latitude:37.4486+km/111.195}))
  const top=topBuyers(product,reqs,t0)
  assert.equal(top.length,3)
  assert.deepEqual(top.map(r=>r.id),['r0','r1','r2'])
})

test('필터 깔때기 수',()=>{
  const reqs=[buyer,{...buyer,id:'x',product_key:'milk_1l'},{...buyer,id:'y',max_budget:1000},{...buyer,id:'z',quantity:3}]
  const f=filterFunnel(product,reqs,t0)
  assert.equal(f.all,4); assert.equal(f.product,3); assert.equal(f.quantity,2); assert.equal(f.budget,1); assert.equal(f.time,1)
})

test('구매자 관점 결과도 같은 점수',()=>{
  const seller=evaluatePair(product,buyer,t0+10*H).score
  const buyerView=matchingResult(product,buyer,'b1',t0+10*H).score
  assert.equal(seller,buyerView)
})

test('유효 가중치: 거리만 다르면 거리 외 변수의 차이는 0',()=>{
  const rows=rankBuyers(product,[buyer,{...buyer,id:'far',buyer_id:'far',latitude:37.4486+0.9/111.195}],t0)
  const s=effectiveSpread(rows)
  assert.ok(s.D>14 && s.P===0 && s.T===0 && s.R===0 && s.U===0)
})

test('켄달 타우',()=>{
  assert.equal(kendallTau(['a','b','c'],['a','b','c']),1)
  assert.equal(kendallTau(['a','b','c'],['c','b','a']),-1)
})

test('민감도: 압도적 1위는 유지',()=>{
  const far={...buyer,id:'far',buyer_id:'far',latitude:37.4486+1.2/111.195}
  assert.equal(sensitivity(product,[buyer,far],{now:t0}).top1Stability,1)
})

import { weightsFromPriority, isValidPriority, buyerConfig, rankProducts, DEFAULT_PRIORITY } from '../src/lib/matching.js'

test('우선순위 기본값은 보고서 가중치와 같다',()=>{
  assert.deepEqual(weightsFromPriority(DEFAULT_PRIORITY),MODEL.weights)
})

test('우선순위 재배치: [D,P,T,R,U] → D 30%, P 25%',()=>{
  const w=weightsFromPriority(['D','P','T','R','U'])
  assert.equal(w.D,0.30); assert.equal(w.P,0.25); assert.equal(w.U,0.10)
  assert.ok(Math.abs(Object.values(w).reduce((a,b)=>a+b)-1)<1e-12)
})

test('잘못된 우선순위(중복·누락)는 기본값으로',()=>{
  assert.equal(isValidPriority(['P','P','T','R','U']),false)
  assert.equal(isValidPriority(['P','D','T','R']),false)
  assert.deepEqual(weightsFromPriority(['P','P','T','R','U']),MODEL.weights)
})

test('구매자 우선순위가 상품 순위를 바꾼다 (가까운 비싼 상품 vs 먼 싼 상품)',()=>{
  const now=t0+10*H
  const near={...product,id:'near',original_price:4000,min_price:3800}
  const far={...product,id:'far',original_price:2000,min_price:1500,latitude:37.4486+0.6/111.195}
  const priceFirst={...buyer,priority:['P','T','R','U','D']}
  const distFirst={...buyer,priority:['D','P','T','R','U']}
  assert.equal(rankProducts([near,far],priceFirst,'b1',now,buyerConfig(priceFirst))[0].id,'far')
  assert.equal(rankProducts([near,far],distFirst,'b1',now,buyerConfig(distFirst))[0].id,'near')
})

test('판매자 TOP 3 는 구매자가 우선순위를 바꿔도 같은 점수(부풀리기 방지)',()=>{
  const a=rankBuyers(product,[{...buyer,priority:['U','R','T','D','P']}],t0)[0].score
  const b=rankBuyers(product,[buyer],t0)[0].score
  assert.equal(a,b)
})
