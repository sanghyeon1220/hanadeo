import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight, ArrowUpRight, BadgeCheck, Check, CheckCircle2, ChevronDown, Clock3, Download, Share,
  Compass, HeartHandshake, Info, Leaf, LocateFixed, LogIn, LogOut, MapPin,
  Menu, Package, Plus, Search, ShieldCheck, ShoppingBag, SlidersHorizontal,
  Sparkles, Tag, TrendingDown, UserRound, Wallet, X, Zap
} from 'lucide-react'
import { CATALOG, MEETUP_SPOTS, BUYER_ORIGINS, TRADE_METHODS, CONDITIONS, findItem, findSpot, KRW, DEMO_PRODUCTS, DEMO_USER } from './data/catalog'
import { currentPrice, hoursLeft, matchingResult, rankProducts, topBuyers, reliability, MODEL, FACTORS, FACTOR_LABELS, DEFAULT_PRIORITY, RANK_WEIGHTS, buyerConfig, isValidPriority } from './lib/matching'
import { supabase, HAS_SUPABASE, imageUrl } from './lib/supabase'
import PresentationLab from './PresentationLab'
import PriorityPicker from './PriorityPicker'
import { authErrorMessage } from './lib/authErrors'
import { PRESENTATION_PRODUCTS, PRESENTATION_BUYERS } from './data/presentation'

const makeDate = (days = 1, hours = 0) => {
  const date = new Date(Date.now() + days * 86400000 + hours * 3600000)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const iso = s => new Date(s).toISOString()
const shortDate = s => new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(s))
const initials = email => (email || '이웃').split('@')[0].slice(0, 10)
const generateDemoId = () => `demo-${Math.random().toString(36).slice(2, 11)}`

function Logo({ compact = false }) {
  return <div className="brand" aria-label="하나더 로고"><div className="brand-mark"><span>1</span><span className="brand-plus">+</span><span>1</span></div>{!compact && <div className="brand-name">하나더<span>.</span></div>}</div>
}

// 앱 설치 버튼: 안드로이드·PC 크롬은 설치 창을 띄우고, 아이폰 사파리는 '홈 화면에 추가' 방법을 안내
function useInstallPrompt() {
  const [deferred, setDeferred] = useState(null)
  const [installed, setInstalled] = useState(false)
  const standalone = typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true)
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const ios = /iphone|ipad|ipod/i.test(ua) && /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua)
  useEffect(() => {
    const onPrompt = e => { e.preventDefault(); setDeferred(e) }
    const onInstalled = () => { setInstalled(true); setDeferred(null) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled) }
  }, [])
  const prompt = async () => {
    if (!deferred) return
    deferred.prompt()
    try { const { outcome } = await deferred.userChoice; if (outcome === 'accepted') setInstalled(true) } catch {}
    setDeferred(null)
  }
  let embedded = false
  try { embedded = window.self !== window.top } catch { embedded = true }
  return { canShow: !embedded && !standalone && !installed && (Boolean(deferred) || ios), ios: ios && !deferred, prompt }
}

function Pill({ icon: Icon, children, warm = false }) {
  return <span className={`pill ${warm ? 'pill-warm' : ''}`}>{Icon && <Icon size={13}/>} {children}</span>
}

function Empty({ icon: Icon, title, subtitle, action, onAction }) {
  return <div className="empty"><div className="empty-icon"><Icon size={28}/></div><h3>{title}</h3><p>{subtitle}</p>{action && <button className="button primary" onClick={onAction}>{action}<ArrowRight size={16}/></button>}</div>
}

function ProductCard({ product, request, userId, onReserve, onRequest, inProgress, preview = false, onPreview }) {
  const cfg = buyerConfig(request)
  const item = findItem(product.product_key)
  const result = !preview && request ? matchingResult(product, request, userId, Date.now(), cfg) : null
  const price = result?.price ?? currentPrice(product)
  const own = !preview && product.seller_id === userId
  const isAvailable = product.status === 'active' && new Date(product.expires_at).getTime() > Date.now()
  const photo = product.image_path && imageUrl(product.image_path)
  return <article className="product-card">
    <div className={`product-visual ${item.color}`}>
      {photo ? <img src={photo} alt={`${product.title} 사진`}/> : <span className="product-emoji">{item.icon}</span>}
      <span className="image-category">{item.category}</span>
      {preview ? <span className="score-chip"><Info size={13}/>체험 예시</span> : result && <span className="score-chip" title="내 우선순위로 계산한 점수"><Sparkles size={13}/>내 기준 {result.score.toFixed(1)}점</span>}
    </div>
    <div className="product-content">
      <div className="product-title-row"><h3>{product.title}</h3><span className="product-price">{KRW(price)}</span></div>
      <p className="product-description">{product.description || '이웃과 함께 1+1 상품을 나눠요.'}</p>
      <div className="product-facts">
        <span><MapPin size={14}/>{product.meetup_label}</span>
        <span><Clock3 size={14}/>{hoursLeft(product.expires_at)} · {product.quantity ?? 1}개 · {product.trade_method ?? '직거래'}</span>
      </div>
      {result && <div className="match-mini">{['P','D','T'].map(k=><div key={k}><span>{FACTOR_LABELS[k]} 적합도</span><b>{Math.round(result.factors[k]*100)}%</b></div>)}</div>}
      <div className="card-bottom"><span className="discount"><TrendingDown size={13}/>최저 {KRW(product.min_price)}</span>
        {preview ? <button className="button tiny outline" onClick={onPreview}>체험 모드에서 보기 <ArrowRight size={14}/></button> : own ? <button className="button tiny muted" disabled>내 상품</button> : !isAvailable ? <button className="button tiny muted" disabled>거래 종료</button> : result ? <button className="button tiny primary" disabled={inProgress || !result.timeOverlap} title={!result.timeOverlap ? '거래 가능 시간이 겹치지 않아 예약할 수 없어요' : ''} onClick={() => onReserve(product)}>{inProgress ? '처리 중' : result.timeOverlap ? '매칭 예약' : '시간 조율 필요'}<ArrowUpRight size={14}/></button> : <button className="button tiny outline" onClick={onRequest}>구매 요청 만들기<ArrowRight size={14}/></button>}
      </div>
    </div>
  </article>
}

