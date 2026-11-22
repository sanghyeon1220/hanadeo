import { findItem, findSpot } from './catalog.js'

// 보고서 8.1 프로토타입 구성: 가상 상품 20개 · 가상 구매자 30명 · 인하대 정문/후문/기숙사/학생회관
// 실제 계정·DB에 넣지 않는 시연용 데이터입니다. 모든 시각은 페이지를 연 시점 기준 상대값입니다.
const LOAD = Date.now()
const at = h => new Date(LOAD + h * 3600000).toISOString()

// 거래 가능시간 패턴 (시간 단위, 페이지를 연 시점 기준)
const WINDOWS = {
  all: [-2, 80],     // 언제든
  soon: [-1, 3],     // 앞으로 3시간
  short: [0.5, 1],   // 30분만
  late: [24, 48],    // 내일
  night: [8, 12]     // 오늘 밤 4시간
}

// [상품, 장소, 최초가, 최저가, 판매가능시간T(h), 등록 후 경과(h), 수량, 거래시간, 거래방식, 상태]
const productRecords = [
  ['banana',    'main_gate',     4000, 2000, 72, 24, 1, 'all',   '직거래', '미개봉 새 상품'], // 보고서 5.3 예시 상품
  ['banana',    'dormitory',     3900, 2200, 48, 10, 1, 'all',   '직거래', '미개봉 새 상품'],
  ['banana',    'back_gate',     4200, 1800, 72, 60, 1, 'soon',  '문고리 거래', '미개봉 새 상품'],
  ['banana',    'student_union', 3800, 2500, 36, 30, 2, 'all',   '직거래', '미개봉 새 상품'],
  ['cola_500ml','main_gate',     2200,  900, 48, 20, 1, 'all',   '직거래', '미개봉 새 상품'],
  ['cola_500ml','back_gate',     2200, 1100, 72, 12, 1, 'night', '직거래', '미개봉 새 상품'],
  ['cola_500ml','dormitory',     2500,  800, 30, 20, 1, 'all',   '문고리 거래', '미개봉 새 상품'],
  ['cola_500ml','student_union', 2200, 1000, 60,  5, 2, 'soon',  '직거래', '미개봉 새 상품'],
  ['milk_1l',   'main_gate',     3300, 1300, 48, 30, 1, 'all',   '직거래', '미개봉 새 상품'],
  ['milk_1l',   'dormitory',     3300, 1500, 24, 18, 1, 'soon',  '직거래', '미개봉 새 상품'],
  ['milk_1l',   'back_gate',     3500, 1800, 72, 10, 1, 'late',  '직거래', '미개봉 새 상품'],
  ['milk_1l',   'student_union', 3200, 1200, 40, 25, 1, 'all',   '문고리 거래', '미개봉 새 상품'],
  ['cup_noodle','main_gate',     2200,  850, 96, 40, 2, 'all',   '직거래', '미개봉 새 상품'],
  ['cup_noodle','dormitory',     2100, 1000, 72, 20, 1, 'night', '문고리 거래', '미개봉 새 상품'],
  ['cup_noodle','back_gate',     2400, 1050, 96, 70, 3, 'all',   '직거래', '미개봉 새 상품'],
  ['cup_noodle','student_union', 1900,  800, 48, 12, 1, 'soon',  '직거래', '미개봉 새 상품'],
  ['shampoo',   'main_gate',     8900, 5000, 168, 30, 1, 'all',  '직거래', '미개봉 새 상품'],
  ['shampoo',   'dormitory',     8500, 6000, 120, 60, 1, 'all',  '문고리 거래', '개봉했지만 사용 안 함'],
  ['shampoo',   'back_gate',     9200, 4500, 168, 100, 1, 'late', '직거래', '미개봉 새 상품'],
  ['shampoo',   'student_union', 8900, 5500, 96, 10, 1, 'night', '직거래', '미개봉 새 상품'],
]

export const PRESENTATION_PRODUCTS = productRecords.map(([product_key, spotKey, original_price, min_price, saleHours, elapsed, quantity, win, trade_method, condition], index) => {
  const spot = findSpot(spotKey)
  const code = String.fromCharCode(65 + index) // A~T
  return {
    id: `presentation-p${String(index + 1).padStart(2, '0')}`,
    seller_id: `presentation-seller-${code}`, demo_seller: code,
    product_key, title: findItem(product_key).name,
    description: `판매자 ${code}의 시연용 판매글 · ${condition}`,
    original_price, min_price, quantity, trade_method, condition,
    created_at: at(-elapsed), expires_at: at(saleHours - elapsed),
    available_from: at(WINDOWS[win][0]), available_until: at(WINDOWS[win][1]),
    meetup_label: spot.label, latitude: spot.lat, longitude: spot.lng,
    status: 'active', image_path: null
  }
})

