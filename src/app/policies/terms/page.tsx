'use client'

import Link from 'next/link'
import { ArrowLeft, Zap } from 'lucide-react'

export default function TermsPage() {
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
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', marginBottom: 4 }}>서비스 이용약관</h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 40 }}>시행일: 2026년 3월 4일</p>

        <div style={sectionStyle}>
          <h2 style={h2Style}>제1조 (목적)</h2>
          <p style={pStyle}>이 약관은 텍스트림(이하 &quot;회사&quot;)이 운영하는 TeXTREME PDF to EPUB 변환 서비스(이하 &quot;서비스&quot;)의 이용 조건 및 절차, 회사와 이용자 간의 권리·의무 및 책임 사항을 규정함을 목적으로 합니다.</p>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>제2조 (정의)</h2>
          <ul style={{ paddingLeft: 20, listStyle: 'disc' }}>
            <li style={liStyle}><strong style={{ color: '#fff' }}>&quot;서비스&quot;</strong>란 회사가 제공하는 PDF 파일을 EPUB 형식으로 변환하는 온라인 도구를 말합니다.</li>
            <li style={liStyle}><strong style={{ color: '#fff' }}>&quot;이용자&quot;</strong>란 이 약관에 따라 서비스를 이용하는 자를 말합니다.</li>
            <li style={liStyle}><strong style={{ color: '#fff' }}>&quot;변환&quot;</strong>이란 이용자가 업로드한 PDF 파일을 AI 엔진을 통해 EPUB 3.0 형식으로 재구성하는 과정을 말합니다.</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>제3조 (약관의 효력 및 변경)</h2>
          <ul style={{ paddingLeft: 20, listStyle: 'disc' }}>
            <li style={liStyle}>이 약관은 서비스 화면에 게시하거나 기타의 방법으로 이용자에게 공지함으로써 효력이 발생합니다.</li>
            <li style={liStyle}>회사는 합리적인 사유가 발생하면 약관을 변경할 수 있으며, 변경된 약관은 적용일자 7일 전부터 공지합니다.</li>
            <li style={liStyle}>이용자의 권리에 중대한 변경이 있는 경우 최소 30일 전에 공지합니다.</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>제4조 (서비스의 내용)</h2>
          <p style={pStyle}>회사는 다음과 같은 서비스를 제공합니다.</p>
          <ul style={{ paddingLeft: 20, listStyle: 'disc' }}>
            <li style={liStyle}>PDF 파일을 EPUB 3.0 형식으로 변환하는 유료 서비스</li>
            <li style={liStyle}>EPUB, TXT, DOCX, PDF 파일을 열어볼 수 있는 무료 뷰어 서비스</li>
            <li style={liStyle}>변환된 EPUB 파일의 기기 자동 저장</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>제5조 (이용 계약)</h2>
          <ul style={{ paddingLeft: 20, listStyle: 'disc' }}>
            <li style={liStyle}>서비스 이용은 별도의 회원 가입 없이 가능합니다.</li>
            <li style={liStyle}>PDF 변환 서비스를 이용하는 경우 결제 시점에 이 약관에 동의한 것으로 간주합니다.</li>
            <li style={liStyle}>무료 뷰어 서비스는 약관 동의 없이 이용할 수 있습니다.</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>제6조 (결제 및 가격)</h2>
          <ul style={{ paddingLeft: 20, listStyle: 'disc' }}>
            <li style={liStyle}>변환 서비스의 가격은 PDF 문서의 페이지 수에 따라 결정됩니다 (페이지당 ₩10, 100원 단위 내림, 최소 ₩500).</li>
            <li style={liStyle}>결제는 변환 시작 전에 이루어지며, 결제가 완료된 후 변환이 진행됩니다.</li>
            <li style={liStyle}>가격 정책은 사전 공지 후 변경될 수 있습니다.</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>제7조 (환불 정책)</h2>
          <ul style={{ paddingLeft: 20, listStyle: 'disc' }}>
            <li style={liStyle}><strong style={{ color: '#fff' }}>변환 실패 시:</strong> 기술적 문제로 변환이 완료되지 않은 경우, 전액 환불됩니다.</li>
            <li style={liStyle}><strong style={{ color: '#fff' }}>변환 완료 시:</strong> 변환이 완료되면 EPUB 파일이 이용자의 기기에 자동 저장되며, 이 시점부터 디지털 콘텐츠가 제공된 것으로 간주합니다. 디지털 콘텐츠의 특성상 제공 이후에는 청약 철회(환불)가 불가합니다.</li>
            <li style={liStyle}>이용자는 결제 전에 위 환불 불가 조건을 확인하고 동의한 것으로 간주됩니다.</li>
            <li style={liStyle}>본 환불 정책은 「전자상거래 등에서의 소비자보호에 관한 법률」 제17조 제2항 제5호(디지털 콘텐츠 제공 시 청약 철회 제한)에 근거합니다.</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>제8조 (파일 처리 및 보안)</h2>
          <ul style={{ paddingLeft: 20, listStyle: 'disc' }}>
            <li style={liStyle}>이용자가 업로드한 PDF 파일은 변환 목적으로만 사용되며, 변환 완료 후 서버에서 즉시 삭제됩니다.</li>
            <li style={liStyle}>회사는 이용자의 파일 내용을 열람, 저장, 공유하지 않습니다.</li>
            <li style={liStyle}>변환된 EPUB 파일은 이용자의 기기에 직접 다운로드되며, 회사 서버에 보관되지 않습니다.</li>
            <li style={liStyle}>모든 파일 전송은 SSL/TLS 암호화 통신을 통해 이루어집니다.</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>제9조 (저작권 및 이용자 책임)</h2>
          <ul style={{ paddingLeft: 20, listStyle: 'disc' }}>
            <li style={liStyle}>이용자는 본인이 저작권을 보유하거나 변환 권한이 있는 PDF 파일만 업로드해야 합니다.</li>
            <li style={liStyle}>타인의 저작권을 침해하는 파일의 변환으로 발생하는 모든 법적 책임은 이용자에게 있습니다.</li>
            <li style={liStyle}>회사는 이용자가 업로드한 파일의 저작권 적법성을 검증하지 않으며, 이에 대한 책임을 지지 않습니다.</li>
            <li style={liStyle}>자세한 사항은 <a href="/policies/copyright" style={{ color: '#F59E0B', textDecoration: 'underline' }}>저작권 및 면책</a> 페이지를 참고해주세요.</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>제10조 (금지 행위)</h2>
          <p style={pStyle}>이용자는 다음 행위를 해서는 안 됩니다.</p>
          <ul style={{ paddingLeft: 20, listStyle: 'disc' }}>
            <li style={liStyle}>타인의 저작권을 침해하는 파일의 변환</li>
            <li style={liStyle}>서비스를 이용한 불법 행위</li>
            <li style={liStyle}>서비스의 정상적인 운영을 방해하는 행위</li>
            <li style={liStyle}>자동화된 수단을 이용한 대량 변환 요청</li>
            <li style={liStyle}>결제 시스템을 악용하는 행위</li>
            <li style={liStyle}>악성코드가 포함된 파일의 업로드</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>제11조 (서비스 변경 및 중단)</h2>
          <ul style={{ paddingLeft: 20, listStyle: 'disc' }}>
            <li style={liStyle}>회사는 서비스를 개선하거나 운영상의 이유로 서비스의 전부 또는 일부를 변경하거나 중단할 수 있습니다.</li>
            <li style={liStyle}>서비스 중단 시 진행 중인 변환 건에 대해서는 환불 처리됩니다.</li>
            <li style={liStyle}>천재지변, 불가항력적 사유로 인한 서비스 중단의 경우 사전 공지가 불가능할 수 있습니다.</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>제12조 (면책 조항)</h2>
          <ul style={{ paddingLeft: 20, listStyle: 'disc' }}>
            <li style={liStyle}>회사는 변환 결과물의 원본 대비 100% 정확성을 보증하지 않습니다. PDF의 구조, 폰트, 이미지 등에 따라 변환 품질이 달라질 수 있습니다.</li>
            <li style={liStyle}>회사는 이용자가 변환된 파일을 사용함으로써 발생하는 손해에 대해 책임지지 않습니다.</li>
            <li style={liStyle}>회사는 천재지변, 불가항력적 사유로 인한 서비스 중단에 대해 책임지지 않습니다.</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>제13조 (준거법 및 관할법원)</h2>
          <p style={pStyle}>이 약관의 해석 및 분쟁에 관하여는 대한민국 법률을 적용하며, 분쟁이 발생하는 경우 서울중앙지방법원을 제1심 전속 관할법원으로 합니다.</p>
        </div>

        <div style={{ paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>부칙: 이 약관은 2026년 3월 4일부터 시행합니다.</p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>약관에 관한 문의: support@textreme.co.kr</p>
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
