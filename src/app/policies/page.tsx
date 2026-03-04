'use client'

import Link from 'next/link'
import { FileText, Lock, Scale, ArrowLeft, Zap } from 'lucide-react'

const POLICY_LINKS = [
  { href: '/policies/terms', icon: FileText, label: '서비스 이용약관', desc: 'TeXTREME 변환 서비스 이용에 관한 약관' },
  { href: '/policies/privacy', icon: Lock, label: '개인정보처리방침', desc: '개인정보의 수집, 이용, 보호에 관한 정책' },
  { href: '/policies/copyright', icon: Scale, label: '저작권 및 면책', desc: 'PDF 변환 시 저작권 책임 및 면책 사항' },
]

export default function PoliciesPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#06060c', fontFamily: "'Noto Sans KR', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '48px 24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Zap size={20} color="#F59E0B" />
          <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 18, color: '#fff' }}>TeXTREME</span>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', marginBottom: 8 }}>정책 및 지침</h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 40 }}>TeXTREME PDF to EPUB 변환 서비스의 운영 정책</p>

        {/* Links */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {POLICY_LINKS.map(link => (
            <Link key={link.href} href={link.href} style={{ textDecoration: 'none' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 16, padding: '20px 24px',
                borderRadius: 14, background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                cursor: 'pointer', transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(245,158,11,0.3)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
              >
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(245,158,11,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <link.icon size={20} color="#F59E0B" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>{link.label}</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{link.desc}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>© 2026 텍스트림 · 사업자등록번호 653-33-01529</p>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>문의: support@textreme.io</p>
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 16, textDecoration: 'none' }}>
            <ArrowLeft size={14} /> 홈으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  )
}
