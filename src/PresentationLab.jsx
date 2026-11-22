import { useMemo, useState } from 'react'
import { CheckCircle2, Clock3, RotateCcw, Scale, Sparkles, Users, TrendingDown, Filter } from 'lucide-react'
import { findItem, KRW } from './data/catalog'
import { PRESENTATION_BUYERS, PRESENTATION_SCENARIOS } from './data/presentation'
import {
  MODEL, FACTORS, FACTOR_LABELS, currentPrice, rankBuyers, filterFunnel, filterReason,
  effectiveSpread, unitPoints, sensitivity, normalizeWeights, reliability
} from './lib/matching'
import { compareAssignments } from './lib/assignment'
import PriorityPicker from './PriorityPicker'
import { buyerConfig, rankProducts, DEFAULT_PRIORITY } from './lib/matching'

const H = 3600000
const pct = v => `${Math.round(v * 100)}%`
const REASON = { product: '희망상품 불일치', status: '판매 종료', self: '본인', quantity: '수량 부족', budget: '예산 초과', time: '거래시간 안 겹침' }

export default function PresentationLab({ products, onReset }) {
  const [productId, setProductId] = useState(PRESENTATION_SCENARIOS[0].id)
  const product = products.find(p => p.id === productId) ?? products[0]
  const created = new Date(product.created_at).getTime()
  const saleHours = Math.round((new Date(product.expires_at).getTime() - created) / H)
  const actualElapsed = Math.min(saleHours - 1, Math.max(0, Math.round((Date.now() - created) / H)))
  const [elapsedById, setElapsedById] = useState({})
  const elapsed = elapsedById[product.id] ?? actualElapsed
  const simNow = created + elapsed * H
  const [rawWeights, setRawWeights] = useState(MODEL.weights)
  const [showAll, setShowAll] = useState(false)
  const [buyerId, setBuyerId] = useState('presentation-r01')
  const [buyerPriority, setBuyerPriority] = useState(['P', 'T', 'R', 'U', 'D'])

  const weights = normalizeWeights(rawWeights)
  const wKey = JSON.stringify(weights)
  const cfg = useMemo(() => ({ ...MODEL, weights }), [wKey])
  const ranked = useMemo(() => rankBuyers(product, PRESENTATION_BUYERS, simNow, cfg), [product, simNow, cfg])
  const top = ranked.slice(0, MODEL.topN)
  const funnel = filterFunnel(product, PRESENTATION_BUYERS, simNow)
  const spread = effectiveSpread(ranked, weights)
  const units = unitPoints(weights)
  const sens = useMemo(() => sensitivity(product, PRESENTATION_BUYERS, { now: simNow, cfg }), [product, simNow, cfg])
  const assignments = useMemo(() => compareAssignments(products, PRESENTATION_BUYERS, { cfg }), [products, cfg])
  const price = currentPrice(product, simNow)
  const priceRows = [0, 1 / 3, 2 / 3, 1].map(f => Math.round(saleHours * f))
  const resultById = new Map(ranked.map(r => [r.id, r]))
  const demoBuyer = PRESENTATION_BUYERS.find(b => b.id === buyerId)
  const baseList = rankProducts(products, demoBuyer, demoBuyer.buyer_id, Date.now(), buyerConfig({ priority: DEFAULT_PRIORITY }))
  const myList = rankProducts(products, demoBuyer, demoBuyer.buyer_id, Date.now(), buyerConfig({ priority: buyerPriority }))

  return <section className="container presentation-section">
    <div className="presentation-heading">
      <div>
        <span className="pill"><Sparkles size={14}/> 발표 전용 실습실</span>
        <h1>판매자에게 <span>구매자 TOP 3</span> 추천</h1>
        <p>보고서 4장 흐름 그대로: 판매자·구매자 정보 → 필터링 → 동적 가격 → 5가지 적합도 → 가중합 → TOP 3 추천. 가상 상품 20개, 가상 구매자 30명, 인하대 정문·후문·기숙사·학생회관.</p>
      </div>
      <button className="button outline" onClick={onReset}><RotateCcw size={15}/> 시연 데이터 초기화</button>
    </div>
    <div className="presentation-notice"><CheckCircle2 size={17}/><div>시연용 가상 데이터입니다. 실제 데이터베이스는 바꾸지 않으며, 계산은 앱이 실제로 쓰는 함수(<code>src/lib/matching.js</code>)를 그대로 사용합니다.</div></div>

    <div className="presentation-layout">
      <div className="presentation-controls">
        <h2><Filter size={19}/> 판매 상품 선택</h2>
        <div className="presentation-presets">
          {PRESENTATION_SCENARIOS.map(s => <button key={s.id} className={s.id === productId ? 'selected' : ''} onClick={() => setProductId(s.id)}>{s.label}</button>)}
        </div>
        <label className="presentation-field">전체 판매글 20개<select value={productId} onChange={e => setProductId(e.target.value)}>{products.map(p => <option key={p.id} value={p.id}>판매자 {p.demo_seller} · {p.title} · {p.meetup_label}</option>)}</select></label>
        <div className="seller-card">
          <div><span>최초 / 최저 가격</span><b>{KRW(product.original_price)} / {KRW(product.min_price)}</b></div>
          <div><span>판매 가능시간 T</span><b>{saleHours}시간</b></div>
          <div><span>수량 · 거래 방식</span><b>{product.quantity ?? 1}개 · {product.trade_method}</b></div>
          <div><span>상태</span><b>{product.condition}</b></div>
          <div><span>거래 장소</span><b>{product.meetup_label}</b></div>
        </div>

        <h2 className="weights-title"><Clock3 size={18}/> 경과시간 t (보고서 8.3 실험)</h2>
        <label className="weight-slider"><span>등록 후 <b>{elapsed}시간</b> · 남은 {saleHours - elapsed}시간</span>
          <input type="range" min="0" max={saleHours - 1} step="1" value={Math.min(elapsed, saleHours - 1)} onChange={e => setElapsedById(m => ({ ...m, [product.id]: Number(e.target.value) }))}/></label>
        <button className="text-button" onClick={() => setElapsedById(m => ({ ...m, [product.id]: actualElapsed }))}>지금 시각으로 되돌리기</button>
        <table className="price-table"><thead><tr><th>경과시간</th><th>현재 판매가격</th></tr></thead><tbody>
          {priceRows.map(h => <tr key={h} className={h === elapsed ? 'on' : ''}><td>{h}시간</td><td>{KRW(currentPrice(product, created + h * H))}</td></tr>)}
        </tbody></table>
        <p className="presentation-helper">P<sub>s</sub>(t) = P<sub>min</sub> + (P<sub>0</sub> − P<sub>min</sub>)(1 − t/T). t = T(판매 종료)가 되면 거래 불가 상태로 바뀌므로 슬라이더는 T − 1시간까지입니다. 시간이 지나 가격이 내려가면 예산 때문에 빠졌던 구매자가 후보로 들어오고 P가 올라갑니다. 대신 거래시간이 지나간 구매자는 빠질 수 있습니다.</p>

        <h2 className="weights-title"><Scale size={18}/> 가중치 (보고서 6장 · 가정값)</h2>
        {FACTORS.map(k => <label className="weight-slider" key={k}>
          <span>{FACTOR_LABELS[k]} {k} <b>{pct(weights[k])}</b></span>
          <input type="range" min="0" max="0.6" step="0.05" value={rawWeights[k]} onChange={e => setRawWeights(w => ({ ...w, [k]: Number(e.target.value) }))}/>
        </label>)}
        <button className="text-button" onClick={() => setRawWeights(MODEL.weights)}>보고서 값(30/25/20/15/10)으로 되돌리기</button>
      </div>

      <div className="presentation-results">
        <h2>매칭 처리 과정</h2>
        <div className="presentation-steps">
          <div><b>{funnel.all}명</b><span>전체 구매자</span></div><i>→</i>
          <div><b>{funnel.product}명</b><span>희망상품 일치</span></div><i>→</i>
          <div><b>{funnel.quantity}명</b><span>수량 충족</span></div><i>→</i>
          <div><b>{funnel.budget}명</b><span>예산 ≥ {KRW(price)}</span></div><i>→</i>
          <div><b>{funnel.time}명</b><span>거래시간 겹침</span></div><i>→</i>
          <div><b>TOP {Math.min(3, ranked.length)}</b><span>추천</span></div>
        </div>
        <div className="presentation-formula">M = 100 × ( <strong>{FACTORS.map(k => `${weights[k].toFixed(2)}${k}`).join(' + ')}</strong> )
          <small>P = max(0, 1 − 0.5·P<sub>s</sub>/B) · D = max(0, 1 − d/1.5km) · T = min(1, 겹친 분/60) · R = (완료+1)/(종료 전체+2) · U = 긴급도/5</small></div>

        {ranked.length === 0 ? <div className="presentation-empty">조건을 모두 만족하는 구매자가 없어요. 경과시간을 바꿔 보세요.</div> : <div className="presentation-ranked">
          {ranked.map((r, i) => <article className={`presentation-result ${i < 3 ? 'first' : 'rest'}`} key={r.id}>
            <div className="presentation-result-head">
              <span className="presentation-rank">{i < 3 ? `추천 ${i + 1}위` : `${i + 1}위`}</span>
              <div className="presentation-result-name"><strong>{r.request.demo_buyer} · 예산 {KRW(r.request.max_budget)} · 긴급도 {r.request.urgency}</strong>
                <span>{r.request.meetup_label}에서 약 {r.km.toFixed(2)}km · 시간 {Math.round(r.overlapMinutes) >= 600 ? '10시간 이상' : `${Math.round(r.overlapMinutes)}분`} 겹침 · 거래 {r.request.completed_count}완료/{r.request.closed_count}종료</span></div>
              <div className="presentation-result-score"><b>{r.score.toFixed(1)}</b><small>/ 100점</small></div>
            </div>
            <div className="presentation-bars five">{FACTORS.map(k => <div className="presentation-bar-cell" key={k}>
              <div><span>{FACTOR_LABELS[k]} {r.factors[k].toFixed(2)}</span><b>{(100 * weights[k] * r.factors[k]).toFixed(1)}</b></div>
              <div className="presentation-bar-track"><span style={{ width: `${r.factors[k] * 100}%` }}/></div>
            </div>)}</div>
          </article>)}
        </div>}

        <div className="validation-grid">
          <div className="validation-card">
            <h3>이름상 가중치 vs 실제 영향 (후보 간 점수 차이)</h3>
            {FACTORS.map(k => <div className="validation-row" key={k}>
              <span>{FACTOR_LABELS[k]}</span>
              <div className="presentation-bar-track"><span style={{ width: `${Math.min(100, spread[k] / 30 * 100)}%` }}/></div>
              <b>{spread[k].toFixed(1)}점</b><small>/ {Math.round(weights[k] * 100)}</small>
            </div>)}
            <p>가중치가 커도 후보끼리 값이 비슷하면 순위에 영향이 작습니다. 예) P는 1 − 0.5·P<sub>s</sub>/B 라서 항상 0.5~1 사이입니다.</p>
          </div>
          <div className="validation-card">
            <h3>한 단위는 몇 점인가</h3>
            <p className="tradeoff">거리 100m = <b>{units.per100m.toFixed(1)}점</b> · 긴급도 1단계 = <b>{units.perUrgencyLevel.toFixed(1)}점</b></p>
            <p className="tradeoff">겹치는 시간 10분(60분까지) = <b>{units.per10min.toFixed(1)}점</b></p>
            <p className="tradeoff">신규(0.5) vs 5전 5승({reliability(5, 5).toFixed(2)}) = <b>{units.newUserVsPerfect5.toFixed(1)}점</b></p>
            <h3>민감도 (가중치 ±30% 무작위 {sens.trials}회)</h3>
            <p className="tradeoff">1위 유지 <b>{pct(sens.top1Stability)}</b> · TOP 3 구성 유지 <b>{pct(sens.top3Stability)}</b> · 켄달 τ <b>{sens.meanTau.toFixed(2)}</b></p>
            <p>{sens.top1Stability < 0.8 ? '⚠️ 1·2위 차이가 작아 가중치 가정에 따라 추천이 바뀔 수 있습니다.' : '가중치를 어느 정도 바꿔도 추천이 유지됩니다.'}</p>
          </div>
        </div>
      </div>
    </div>

    <div className="presentation-inventory assignment-panel">
      <h2><Users size={19}/> 확장: 여러 판매글을 동시에 배정하면? (할당 문제)</h2>
      <p className="presentation-helper">판매자마다 TOP 3를 따로 보면 같은 구매자가 여러 상품의 1위가 될 수 있습니다. 판매글 20개와 구매요청 30개를 1:1로 짝지어 매칭점수 합을 비교합니다.</p>
      <div className="assignment-grid">
        {assignments.map(a => <div className={`assignment-card ${a.method.includes('헝가리안') ? 'best' : ''}`} key={a.method}>
          <h3>{a.method}</h3>
          <p className="assignment-total">점수 합 <b>{a.totalScore.toFixed(1)}</b> <small>· {a.matched}건 성사</small></p>
          <p className="assignment-miss">배정 못 받은 구매자 {a.unmatched.length}명</p>
        </div>)}
      </div>
      <p className="presentation-helper">헝가리안 알고리즘은 가능한 모든 배정 중 점수 합이 가장 큰 배정을 보장합니다(무작위 300개 사례에서 완전탐색과 같은 답). 보고서 범위 밖의 확장이며, 실제 서비스는 아직 판매자가 TOP 3 중에서 직접 고르는 방식입니다.</p>
    </div>


    <div className="presentation-inventory assignment-panel">
      <h2><Scale size={19}/> 구매자 우선순위 체험</h2>
      <p className="presentation-helper">구매자가 무엇을 더 중요하게 보는지 순서를 정하면 보고서 가중치(30·25·20·15·10%)가 그 순서대로 배정되고, <b>구매자가 보는 상품 추천 순서</b>가 바뀝니다. 판매자의 TOP 3와 저장되는 매칭점수는 공정성을 위해 기본 가중치로 계산합니다(자기에게 유리한 항목을 올려 점수를 부풀리는 것 방지).</p>
      <div className="buyer-priority-lab">
        <div>
          <label className="presentation-field">가상 구매자<select value={buyerId} onChange={e => setBuyerId(e.target.value)}>{PRESENTATION_BUYERS.map(b => <option key={b.id} value={b.id}>{b.demo_buyer} · {findItem(b.product_key).name} · 예산 {KRW(b.max_budget)} · {b.meetup_label}</option>)}</select></label>
          <PriorityPicker compact value={buyerPriority} onChange={setBuyerPriority}/>
        </div>
        <div className="bp-compare">
          {[['보고서 기본 순서 (P>D>T>R>U)', baseList], ['이 구매자의 우선순위', myList]].map(([title, list]) => <div key={title}>
            <h3>{title}</h3>
            {list.length === 0 ? <p className="presentation-helper">조건에 맞는 상품이 없어요.</p> : <ol>{list.map(r => <li key={r.id}><span>판매자 {r.demo_seller} · {r.meetup_label} · {r.km.toFixed(2)}km · {KRW(r.price)}</span><b>{r.score.toFixed(1)}</b></li>)}</ol>}
          </div>)}
        </div>
      </div>
    </div>
    <div className="presentation-inventory">
      <div className="presentation-inventory-head"><div><h2>가상 구매자 목록 <span>30명</span></h2><p>선택한 판매글 기준으로 각 구매자가 어느 단계에서 걸러졌는지 보여줍니다.</p></div><button className="button outline" onClick={() => setShowAll(v => !v)}>{showAll ? '목록 접기' : '30명 전체 보기'}</button></div>
      {showAll && <div className="presentation-table-wrap"><table className="presentation-table"><thead><tr><th>구매자</th><th>희망상품</th><th>예산</th><th>수량</th><th>출발 장소</th><th>긴급도</th><th>신뢰도 R</th><th>결과</th></tr></thead><tbody>
        {PRESENTATION_BUYERS.map(b => { const r = resultById.get(b.id); const reason = filterReason(product, b, simNow); return <tr key={b.id}>
          <td>{b.demo_buyer}</td><td>{findItem(b.product_key).icon} {findItem(b.product_key).name}</td><td>{KRW(b.max_budget)}</td><td>{b.quantity}</td><td>{b.meetup_label}</td><td>{b.urgency}</td><td>{reliability(b.completed_count, b.closed_count).toFixed(2)}</td>
          <td><span className={`presentation-status ${r ? 'ok' : reason === 'product' ? 'other' : 'budget'}`}>{r ? `${r.score.toFixed(1)}점${top.some(t => t.id === b.id) ? ' · TOP3' : ''}` : REASON[reason]}</span></td></tr> })}
      </tbody></table></div>}
    </div>
    <p className="presentation-footer-note"><TrendingDown size={15}/> 가중치 30/25/20/15/10은 보고서에 적힌 대로 초기 설계 단계의 가정값입니다. 설문이나 거래 데이터로 검증하는 방법은 docs/MATCHING.md를 보세요.</p>
  </section>
}
