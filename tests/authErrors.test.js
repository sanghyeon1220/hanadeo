import test from 'node:test'
import assert from 'node:assert/strict'
import { authErrorMessage } from '../src/lib/authErrors.js'

test('틀린 이메일/비밀번호 → 한국어 안내, 두 칸 모두 표시',()=>{
  const m=authErrorMessage({code:'invalid_credentials',message:'Invalid login credentials'})
  assert.equal(m.text,'이메일 또는 비밀번호가 올바르지 않아요.')
  assert.deepEqual(m.fields,['email','password'])
})
test('code 없이 메시지만 와도 인식',()=>{
  assert.equal(authErrorMessage({message:'Invalid login credentials'}).text,'이메일 또는 비밀번호가 올바르지 않아요.')
})
test('이메일 미인증',()=>assert.equal(authErrorMessage({code:'email_not_confirmed'}).text,'아직 이메일 인증을 하지 않았어요.'))
test('이미 가입된 이메일',()=>assert.equal(authErrorMessage({code:'user_already_exists'}).text,'이미 가입된 이메일이에요.'))
test('짧은 비밀번호',()=>assert.deepEqual(authErrorMessage({code:'weak_password'}).fields,['password']))
test('요청 너무 많음',()=>assert.equal(authErrorMessage({code:'over_email_send_rate_limit'}).text,'짧은 시간에 너무 많이 시도했어요.'))
test('네트워크 오류',()=>assert.equal(authErrorMessage(new TypeError('Failed to fetch')).text,'서버에 연결하지 못했어요.'))
test('모르는 오류는 원문을 보조 설명으로',()=>{
  const m=authErrorMessage({message:'Something odd'})
  assert.equal(m.detail,'Something odd')
})
test('팀원 외 주소로 메일 발송 불가',()=>assert.equal(authErrorMessage({code:'email_address_not_authorized',message:'Email address not authorized'}).text,'이 이메일로는 인증 메일을 보낼 수 없어요.'))