function TopBuyers({ product, list, onLoad, loading, busyId, onSelect }) {
  if (!list) return <div className="top-buyers"><button className="button tiny primary" onClick={onLoad} disabled={loading}>{loading?'계산 중...':'추천 구매자 TOP 3 보기'}<Sparkles size={14}/></button></div>
  return <div className="top-buyers"><div className="top-buyers-head"><Sparkles size={14}/> 추천 구매자 TOP {MODEL.topN} <small>현재가 {KRW(currentPrice(product))} 기준 · M = 100(0.30P + 0.25D + 0.20T + 0.15R + 0.10U)</small>{onLoad && <button className="text-button" onClick={onLoad}>새로고침</button>}</div>
    {list.length===0 ? <p className="muted-small">조건(희망상품·수량·예산·거래시간)을 만족하는 구매자가 아직 없어요.</p> :
    <ol>{list.map((c,i)=><li key={c.id}><span className="tb-rank">{i+1}</span><div className="tb-info"><b>{c.request.nickname ?? c.request.demo_buyer ?? '구매자'}</b><small>{c.request.meetup_label} · {c.km.toFixed(2)}km · 예산 {KRW(c.request.max_budget)} · 긴급도 {c.request.urgency} · 신뢰도 {reliability(c.request.completed_count,c.request.closed_count).toFixed(2)}</small><div className="tb-factors">{FACTORS.map(k=><span key={k}>{k} {c.factors[k].toFixed(2)}</span>)}</div></div><b className="tb-score">{c.score.toFixed(1)}</b><button className="button tiny primary" disabled={busyId===`sel-${c.id}`} onClick={()=>onSelect(c)}>선택</button></li>)}</ol>}
  </div>
}

function AuthPanel({ onToast }) {
  const [isSignup, setIsSignup] = useState(false)
  const [nickname, setNickname] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmHint, setConfirmHint] = useState(false)
  const [formError, setFormError] = useState(null)
  const bad = field => formError?.fields.includes(field)
  const edit = setter => e => { setter(e.target.value); if (formError) setFormError(null) }

  const submit = async e => {
    e.preventDefault()
    setBusy(true)
    setConfirmHint(false)
    setFormError(null)
    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email, password, options: { data: { nickname: nickname.trim() || '이웃' } }
        })
        if (error) throw error
        // 이메일 인증을 켜 둔 경우, 이미 가입된 이메일이면 Supabase가 오류 대신 빈 identities 를 돌려줌
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw { code: 'user_already_exists' }
        if (!data.session) setConfirmHint(true)
        else onToast('회원가입과 로그인이 완료됐어요.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        onToast('로그인했어요!')
      }
    } catch (err) { setFormError(authErrorMessage(err)) }
    finally { setBusy(false) }
  }

  return <section className="auth-layout"><div className="auth-story"><Pill icon={HeartHandshake}>우리 동네의 새로운 나눔</Pill><h1>하나는 내가,<br/><em>하나는 우리.</em></h1><p>남는 1+1 상품을 필요한 이웃과 연결해요. 가까운 거리, 합리적인 가격, 가능한 시간까지 똑똑하게 매칭합니다.</p><div className="auth-steps"><div><span>01</span>희망 상품 선택</div><div><span>02</span>매칭 점수 계산</div><div><span>03</span>이웃과 안전하게 거래</div></div></div><form className="auth-panel" onSubmit={submit}><div className="form-eyebrow">WELCOME TO HANADUH</div><h2>{isSignup ? '새로운 나눔 시작하기' : '다시 만나서 반가워요'}</h2><p>Supabase Auth로 안전하게 계정을 관리해요.</p>{isSignup && <label className="field-label">닉네임<input value={nickname} onChange={edit(setNickname)} maxLength={32} placeholder="예: 나눔하는이웃"/></label>}<label className="field-label">이메일<input type="email" autoComplete="email" value={email} onChange={edit(setEmail)} aria-invalid={bad('email')||undefined} className={bad('email')?'invalid':''} placeholder="name@example.com" required/></label><label className="field-label">비밀번호<input type="password" autoComplete={isSignup?'new-password':'current-password'} minLength={6} value={password} onChange={edit(setPassword)} aria-invalid={bad('password')||undefined} className={bad('password')?'invalid':''} placeholder="6자 이상" required/></label>{formError && <div className="auth-error" role="alert"><Info size={17}/><div><b>{formError.text}</b>{formError.detail && <span>{formError.detail}</span>}</div></div>}{confirmHint && <p className="hint success"><CheckCircle2 size={16}/>이메일 인증 링크를 확인해 주세요. 인증 후 로그인할 수 있어요.</p>}<button className="button primary wide" disabled={busy} type="submit">{busy?'처리 중...':isSignup?'회원가입':'로그인'}<ArrowRight size={17}/></button><div className="switch-auth">{isSignup?'이미 계정이 있나요?':'아직 계정이 없나요?'} <button type="button" onClick={()=>{setIsSignup(v=>!v);setFormError(null)}}>{isSignup?'로그인':'회원가입'}</button></div></form></section>
}

