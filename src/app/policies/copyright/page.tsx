'use client'

import Link from 'next/link'
import { ArrowLeft, Zap } from 'lucide-react'

export default function CopyrightPage() {
  const sectionStyle = { marginBottom: 32 }
  const h2Style = { fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 12 } as const
  const pStyle = { fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 1.8 } as const
  const liStyle = { fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 1.8, marginBottom: 4 } as const

  return (
    <div style={{ minHeight: '100vh', background: '#06060c', fontFamily: "'Noto Sans KR', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '48px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Zap size={20} color="#F59E0B" />
          <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 18, color: '#fff' }}>TeXTREME</span>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', marginBottom: 4 }}>저작권 및 면책</h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 40 }}>최종 업데이트: 2026년 3월 4일</p>

        <div style={sectionStyle}>
          <h2 style={h2Style}>서비스의 성격</h2>
          <p style={pStyle}>TeXTREME는 이용자가 소유하거나 이용 권한이 있는 PDF 파일을 EPUB 형식으로 변환하는 도구입니다. TeXTREME는 콘텐츠를 호스팅·배포·공유하는 플랫폼이 아니며, 변환된 파일은 이용자의 기기에 직접 저장됩니다.</p>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>이용자의 저작권 책임</h2>
          <div style={{ padding: '16px 20px', borderRadius: 12, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', marginBottom: 16 }}>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 1.7 }}>
              <strong style={{ color: '#ef4444' }}>중요</strong> — 이용자는 본인이 저작권을 보유하거나, 저작권자로부터 변환 권한을 부여받은 PDF 파일만 변환해야 합니다. 타인의 저작권을 침해하는 파일의 변환으로 인해 발생하는 모든 법적 책임은 이용자에게 있습니다.
            </p>
          </div>
          <p style={pStyle}>다음과 같은 경우에 변환이 허용됩니다:</p>
          <ul style={{ paddingLeft: 20, listStyle: 'disc' }}>
            <li style={liStyle}>본인이 직접 작성한 문서</li>
            <li style={liStyle}>저작권자로부터 변환 허가를 받은 문서</li>
            <li style={liStyle}>저작권 보호 기간이 만료된 공개 도메인 문서</li>
            <li style={liStyle}>크리에이티브 커먼즈 등 자유 이용이 허락된 문서</li>
            <li style={liStyle}>개인적 용도의 합법적 백업 변환</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>회사의 면책</h2>
          <ul style={{ paddingLeft: 20, listStyle: 'disc' }}>
            <li style={liStyle}>회사는 이용자가 업로드한 파일의 저작권 적법성을 사전에 검증하지 않으며, 이에 대한 책임을 지지 않습니다.</li>
            <li style={liStyle}>회사는 변환 도구를 제공할 뿐이며, 변환 결과물의 이용 방법 및 그로 인한 결과에 대해 책임지지 않습니다.</li>
            <li style={liStyle}>회사는 저작권 침해 행위에 대해 관련 법률에 따라 협조할 의무가 있으며, 법적 요청이 있을 경우 관련 정보를 제공할 수 있습니다.</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>파일 처리 정책</h2>
          <ul style={{ paddingLeft: 20, listStyle: 'disc' }}>
            <li style={liStyle}>업로드된 PDF 파일은 변환 처리 목적으로만 사용됩니다.</li>
            <li style={liStyle}>변환 완료 후 업로드된 원본 파일은 서버에서 즉시 삭제됩니다.</li>
            <li style={liStyle}>변환된 EPUB 파일은 서버에 보관되지 않으며, 이용자의 기기에 직접 다운로드됩니다.</li>
            <li style={liStyle}>회사는 어떤 형태로든 이용자의 파일 내용을 열람, 복제, 배포하지 않습니다.</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>저작권 침해 신고</h2>
          <p style={pStyle}>TeXTREME 서비스가 저작권 침해에 이용되고 있다고 판단되는 경우, 다음 정보를 포함하여 신고해주세요:</p>
          <ul style={{ paddingLeft: 20, listStyle: 'disc' }}>
            <li style={liStyle}>저작권자 또는 권한 위임자의 성명 및 연락처</li>
            <li style={liStyle}>침해된 저작물에 대한 설명</li>
            <li style={liStyle}>침해 사실을 확인할 수 있는 증거</li>
          </ul>
          <p style={{ ...pStyle, marginTop: 12 }}>신고 접수: <strong style={{ color: '#F59E0B' }}>copyright@textreme.co.kr</strong></p>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>변환 결과물의 품질</h2>
          <p style={pStyle}>TeXTREME는 AI 기반 변환 엔진을 사용하여 최대한 정확한 변환 결과를 제공하기 위해 노력합니다. 그러나 다음 사항을 유의해주세요:</p>
          <ul style={{ paddingLeft: 20, listStyle: 'disc' }}>
            <li style={liStyle}>PDF 원본의 구조, 폰트, 레이아웃에 따라 변환 품질이 달라질 수 있습니다.</li>
            <li style={liStyle}>이미지 위주의 PDF, 스캔본 PDF 등은 텍스트 추출이 제한될 수 있습니다.</li>
            <li style={liStyle}>변환 결과물이 원본과 100% 동일함을 보증하지 않습니다.</li>
          </ul>
        </div>

        <div style={{ paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>문의: copyright@textreme.co.kr</p>
        </div>

        <div style={{ marginTop: 40, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <Link href="/policies" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>
            <ArrowLeft size={14} /> 정책 목록으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  )
}
