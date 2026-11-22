import { FACTOR_LABELS, DEFAULT_PRIORITY, RANK_WEIGHTS, isValidPriority } from './lib/matching'

// 구매자가 5개 변수의 우선순위를 정하면 보고서 가중치(30·25·20·15·10%)가 그 순서대로 배정됩니다.
const FACTOR_HINT = { P: '내 예산보다 쌀수록', D: '가까울수록', T: '거래시간이 넉넉히 겹칠수록', R: '내 거래 이력 (상품마다 같음)', U: '내 긴급도 (상품마다 같음)' }

export default function PriorityPicker({ value, onChange, compact = false }) {
  const order = isValidPriority(value) ? value : DEFAULT_PRIORITY
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= order.length) return; const next = [...order]; [next[i], next[j]] = [next[j], next[i]]; onChange(next) }
  return <div className={`priority-picker ${compact ? 'compact' : ''}`}>
    <ol>{order.map((k, i) => <li key={k}>
      <span className="pp-rank">{i + 1}순위</span>
      <div className="pp-label"><b>{FACTOR_LABELS[k]} {k}</b>{!compact && <small>{FACTOR_HINT[k]}</small>}</div>
      <span className="pp-weight">{Math.round(RANK_WEIGHTS[i] * 100)}%</span>
      <button type="button" aria-label={`${FACTOR_LABELS[k]} 순위 올리기`} disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
      <button type="button" aria-label={`${FACTOR_LABELS[k]} 순위 내리기`} disabled={i === order.length - 1} onClick={() => move(i, 1)}>▼</button>
    </li>)}</ol>
    <div className="pp-foot"><button type="button" className="text-button" onClick={() => onChange(DEFAULT_PRIORITY)}>보고서 기본 순서로</button><small>신뢰도·긴급도는 내 값이라 상품마다 같아요. 순위를 올리면 가격·거리·시간의 비중이 함께 줄어요.</small></div>
  </div>
}