function SellForm({ onSubmit, busy, isDemo }) {
  const [key, setKey] = useState(CATALOG[0].key)
  const [price, setPrice] = useState(String(CATALOG[0].price))
  const [min, setMin] = useState(String(Math.round(CATALOG[0].price*0.45/100)*100))
  const [description, setDescription] = useState('1+1 행사로 구매했어요. 미개봉 새 상품입니다!')
  const [expiry, setExpiry] = useState(makeDate(3))
  const [from, setFrom] = useState(makeDate(0, 1))
  const [until, setUntil] = useState(makeDate(1))
  const [spot, setSpot] = useState(MEETUP_SPOTS[0].key)
  const [image, setImage] = useState(null)
  const [quantity, setQuantity] = useState('1')
  const [method, setMethod] = useState(TRADE_METHODS[0])
  const [condition, setCondition] = useState(CONDITIONS[0])

  const submit = e => {
    e.preventDefault()
    if (new Date(expiry) <= new Date()) return onSubmit(null, '판매 종료 시각은 현재 이후여야 해요.')
    if (new Date(from) >= new Date(until)) return onSubmit(null, '거래 종료 시간이 시작 시간보다 늦어야 해요.')
    if (Number(min) > Number(price) || Number(price) <= 0 || Number(min) < 0) return onSubmit(null, '가격과 최저가를 다시 확인해 주세요.')
    onSubmit({ product_key:key, title:findItem(key).name, description, original_price:Number(price), min_price:Number(min), quantity:Number(quantity), trade_method:method, condition, expires_at:iso(expiry), available_from:iso(from), available_until:iso(until), meetup_label:findSpot(spot).label, latitude:findSpot(spot).lat, longitude:findSpot(spot).lng, image })
  }
  return <div className="form-layout"><div><Pill icon={Package}>SELLER SPACE</Pill><h2 className="section-title">남는 하나를<br/><span>이웃에게 나눠주세요.</span></h2><p className="section-subtitle">1+1 구매 후 남은 미개봉 상품을 등록하면, 조건이 맞는 구매자에게 추천됩니다.</p><div className="tip-card"><Sparkles size={20}/><div><b>시간 기반 동적 가격</b><p>현재가격 = 최저가격 + (최초가격 − 최저가격) × (1 − 경과시간/전체 판매시간). 판매 종료 시각에 최저가격이 되고, 매칭되는 순간의 가격이 확정돼요. 등록 후 <b>내 거래</b>에서 추천 구매자 TOP 3를 볼 수 있어요.</p></div></div></div><form className="entry-card" onSubmit={submit}><div className="form-head"><span className="form-count">01 — 상품 정보</span><h3>판매 상품 등록</h3></div><div className="form-grid"><label className="field-label full">상품 종류<select value={key} onChange={e=>{const selected=findItem(e.target.value);setKey(selected.key);setPrice(String(selected.price));setMin(String(Math.round(selected.price*0.45/100)*100))}}>{CATALOG.map(c=><option key={c.key} value={c.key}>{c.icon} [{c.category}] {c.name}</option>)}</select></label><label className="field-label">최초 판매가격 (원)<input type="number" value={price} onChange={e=>setPrice(e.target.value)} min="1" max="9999999" required/></label><label className="field-label">최저 판매가격 (원)<input type="number" value={min} onChange={e=>setMin(e.target.value)} min="0" max="9999999" required/></label><label className="field-label">수량<input type="number" value={quantity} onChange={e=>setQuantity(e.target.value)} min="1" max="99" required/></label><label className="field-label">상품 상태<select value={condition} onChange={e=>setCondition(e.target.value)}>{CONDITIONS.map(c=><option key={c}>{c}</option>)}</select></label><label className="field-label full">상품 설명<textarea rows="3" maxLength={500} value={description} onChange={e=>setDescription(e.target.value)}/></label></div><div className="form-head border-top"><span className="form-count">02 — 거래 조건</span></div><div className="form-grid"><label className="field-label full">판매 종료 시각 (판매 가능기간 끝 · 소비기한 이전으로)<input type="datetime-local" value={expiry} onChange={e=>setExpiry(e.target.value)} required/></label><label className="field-label">거래 가능 시작<input type="datetime-local" value={from} onChange={e=>setFrom(e.target.value)} required/></label><label className="field-label">거래 가능 종료<input type="datetime-local" value={until} onChange={e=>setUntil(e.target.value)} required/></label><label className="field-label">상품 전달 장소<select value={spot} onChange={e=>setSpot(e.target.value)}>{MEETUP_SPOTS.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}</select></label><label className="field-label">거래 방식<select value={method} onChange={e=>setMethod(e.target.value)}>{TRADE_METHODS.map(m=><option key={m}>{m}</option>)}</select></label><label className="field-label full">상품 사진 (선택 · 5MB 이하)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setImage(e.target.files?.[0]??null)} disabled={isDemo}/></label></div>{isDemo && <div className="inline-note"><Info size={15}/>체험 모드에서는 이미지 업로드가 비활성화돼 있어요.</div>}<button className="button primary wide" type="submit" disabled={busy}>{busy?'등록 중...':'상품 등록하기'}<ArrowRight size={17}/></button></form></div>
}

function RequestForm({ onSubmit, busy }) {
  const [key, setKey] = useState(CATALOG[0].key)
  const [budget, setBudget] = useState('2000')
  const [urgency, setUrgency] = useState(3)
  const [from, setFrom] = useState(makeDate(0,1))
  const [until, setUntil] = useState(makeDate(1))
  const [spot, setSpot] = useState(MEETUP_SPOTS[0].key)
  const [quantity, setQuantity] = useState('1')
  const [priority, setPriority] = useState(DEFAULT_PRIORITY)

  const submit = e => {
    e.preventDefault()
    if (new Date(from) >= new Date(until)) return onSubmit(null,'거래 종료 시간이 시작 시간보다 늦어야 해요.')
    if (new Date(until) <= new Date()) return onSubmit(null,'이미 지난 거래 시간은 선택할 수 없어요.')
    onSubmit({ product_key:key, max_budget:Number(budget), urgency:Number(urgency), quantity:Number(quantity), priority, available_from:iso(from), available_until:iso(until), meetup_label:findSpot(spot).label, latitude:findSpot(spot).lat, longitude:findSpot(spot).lng })
  }
  return <div className="form-layout"><div><Pill icon={ShoppingBag}>BUYER SPACE</Pill><h2 className="section-title">필요한 하나를<br/><span>가장 잘 맞는 이웃에게.</span></h2><p className="section-subtitle">희망상품과 조건을 입력하면 판매자에게 매칭점수 상위 구매자로 추천되고, 나도 조건에 맞는 상품을 점수순으로 볼 수 있어요.</p><div className="factor-card"><p className="factor-heading">우리의 매칭 공식</p><div className="factor-grid five">{FACTORS.map(k=><div key={k}><span>{Math.round(MODEL.weights[k]*100)}%</span><small>{FACTOR_LABELS[k]}</small></div>)}</div><p className="muted-small">희망상품·수량·예산·거래시간을 먼저 통과한 경우에만 점수를 매겨요. 신뢰도는 과거 거래 완료·취소 이력으로 계산되며 처음엔 0.5예요.</p></div></div><form className="entry-card" onSubmit={submit}><div className="form-head"><span className="form-count">01 — 희망 조건</span><h3>구매 요청 등록</h3></div><div className="form-grid"><label className="field-label full">희망 상품<select value={key} onChange={e=>setKey(e.target.value)}>{CATALOG.map(c=><option key={c.key} value={c.key}>{c.icon} {c.name}</option>)}</select></label><label className="field-label">최대 지불 가능가격 (원)<input type="number" value={budget} onChange={e=>setBudget(e.target.value)} min="1" max="9999999" required/></label><label className="field-label">구매 희망수량<input type="number" value={quantity} onChange={e=>setQuantity(e.target.value)} min="1" max="99" required/></label><div className="field-label full"><span>구매 긴급도</span><div className="urgency-row">{[1,2,3,4,5].map(n=><button className={`urgency-option ${urgency===n?'selected':''}`} type="button" key={n} onClick={()=>setUrgency(n)}>{n}</button>)}</div><div className="urgency-caption"><span>여유로워요</span><span>지금 필요해요</span></div></div></div><div className="form-head border-top"><span className="form-count">02 — 거래 조건</span></div><div className="form-grid"><label className="field-label">거래 가능 시작<input type="datetime-local" value={from} onChange={e=>setFrom(e.target.value)} required/></label><label className="field-label">거래 가능 종료<input type="datetime-local" value={until} onChange={e=>setUntil(e.target.value)} required/></label><label className="field-label full">구매자 위치 또는 출발 장소<select value={spot} onChange={e=>setSpot(e.target.value)}>{BUYER_ORIGINS.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}</select></label></div><div className="form-head border-top"><span className="form-count">03 — 내 우선순위</span><p className="muted-small">무엇을 더 중요하게 볼지 순서를 정하면, 보고서 가중치 30·25·20·15·10%가 그 순서대로 배정돼 <b>내가 보는 상품 추천 순서</b>가 바뀌어요. 판매자에게 보이는 매칭점수는 공정성을 위해 기본 가중치로 계산돼요.</p></div><PriorityPicker value={priority} onChange={setPriority}/><div className="inline-note"><ShieldCheck size={15}/>실제 거주지가 아닌 공개된 만남 장소를 선택해 주세요.</div><button className="button primary wide" type="submit" disabled={busy}>{busy?'매칭 중...':'상품 매칭하기'}<Sparkles size={17}/></button></form></div>
}

