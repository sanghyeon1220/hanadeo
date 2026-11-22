import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
)

// 앱 설치(PWA): 배포된 사이트(https)에서만 서비스 워커를 등록합니다. 개발 서버에서는 등록하지 않아 캐시 때문에 헷갈리지 않게 합니다.
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('서비스 워커 등록 실패', err))
  })
}
