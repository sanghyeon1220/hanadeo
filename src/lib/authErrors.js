// Supabase 로그인·가입 오류를 알기 쉬운 한국어로 바꿈
// 보안상 Supabase는 '이메일이 틀렸는지 비밀번호가 틀렸는지' 구분해 알려주지 않습니다(가입 여부를 남이 알아낼 수 없게).
export function authErrorMessage(err) {
  const code = err?.code || ''
  const msg = String(err?.message || '').toLowerCase()
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials'))
    return { text: '이메일 또는 비밀번호가 올바르지 않아요.', detail: '가입할 때 쓴 이메일인지, 비밀번호 대소문자가 맞는지 확인해 주세요.', fields: ['email', 'password'] }
  if (code === 'email_not_confirmed' || msg.includes('email not confirmed'))
    return { text: '아직 이메일 인증을 하지 않았어요.', detail: '가입한 메일함(스팸함 포함)에서 인증 링크를 누른 뒤 다시 로그인해 주세요.', fields: ['email'] }
  if (code === 'user_already_exists' || code === 'email_exists' || msg.includes('already registered'))
    return { text: '이미 가입된 이메일이에요.', detail: '아래 로그인을 눌러 그 이메일로 로그인해 주세요.', fields: ['email'] }
  if (code === 'weak_password' || msg.includes('password should'))
    return { text: '비밀번호가 너무 짧거나 쉬워요.', detail: '6자 이상으로 입력해 주세요.', fields: ['password'] }
  if (code === 'validation_failed' || msg.includes('invalid format') || msg.includes('unable to validate email'))
    return { text: '이메일 형식이 올바르지 않아요.', detail: '예: name@example.com', fields: ['email'] }
  if (code.startsWith('over_') || msg.includes('rate limit'))
    return { text: '짧은 시간에 너무 많이 시도했어요.', detail: '잠시 후 다시 시도해 주세요. (인증 메일은 1시간에 보낼 수 있는 수가 정해져 있어요)', fields: [] }
  if (msg.includes('failed to fetch') || msg.includes('network'))
    return { text: '서버에 연결하지 못했어요.', detail: '인터넷 연결을 확인하고 다시 시도해 주세요.', fields: [] }
  return { text: '로그인 처리 중 문제가 생겼어요.', detail: err?.message || '', fields: [] }
}
