import test from 'node:test'
import assert from 'node:assert/strict'
import { PRESENTATION_PRODUCTS as P, PRESENTATION_BUYERS as B, PRESENTATION_SCENARIOS as S } from '../src/data/presentation.js'
import { currentPrice, topBuyers, rankBuyers } from '../src/lib/matching.js'
import { MEETUP_SPOTS } from '../src/data/catalog.js'

test('보고서 8.1: 가상 상품 20개, 가상 구매자 30명, 판매자는 모두 다름',()=>{
  assert.equal(P.length,20); assert.equal(B.length,30)
  assert.equal(new Set(P.map(p=>p.seller_id)).size,20)
})

test('거래 장소는 인하대 정문·후문·기숙사·학생회관',()=>{
  assert.deepEqual(MEETUP_SPOTS.map(s=>s.label),['인하대 정문','인하대 후문','인하대 기숙사','인하대 학생회관'])
  for(const p of P) assert.ok(MEETUP_SPOTS.some(s=>s.label===p.meetup_label))
})

test('시나리오 1 상품은 보고서 5.3 예시(4,000→2,000원, 72시간, 24시간 경과 → 약 3,333원)',()=>{
  const p=P.find(x=>x.id===S[0].id)
  assert.equal(p.original_price,4000); assert.equal(p.min_price,2000)
  assert.equal(Math.round((new Date(p.expires_at)-new Date(p.created_at))/3600000),72)
  assert.ok(Math.abs(currentPrice(p)-3333)<=2)
})

test('모든 시나리오에 추천 구매자가 2명 이상, TOP 3는 점수순',()=>{
  for(const s of S){
    const p=P.find(x=>x.id===s.id)
    const top=topBuyers(p,B)
    assert.ok(top.length>=2,s.label)
    assert.ok(top.length<=3)
    assert.deepEqual(top.map(t=>t.score),[...top.map(t=>t.score)].sort((a,b)=>b-a))
  }
})

test('시나리오 1: 예산·수량·시간 필터로 일부 구매자가 탈락한다',()=>{
  const p=P.find(x=>x.id===S[0].id)
  const same=B.filter(b=>b.product_key===p.product_key)
  assert.ok(rankBuyers(p,B).length<same.length)
})