export default function App() {
  const [mode, setMode] = useState(HAS_SUPABASE ? 'live' : 'demo')
  const [page, setPage] = useState(() => { try { const p = new URLSearchParams(window.location.search).get('page'); return ['discover','presentation','sell','request','matches'].includes(p) ? p : 'discover' } catch { return 'discover' } })
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(HAS_SUPABASE)
  const [demoProducts, setDemoProducts] = useState(PRESENTATION_PRODUCTS)
  const [demoRequests, setDemoRequests] = useState([])
  const [demoMatches, setDemoMatches] = useState([])
  const [liveProducts, setLiveProducts] = useState([])
  const [liveRequests, setLiveRequests] = useState([])
  const [liveMatches, setLiveMatches] = useState([])
  const [nicknames, setNicknames] = useState({})
  const [confirmId, setConfirmId] = useState(null)
  const [myStats, setMyStats] = useState({completed_count:0,closed_count:0})
  const [liveTop, setLiveTop] = useState({})
  const [activeRequestId, setActiveRequestId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [toast, setToast] = useState(null)
  const [search, setSearch] = useState('')
  const [showcaseLimit, setShowcaseLimit] = useState(12)
  const [category, setCategory] = useState('all')
  const [menu, setMenu] = useState(false)
  const install = useInstallPrompt()
  const [iosHelp, setIosHelp] = useState(false)
  // 화면을 바꾸면 앱처럼 맨 위에서 시작
  useEffect(() => { try { window.scrollTo({ top: 0 }) } catch {} }, [page])
  const isDemo = mode === 'demo'
  const user = isDemo ? DEMO_USER : session?.user
  const products = isDemo ? demoProducts : liveProducts
  const requests = isDemo ? demoRequests : liveRequests
  const matches = isDemo ? demoMatches : liveMatches
  const openRequests = requests.filter(r => (r.status ?? 'open') === 'open')
  const pickedRequest = activeRequestId === '__none__' ? null : (openRequests.find(r => r.id === activeRequestId) ?? openRequests[0] ?? null)
  const activeRequest = useMemo(() => pickedRequest && { ...pickedRequest, buyer_id: pickedRequest.buyer_id ?? user?.id, completed_count: myStats.completed_count, closed_count: myStats.closed_count }, [pickedRequest, myStats, user?.id])
  const myProducts = user ? products.filter(p => p.seller_id === user.id) : []

  const notify = useCallback((message, error = false) => setToast({ message, error, id:Date.now() }), [])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 4400); return () => clearTimeout(timer) }, [toast])

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) notify(error.message, true)
      setSession(data?.session ?? null)
      setAuthLoading(false)
    }).catch(err => {notify(err.message,true);setAuthLoading(false)})
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, current) => setSession(current))
    return () => subscription.unsubscribe()
  }, [notify])

  const refresh = useCallback(async () => {
    if (isDemo || !session?.user) return
    setLoading(true)
    try {
      const [p, r, m] = await Promise.all([
        supabase.from('products').select('*').order('created_at',{ascending:false}),
        supabase.from('buyer_requests').select('*').order('created_at',{ascending:false}),
        supabase.from('matches').select('*, products(title,product_key,image_path,meetup_label), buyer_requests(product_key,urgency,meetup_label)').order('created_at',{ascending:false})
      ])
      if (p.error) throw p.error
      if (r.error) throw r.error
      if (m.error) throw m.error
      setLiveProducts(p.data ?? [])
      setLiveRequests(r.data ?? [])
      setLiveMatches(m.data ?? [])
      const st=await supabase.rpc('get_trade_stats',{p_user:session.user.id})
      if (!st.error && st.data?.[0]) setMyStats(st.data[0])
      const partnerIds=[...new Set((m.data ?? []).flatMap(x=>[x.buyer_id,x.seller_id]))]
      if (partnerIds.length) {
        const prof=await supabase.from('profiles').select('id,nickname').in('id',partnerIds)
        if (!prof.error) setNicknames(Object.fromEntries((prof.data??[]).map(x=>[x.id,x.nickname])))
      }
    } catch (err) { notify(`데이터를 읽지 못했어요: ${err.message}. README의 SQL 설정을 확인해 주세요.`,true) }
    finally { setLoading(false) }
  }, [isDemo, session?.user?.id, notify])
  useEffect(() => { refresh() }, [refresh])

  const activeProducts = useMemo(() => products.filter(p=>p.status==='active'&&new Date(p.expires_at)>new Date()),[products])
  const recommended = useMemo(()=>activeRequest ? rankProducts(activeProducts, activeRequest, user?.id, Date.now(), buyerConfig(activeRequest)) : [],[activeProducts,activeRequest,user?.id])
  const rankedMap = useMemo(()=>new Map(recommended.map(p=>[p.id,p])),[recommended])
  const shownProducts = useMemo(() => {
    const candidates = activeRequest ? recommended : activeProducts
    return candidates.filter(p => {
      const item=findItem(p.product_key)
      return (category==='all'||item.category===category) && `${p.title} ${p.description||''}`.toLowerCase().includes(search.toLowerCase())
    })
  }, [activeRequest,recommended,activeProducts,category,search])
  const categories = [...new Set(CATALOG.map(x => x.category))]
  const sampleProducts = useMemo(() => DEMO_PRODUCTS.filter(p => {
    const item = findItem(p.product_key)
    return (category === 'all' || item.category === category) && `${p.title} ${p.description || ''}`.toLowerCase().includes(search.toLowerCase())
  }), [category, search])

  const handleSale = async (form, error) => {
    if (error) return notify(error,true)
    setBusyId('sale')
    try {
      const {image,...payload}=form
      if (isDemo) {
        setDemoProducts(old=>[{...payload,id:generateDemoId(),seller_id:user.id,status:'active',created_at:new Date().toISOString(),image_path:null},...old])
      } else {
        let image_path=null
        if (image) {
          if (image.size>5*1024*1024 || !['image/jpeg','image/png','image/webp'].includes(image.type)) throw new Error('JPG, PNG, WEBP 사진만 5MB 이하로 업로드할 수 있어요.')
          const extension=({ 'image/jpeg':'jpg','image/png':'png','image/webp':'webp' })[image.type]
          image_path=`${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`
          const {error:uploadError}=await supabase.storage.from('product-images').upload(image_path,image,{contentType:image.type})
          if (uploadError) throw uploadError
        }
        const {error:insertError}=await supabase.from('products').insert({...payload,image_path})
        if (insertError) throw insertError
        await refresh()
      }
      notify(isDemo?'체험 상품이 등록됐어요!':'상품이 실제 데이터베이스에 등록됐어요!')
      setPage('discover')
    } catch(err) { notify(err.message,true) }
    finally { setBusyId(null) }
  }

  const handleRequest = async (payload, error) => {
    if (error) return notify(error,true)
    setBusyId('request')
    try {
      if (isDemo) {
        const req={...payload,id:generateDemoId(),buyer_id:user.id,created_at:new Date().toISOString()}
        setDemoRequests(old=>[req,...old]); setActiveRequestId(req.id)
      } else {
        const {data,error:insertError}=await supabase.from('buyer_requests').insert(payload).select().single()
        if (insertError) throw insertError
        setActiveRequestId(data.id)
        await refresh()
      }
      notify('구매 요청을 저장하고 매칭을 계산했어요!')
      setPage('discover')
    } catch(err) {notify(err.message,true)}
    finally {setBusyId(null)}
  }

  const handleReserve = async product => {
    if (!activeRequest) return setPage('request')
    setBusyId(product.id)
    try {
      if (isDemo) {
        if (demoMatches.some(m=>m.request_id===activeRequest.id && m.status==='reserved')) throw new Error('이 구매 요청으로 이미 예약한 상품이 있어요.')
        const result=matchingResult(product,activeRequest,user.id)
        if (!result?.timeOverlap) throw new Error('거래 가능 시간이 겹치지 않습니다.')
        const match={id:generateDemoId(),product_id:product.id,request_id:activeRequest.id,buyer_id:user.id,seller_id:product.seller_id,booked_price:result.price,score:result.score,status:'reserved',created_at:new Date().toISOString(),products:product,buyer_requests:activeRequest}
        setDemoMatches(old=>[match,...old])
        setDemoProducts(old=>old.map(p=>p.id===product.id?{...p,status:'reserved'}:p))
      } else {
        const {error}=await supabase.rpc('reserve_match',{p_product_id:product.id,p_request_id:activeRequest.id})
        if(error) throw error
        await refresh()
      }
      notify('매칭 예약이 완료됐어요. 내 거래에서 확인하세요!')
      setPage('matches')
    } catch(err){notify(err.message,true)}
    finally {setBusyId(null)}
  }

  // 판매자: 추천 구매자 TOP 3 (보고서 4.1)
  const demoCandidates = useMemo(() => {
    const busy = new Set(demoMatches.filter(m=>m.status==='reserved').map(m=>m.request_id))
    // 체험 모드에서도 완료·노쇼가 신뢰도(R)에 반영되도록 이력을 더함
    const extra = {}
    for (const m of demoMatches) {
      const e = extra[m.buyer_id] ??= { completed: 0, closed: 0 }
      if (m.status === 'completed') { e.completed++; e.closed++ }
      else if (m.no_show) e.closed++
    }
    return [...PRESENTATION_BUYERS, ...demoRequests]
      .filter(r=>(r.status??'open')==='open' && !busy.has(r.id))
      .map(r=>extra[r.buyer_id] ? { ...r, completed_count:(r.completed_count??0)+extra[r.buyer_id].completed, closed_count:(r.closed_count??0)+extra[r.buyer_id].closed } : r)
  }, [demoMatches, demoRequests])
  const demoTop = useMemo(() => Object.fromEntries(myProducts.filter(p=>p.status==='active').map(p=>[p.id, topBuyers(p, demoCandidates)])), [myProducts, demoCandidates])

  const loadLiveTop = async product => {
    setBusyId(`top-${product.id}`)
    try {
      const {data,error}=await supabase.rpc('recommend_buyers',{p_product_id:product.id,p_limit:MODEL.topN})
      if(error) throw error
      setLiveTop(old=>({...old,[product.id]:(data??[]).map(r=>({id:r.request_id,score:Number(r.score),price:r.price,km:r.distance_km,overlapMinutes:Number(r.overlap_minutes),factors:{P:+r.f_p,D:+r.f_d,T:+r.f_t,R:+r.f_r,U:+r.f_u},request:{id:r.request_id,nickname:r.nickname,meetup_label:r.meetup_label,max_budget:r.max_budget,urgency:r.urgency,quantity:r.quantity,completed_count:r.completed_count,closed_count:r.closed_count}}))}))
    } catch(err){notify(err.message,true)}
    finally{setBusyId(null)}
  }

  const selectBuyer = async (product, cand) => {
    setBusyId(`sel-${cand.id}`)
    try {
      if (isDemo) {
        const match={id:generateDemoId(),product_id:product.id,request_id:cand.request.id,buyer_id:cand.request.buyer_id,seller_id:user.id,booked_price:cand.price,score:cand.score,status:'reserved',created_at:new Date().toISOString(),products:product,buyer_requests:cand.request,partner:cand.request.nickname}
        setDemoMatches(old=>[match,...old])
        setDemoProducts(old=>old.map(p=>p.id===product.id?{...p,status:'reserved'}:p))
      } else {
        const {error}=await supabase.rpc('select_buyer',{p_product_id:product.id,p_request_id:cand.request.id})
        if(error) throw error
        setLiveTop(old=>({...old,[product.id]:undefined}))
        await refresh()
      }
      notify(`${cand.request.nickname ?? '구매자'}님과 매칭했어요. 위 거래 내역에서 확인하세요.`)
    } catch(err){notify(err.message,true)}
    finally{setBusyId(null)}
  }

  const changeMatch = async (match,action) => {
    setBusyId(match.id)
    try {
      if (isDemo) {
        const back=action==='cancel'||action==='no_show'
        setDemoMatches(old=>old.map(m=>m.id===match.id?{...m,status:back?'cancelled':'completed',no_show:action==='no_show'}:m))
        setDemoProducts(old=>old.map(p=>p.id===match.product_id?{...p,status:back?'active':'sold'}:p))
        if(action==='complete') setDemoRequests(old=>old.map(r=>r.id===match.request_id?{...r,status:'closed'}:r))
      } else {
        const {error}=await supabase.rpc('change_match_status',{p_match_id:match.id,p_action:action})
        if(error) throw error
        await refresh()
      }
      notify(action==='cancel'?'예약이 취소됐어요.':action==='no_show'?'노쇼로 기록했어요. 구매자 신뢰도에 반영돼요.':'거래 완료로 변경했어요!')
    } catch(err){notify(err.message,true)}
    finally {setBusyId(null)}
  }

  const withdrawProduct = async product => {
    if (confirmId !== product.id) { setConfirmId(product.id); return }
    setConfirmId(null)
    setBusyId(product.id)
    try {
      if (isDemo) setDemoProducts(old=>old.map(p=>p.id===product.id?{...p,status:'withdrawn'}:p))
      else { const {error}=await supabase.rpc('withdraw_product',{p_product_id:product.id}); if(error) throw error; await refresh() }
      notify('판매글을 내렸어요.')
    } catch(err){notify(err.message,true)}
    finally{setBusyId(null)}
  }

  const [showPriority, setShowPriority] = useState(false)
  const updatePriority = async (request, priority) => {
    if (isDemo) { setDemoRequests(old=>old.map(r=>r.id===request.id?{...r,priority}:r)); return }
    setLiveRequests(old=>old.map(r=>r.id===request.id?{...r,priority}:r))
    const {error}=await supabase.from('buyer_requests').update({priority}).eq('id',request.id)
    if (error) { notify(`우선순위를 저장하지 못했어요: ${error.message}`,true); await refresh() }
  }

  const closeRequest = async request => {
    setBusyId(request.id)
    try {
      if (isDemo) {
        if (demoMatches.some(m=>m.request_id===request.id&&m.status==='reserved')) throw new Error('예약 중인 요청은 닫을 수 없습니다 (먼저 예약을 취소하세요)')
        setDemoRequests(old=>old.map(r=>r.id===request.id?{...r,status:'closed'}:r))
      } else { const {error}=await supabase.rpc('close_request',{p_request_id:request.id}); if(error) throw error; await refresh() }
      setActiveRequestId(null)
      notify('구매 요청을 닫았어요.')
    } catch(err){notify(err.message,true)}
    finally{setBusyId(null)}
  }

  const signOut=async()=>{const {error}=await supabase.auth.signOut();if(error)notify(error.message,true);else{setPage('discover');setActiveRequestId(null)}}
  const navs=[{key:'discover',label:'상품 둘러보기',short:'홈',icon:Compass},{key:'presentation',label:'발표 시연',short:'시연',icon:Sparkles},{key:'sell',label:'상품 나누기',short:'나누기',icon:Plus},{key:'request',label:'구매 요청',short:'요청',icon:SlidersHorizontal},{key:'matches',label:'내 거래',short:'내 거래',icon:ShoppingBag}]
  const resetPresentation = () => {
    setDemoProducts(PRESENTATION_PRODUCTS.map(p=>({...p})))
    setDemoRequests([]);setDemoMatches([]);setActiveRequestId(null)
    notify('체험용 상품 20개·구매자 30명과 거래 상태가 초기화됐어요.')
  }

  return <div className="app-shell">
    <header className="site-header"><div className="header-inner"><button className="logo-button" onClick={()=>setPage('discover')}><Logo/></button><nav className={`main-nav ${menu?'open':''}`}>{navs.map(n=><button key={n.key} className={page===n.key?'active':''} onClick={()=>{if(n.key==='presentation')setMode('demo');setPage(n.key);setMenu(false)}}><n.icon size={16}/>{n.label}</button>)}</nav><div className="header-actions"><button className="mode-switch" onClick={()=>{setMode(isDemo && HAS_SUPABASE?'live':'demo');setPage('discover')}} title="체험 모드와 실제 DB 모드 전환"><span className={`mode-dot ${isDemo?'':'real'}`}/>{isDemo?'체험 모드':'Supabase 연결'}<ChevronDown size={13}/></button>{user && <span className="user-avatar" title={user.email}><UserRound size={17}/></span>}{!isDemo && session && <button className="icon-action" title="로그아웃" onClick={signOut}><LogOut size={19}/></button>}{install.canShow && <button className="install-button" onClick={()=>install.ios ? setIosHelp(true) : install.prompt()}><Download size={15}/>앱 설치</button>}<button className="menu-button" title="메뉴" onClick={()=>setMenu(v=>!v)}>{menu?<X size={22}/>:<Menu size={22}/>}</button></div></div></header>
    {isDemo && <div className="demo-ribbon"><div className="container"><Info size={15}/><span>현재 <b>체험 모드</b>입니다. 상품과 예약은 실제 데이터베이스에 저장되지 않습니다.</span>{HAS_SUPABASE && <button onClick={()=>setMode('live')}>실제 DB로 전환 <ArrowRight size={13}/></button>}</div></div>}
    {!isDemo && authLoading ? <main className="container"><div className="loading-panel">Supabase 로그인 상태 확인 중...</div></main> : !isDemo && !session ? <main className="container"><AuthPanel onToast={notify}/></main> : <main>
      {page==='discover' && <>
        <section className="hero"><div className="container hero-grid"><div className="hero-copy"><Pill icon={Leaf}>함께 나누면 더 커지는 가치</Pill><h1>남는 하나가,<br/><span>누군가에게</span><br/>필요한 하나로.</h1><p>1+1 상품을 필요한 이웃과 연결해요.<br/>거리부터 가격, 거래 시간까지 똑똑하게.</p><div className="hero-buttons"><button className="button primary" onClick={()=>setPage('request')}>맞는 상품 찾기 <ArrowRight size={17}/></button><button className="button subtle" onClick={()=>setPage('sell')}>상품 등록하기 <Plus size={16}/></button></div><div className="hero-stats"><div><b>{activeProducts.length}<span>개</span></b><small>나눔 상품</small></div><div><b>{matches.filter(m=>m.status==='completed').length}<span>건</span></b><small>완료된 거래</small></div><div><b>5<span>가지</span></b><small>매칭 지표</small></div></div></div><div className="hero-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="floating-card float-one"><span>🥛</span><div><small>방금 등록됐어요</small><b>우유 1L</b></div><div className="float-check"><Check size={15}/></div></div><div className="giant-heart"><HeartHandshake size={92} strokeWidth={1.4}/><span className="heart-spark one">✦</span><span className="heart-spark two">✳</span></div><div className="floating-card float-two"><div className="float-circle"><Sparkles size={19}/></div><div><small>스마트 매칭</small><b>가까운 이웃 추천!</b></div></div><div className="orbit-caption">SHARE MORE · WASTE LESS</div></div></div></section>
        <section className="container catalog-section"><div className="section-heading"><div><Pill icon={Sparkles}>{activeRequest?'나에게 딱 맞는 추천':'NEARBY SHARING'}</Pill><h2>{activeRequest?'내 조건에 맞는 상품':'지금 나눔 중인 상품'}<span className="heading-count">{shownProducts.length}</span></h2><p>{activeRequest?`${findItem(activeRequest.product_key).name} · 최대 ${KRW(activeRequest.max_budget)} · 내 우선순위 ${(isValidPriority(activeRequest.priority)?activeRequest.priority:DEFAULT_PRIORITY).map(k=>FACTOR_LABELS[k]).join(' > ')}`:'가까운 이웃들이 기다리고 있는 1+1 상품을 살펴보세요.'}</p></div><button className="button subtle" onClick={()=>setPage('request')}>{activeRequest?'구매 요청 추가하기':'내 조건으로 찾기'}<ArrowRight size={16}/></button></div>
        {openRequests.length>0 && <div className="request-selector"><span><Zap size={15}/> 적용 중인 구매 요청</span><select value={activeRequest?.id||''} onChange={e=>setActiveRequestId(e.target.value)}>{openRequests.map(r=><option value={r.id} key={r.id}>{findItem(r.product_key).name} · {KRW(r.max_budget)} 이하 · {shortDate(r.created_at)}</option>)}</select><button onClick={()=>setActiveRequestId('__none__')} title="추천 보기만 해제 (요청은 유지)" className="text-button">{activeRequest?'추천 해제':''}</button>{activeRequest && <button onClick={()=>setShowPriority(v=>!v)} className="text-button">내 우선순위 {showPriority?'접기':'바꾸기'}</button>}{activeRequest && <button onClick={()=>closeRequest(activeRequest)} disabled={busyId===activeRequest.id} title="더 이상 필요 없으면 요청을 닫아요" className="text-button">요청 닫기</button>}</div>}
        {activeRequest && showPriority && <div className="priority-panel"><div><b>내 우선순위</b><p>순서를 바꾸면 아래 추천 순서와 '내 기준' 점수가 바로 바뀌어요.</p></div><PriorityPicker compact value={pickedRequest.priority} onChange={pr=>updatePriority(pickedRequest,pr)}/></div>}
        <div className="catalog-tools"><div className="search-box"><Search size={18}/><input placeholder="어떤 상품을 찾으세요?" value={search} onChange={e=>setSearch(e.target.value)}/>{search && <button aria-label="검색 초기화" onClick={()=>setSearch('')}><X size={14}/></button>}</div><div className="category-chips">{['all',...categories].map(c=><button key={c} onClick={()=>setCategory(c)} className={category===c?'chosen':''}>{c==='all'?'전체':c}</button>)}</div></div>
        {loading ? <div className="loading-panel">상품을 불러오는 중...</div> : shownProducts.length ? <div className="product-grid">{shownProducts.map(p=><ProductCard key={p.id} product={p} request={activeRequest} userId={user.id} onReserve={handleReserve} onRequest={()=>setPage('request')} inProgress={busyId===p.id}/>)}</div> : <Empty icon={Search} title="조건에 맞는 상품이 없어요" subtitle="다른 상품으로 요청하거나 검색 조건을 변경해 보세요." action="새 구매 요청 만들기" onAction={()=>setPage('request')}/>}
        </section>
        {!isDemo && !activeRequest && <section className="container showcase-section">
          <div className="section-heading">
            <div><Pill icon={ShoppingBag}>상품 미리보기</Pill><h2>이런 상품도 나눌 수 있어요 <span className="heading-count">{sampleProducts.length}</span></h2><p>음료부터 생활용품까지, 등록 가능한 상품의 예시입니다. 실제 판매자의 게시글이 아니며 구매·예약할 수 없어요.</p></div>
            <button className="button subtle" onClick={() => {setMode('demo');setPage('discover');setSearch('');setCategory('all')}}>체험 모드에서 모두 보기 <ArrowRight size={16}/></button>
          </div>
          <div className="showcase-note"><Info size={17}/> 아래 상품은 <b>시연용 샘플</b>입니다. 실제 판매 상품은 위쪽의 ‘지금 나눔 중인 상품’에서만 확인해 주세요.</div>
          <div className="product-grid">{sampleProducts.slice(0, showcaseLimit).map(p=><ProductCard key={p.id} product={p} userId={user?.id} preview onPreview={() => {setMode('demo');setPage('discover');setSearch('');setCategory('all')}} />)}</div>
          {sampleProducts.length>showcaseLimit && <div className="showcase-more"><button className="button outline" onClick={()=>setShowcaseLimit(n=>n+12)}>샘플 상품 더 보기 ({Math.min(showcaseLimit,sampleProducts.length)}/{sampleProducts.length})<ChevronDown size={16}/></button></div>}
          {sampleProducts.length===0 && <p className="showcase-no-results">이 카테고리에는 시연용 샘플이 없어요. 검색어를 바꿔 보세요.</p>}
        </section>}
        <section className="container how-section"><div><Pill icon={ShieldCheck}>HOW IT WORKS</Pill><h2>나눔은 쉽고, 매칭은 똑똑하게.</h2></div><div className="how-grid"><div><span>01</span><div className="how-icon"><Package size={26}/></div><h3>상품 등록</h3><p>남는 1+1 상품의 가격과 거래 시간을 알려주세요.</p></div><div><span>02</span><div className="how-icon"><Sparkles size={26}/></div><h3>조건 매칭</h3><p>상품 일치 후 거리·가격·시간·유통기한을 계산해요.</p></div><div><span>03</span><div className="how-icon"><HeartHandshake size={26}/></div><h3>거래 예약</h3><p>안전한 공개 장소에서 만나 나눔을 완성해요.</p></div></div></section></>}
      {page==='presentation' && <PresentationLab products={PRESENTATION_PRODUCTS} onReset={resetPresentation}/>}
      {page==='sell' && <section className="container inner-page"><SellForm onSubmit={handleSale} busy={busyId==='sale'} isDemo={isDemo}/></section>}
      {page==='request' && <section className="container inner-page"><RequestForm onSubmit={handleRequest} busy={busyId==='request'}/></section>}
      {page==='matches' && <section className="container matches-section"><div className="section-heading"><div><Pill icon={HeartHandshake}>MY SHARING</Pill><h2>내 거래 내역</h2><p>예약 현황을 확인하고, 거래를 완료하거나 취소할 수 있어요.</p></div><button className="button subtle" onClick={()=>setPage('discover')}>상품 둘러보기 <ArrowRight size={15}/></button></div>{matches.length ? <div className="matches-list">{matches.map(m=>{const item=findItem(m.products?.product_key||products.find(p=>p.id===m.product_id)?.product_key);const buyer=m.buyer_id===user.id;return <article className="match-row" key={m.id}><div className={`match-icon ${item.color}`}>{item.icon}</div><div className="match-info"><div className="match-title"><h3>{m.products?.title||products.find(p=>p.id===m.product_id)?.title||'나눔 상품'}</h3><span className={`status status-${m.status}`}>{m.status==='reserved'?'예약 중':m.status==='completed'?'거래 완료':m.no_show?'노쇼':'취소됨'}</span></div><div className="match-meta">{buyer?'구매자':'판매자'}{(m.partner||nicknames[buyer?m.seller_id:m.buyer_id]) ? ` · 상대 ${m.partner||nicknames[buyer?m.seller_id:m.buyer_id]}` : ''} · 매칭 {Number(m.score).toFixed(1)}점 · 예약 {KRW(m.booked_price)} · {shortDate(m.created_at)}</div></div><div className="match-actions">{m.status==='reserved' && <>{!buyer && <button className="button tiny primary" disabled={busyId===m.id} onClick={()=>changeMatch(m,'complete')}>거래 완료 <Check size={14}/></button>}{!buyer && <button className="button tiny outline" disabled={busyId===m.id} onClick={()=>changeMatch(m,'no_show')} title="구매자가 나타나지 않았을 때">노쇼 신고</button>}<button className="button tiny outline" disabled={busyId===m.id} onClick={()=>changeMatch(m,'cancel')}>예약 취소</button></>}</div></article>})}</div>:<Empty icon={HeartHandshake} title="아직 예약된 거래가 없어요" subtitle="먼저 구매 요청을 작성하고 마음에 드는 상품을 예약해 보세요." action="매칭 상품 찾기" onAction={()=>setPage('request')}/>}
        <div className="section-heading my-products-heading"><div><h2>내 판매글<span className="heading-count">{myProducts.length}</span></h2><p>판매 중인 글마다 매칭점수 상위 구매자 TOP 3를 추천해요. 마음에 드는 구매자를 선택하면 거래가 시작돼요.</p></div></div>
        {myProducts.length ? <div className="matches-list">{myProducts.map(p=>{const item=findItem(p.product_key);const label={active:'판매 중',reserved:'예약 중',sold:'판매 완료',withdrawn:'내림'}[p.status]||p.status;return <article className="match-row" key={p.id}><div className={`match-icon ${item.color}`}>{item.icon}</div><div className="match-info"><div className="match-title"><h3>{p.title}</h3><span className={`status status-${p.status==='active'?'reserved':p.status==='sold'?'completed':'cancelled'}`}>{label}</span></div><div className="match-meta">현재 {KRW(currentPrice(p))} · 최저 {KRW(p.min_price)} · {p.meetup_label} · {hoursLeft(p.expires_at)}</div></div><div className="match-actions">{p.status==='active' && <button className="button tiny outline" disabled={busyId===p.id} onClick={()=>withdrawProduct(p)}>{confirmId===p.id?'정말 내릴까요? 한 번 더 누르기':'판매 내리기'}</button>}</div>{p.status==='active' && <TopBuyers product={p} list={isDemo?demoTop[p.id]:liveTop[p.id]} onLoad={isDemo?null:()=>loadLiveTop(p)} loading={busyId===`top-${p.id}`} busyId={busyId} onSelect={c=>selectBuyer(p,c)}/>}</article>})}</div> : <p className="muted-small">아직 등록한 판매글이 없어요.</p>}
      </section>}
    </main>}
    <footer className="footer"><div className="container footer-inner"><Logo/><div><p>하나의 나눔, 두 배의 가치.</p><small>대학생 1+1 나눔 매칭 프로젝트 · 시연용 프로토타입</small></div><div className="footer-safe"><ShieldCheck size={18}/> 공개 만남 장소에서 안전하게 거래하세요.</div></div></footer>
    <nav className="tab-bar" aria-label="하단 메뉴">{navs.map(n=><button key={n.key} className={`${page===n.key?'active':''} ${n.key==='sell'?'tab-main':''}`} onClick={()=>{if(n.key==='presentation')setMode('demo');setPage(n.key)}} aria-current={page===n.key?'page':undefined}><span className="tab-icon"><n.icon size={n.key==='sell'?22:20}/></span><span className="tab-label">{n.short}</span></button>)}</nav>
    {iosHelp && <div className="sheet-backdrop" onClick={()=>setIosHelp(false)}><div className="install-sheet" onClick={e=>e.stopPropagation()} role="dialog" aria-label="홈 화면에 추가하는 방법"><img src="/icons/icon-192.png" alt="" width="56" height="56"/><h3>하나더를 홈 화면에 추가하기</h3><ol><li>Safari 아래쪽의 <b>공유</b> 버튼 <Share size={15}/>을 눌러요.</li><li><b>홈 화면에 추가</b>를 골라요.</li><li>오른쪽 위 <b>추가</b>를 누르면 앱처럼 열려요.</li></ol><button className="button primary wide" onClick={()=>setIosHelp(false)}>확인</button></div></div>}
    {toast && <div className={`toast ${toast.error?'toast-error':''}`} role="status">{toast.error?<Info size={18}/>:<CheckCircle2 size={18}/>}<span>{toast.message}</span><button onClick={()=>setToast(null)} aria-label="닫기"><X size={15}/></button></div>}
  </div>
}
