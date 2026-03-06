// ━━━ TeXTREME 이벤트 추적 ━━━
// 사용자 행동을 익명으로 추적하여 서비스 개선에 활용

function getVisitorId(): string {
  if (typeof window === 'undefined') return 'ssr'
  try {
    let id = localStorage.getItem('tx_vid')
    if (!id) {
      id = 'v_' + crypto.randomUUID()
      localStorage.setItem('tx_vid', id)
    }
    return id
  } catch {
    return 'v_' + Math.random().toString(36).slice(2, 10)
  }
}

function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr'
  try {
    let id = sessionStorage.getItem('tx_sid')
    if (!id) {
      id = 's_' + crypto.randomUUID()
      sessionStorage.setItem('tx_sid', id)
    }
    return id
  } catch {
    return 's_' + Math.random().toString(36).slice(2, 10)
  }
}

function getDeviceType(): string {
  if (typeof navigator === 'undefined') return 'unknown'
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'mobile' : 'desktop'
}

export function trackEvent(eventType: string, eventData: Record<string, any> = {}) {
  if (typeof window === 'undefined') return

  try {
    const payload = {
      visitorId: getVisitorId(),
      sessionId: getSessionId(),
      eventType,
      eventData,
      deviceType: getDeviceType(),
      referrer: document.referrer || '',
      userAgent: navigator.userAgent || '',
      pageUrl: window.location.pathname,
    }

    // fetch with keepalive — 페이지 이탈 시에도 전송 보장
    fetch('/api/admin/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {})
  } catch {
    // 추적 실패는 무시 — 서비스에 영향 없음
  }
}

// ━━━ 이벤트 타입 상수 ━━━
export const EVENTS = {
  // 퍼널
  PAGE_VIEW: 'page_view',
  FILE_UPLOAD: 'file_upload',
  COMPAT_CHECK: 'compat_check',
  WARN_PROCEED: 'warn_proceed',
  PRICING_VIEW: 'pricing_view',
  PAYMENT_START: 'payment_start',
  QUOTA_BLOCKED: 'quota_blocked',
  PAYMENT_COMPLETE: 'payment_complete',
  PAYMENT_CANCEL: 'payment_cancel',
  CONVERSION_START: 'conversion_start',
  CONVERSION_COMPLETE: 'conversion_complete',
  EPUB_DOWNLOAD: 'epub_download',

  // 뷰어
  VIEWER_OPEN: 'viewer_open',
  VIEWER_CLOSE: 'viewer_close',
  VIEWER_SETTING: 'viewer_setting',

  // 기타
  PWA_INSTALL: 'pwa_install',
} as const