// [이름, 희망상품, 출발 장소, 최대 지불가격, 긴급도, 희망수량, 완료 거래, 종료된 전체 거래, 거래시간, 몇 시간 전 요청]
const buyerRecords = [
  ['학생01', 'banana', 'main_gate',       3500, 4, 1, 6, 6, 'all',   9],
  ['학생02', 'banana', 'dormitory',       3200, 5, 1, 0, 0, 'all',   8],
  ['학생03', 'banana', 'inha_station',    4000, 2, 1, 2, 5, 'all',   7],
  ['학생04', 'banana', 'back_gate',       2900, 3, 1, 3, 3, 'soon',  6],
  ['학생05', 'banana', 'juan',            4500, 5, 1, 8, 9, 'all',   5],
  ['학생06', 'banana', 'student_union',   3000, 1, 2, 1, 1, 'short', 4],
  ['학생07', 'cola_500ml', 'main_gate',   2000, 3, 1, 4, 4, 'all',   9],
  ['학생08', 'cola_500ml', 'back_gate',   1800, 4, 1, 0, 2, 'night', 8],
  ['학생09', 'cola_500ml', 'dormitory',   2200, 5, 1, 10, 10, 'all', 7],
  ['학생10', 'cola_500ml', 'yonghyeon_rooms', 2500, 2, 1, 1, 3, 'all', 6],
  ['학생11', 'cola_500ml', 'student_union', 1500, 3, 2, 2, 2, 'soon', 5],
  ['학생12', 'cola_500ml', 'inha_station', 2100, 1, 1, 0, 0, 'late', 4],
  ['학생13', 'milk_1l', 'dormitory',      3000, 4, 1, 5, 5, 'all',   9],
  ['학생14', 'milk_1l', 'main_gate',      2800, 5, 1, 0, 1, 'soon',  8],
  ['학생15', 'milk_1l', 'back_gate',      3500, 2, 1, 7, 8, 'late',  7],
  ['학생16', 'milk_1l', 'student_union',  3300, 3, 1, 2, 2, 'all',   6],
  ['학생17', 'milk_1l', 'juan',           3400, 4, 1, 1, 1, 'all',   5],
  ['학생18', 'milk_1l', 'yonghyeon_rooms', 2600, 1, 1, 3, 6, 'short', 4],
  ['학생19', 'cup_noodle', 'dormitory',   2000, 5, 2, 4, 4, 'night', 9],
  ['학생20', 'cup_noodle', 'main_gate',   1500, 3, 1, 0, 0, 'all',   8],
  ['학생21', 'cup_noodle', 'back_gate',   2200, 2, 3, 6, 7, 'all',   7],
  ['학생22', 'cup_noodle', 'inha_station', 1800, 4, 1, 1, 4, 'soon', 6],
  ['학생23', 'cup_noodle', 'student_union', 1900, 1, 1, 2, 2, 'all', 5],
  ['학생24', 'cup_noodle', 'juan',        2500, 5, 1, 9, 9, 'all',   4],
  ['학생25', 'shampoo', 'main_gate',      8000, 3, 1, 3, 3, 'all',   9],
  ['학생26', 'shampoo', 'dormitory',      9000, 2, 1, 0, 0, 'all',   8],
  ['학생27', 'shampoo', 'back_gate',      7000, 5, 1, 5, 6, 'late',  7],
  ['학생28', 'shampoo', 'student_union',  8500, 4, 1, 1, 3, 'night', 6],
  ['학생29', 'shampoo', 'yonghyeon_rooms', 9500, 1, 1, 12, 12, 'all', 5],
  ['학생30', 'shampoo', 'inha_station',   6000, 3, 1, 2, 2, 'soon',  4],
]

export const PRESENTATION_BUYERS = buyerRecords.map(([name, product_key, originKey, max_budget, urgency, quantity, completed_count, closed_count, win, ago], index) => {
  const spot = findSpot(originKey)
  return {
    id: `presentation-r${String(index + 1).padStart(2, '0')}`,
    buyer_id: `presentation-buyer-${index + 1}`, demo_buyer: name, nickname: name,
    product_key, max_budget, urgency, quantity, completed_count, closed_count,
    available_from: at(WINDOWS[win][0]), available_until: at(WINDOWS[win][1]),
    meetup_label: spot.label, latitude: spot.lat, longitude: spot.lng,
    created_at: at(-ago), status: 'open'
  }
})

// 발표 시나리오: 판매자 입장에서 상품 하나를 골라 추천 구매자 TOP 3 를 본다
export const PRESENTATION_SCENARIOS = [
  { id: 'presentation-p01', label: '시나리오 1 · 바나나 4,000→2,000원, 72시간 (보고서 5.3 예시)' },
  { id: 'presentation-p05', label: '시나리오 2 · 콜라 500mL (정문)' },
  { id: 'presentation-p09', label: '시나리오 3 · 우유 1L (정문)' },
  { id: 'presentation-p17', label: '시나리오 4 · 샴푸 (정문, 판매기간 7일)' },
]

export const PRESENTATION_LOADED_AT = LOAD
