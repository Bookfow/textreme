'use client'

import Link from 'next/link'
import { ArrowLeft, Zap } from 'lucide-react'

export default function PrivacyPage() {
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
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', marginBottom: 4 }}>개인정보처리방침</h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 40 }}>시행일: 2026년 3월 4일</p>

        <div style={sectionStyle}>
          <h2 style={h2Style}>1. 개인정보의 수집 및 이용 목적</h2>
          <p style={pStyle}>텍스트림(이하 &quot;회사&quot;)은 TeXTREME PDF to EPUB 변환 서비스(이하 &quot;서비스&quot;)를 제공함에 있어 다음의 목적을 위하여 최소한의 개인정보를 처리합니다.</p>
          <ul style={{ paddingLeft: 20, listStyle: 'disc' }}>
            <li style={liStyle}>결제 처리: 변환 서비스 이용에 따른 결제 처리 및 환불</li>
            <li style={liStyle}>서비스 제공: PDF 파일 변환 처리</li>
            <li style={liStyle}>고객 지원: 문의 처리 및 환불 요청 대응</li>
            <li style={liStyle}>서비스 개선: 이용 통계 분석 및 서비스 품질 향상</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>2. 수집하는 개인정보 항목</h2>
          <p style={pStyle}>서비스는 회원 가입 없이 이용할 수 있으며, 수집하는 개인정보는 최소화되어 있습니다.</p>
          <ul style={{ paddingLeft: 20, listStyle: 'disc' }}>
            <li style={liStyle}><strong style={{ color: '#fff' }}>결제 시 수집:</strong> 결제 수단 정보 (PG사를 통해 처리되며 회사는 카드번호를 직접 저장하지 않습니다)</li>
            <li style={liStyle}><strong style={{ color: '#fff' }}>자동 수집 항목:</strong> IP 주소, 브라우저 종류, 접속 로그, 기기 정보</li>
            <li style={liStyle}><strong style={{ color: '#fff' }}>환불 요청 시:</strong> 이메일 주소, 결제 내역</li>
          </ul>
          <div style={{ marginTop: 16, padding: '14px 18px', borderRadius: 10, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7 }}>
              <strong style={{ color: '#F59E0B' }}>파일 관련 안내</strong> — 이용자가 업로드하는 PDF 파일은 변환 처리 목적으로만 사용되며, 변환 완료 후 서버에서 즉시 삭제됩니다. 회사는 이용자의 파일 내용을 열람, 저장, 분석하지 않습니다.
            </p>
          </div>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>3. 개인정보의 보유 및 이용 기간</h2>
          <ul style={{ paddingLeft: 20, listStyle: 'disc' }}>
            <li style={liStyle}>결제 및 재화 공급 기록: 5년 (전자상거래법)</li>
            <li style={liStyle}>소비자 불만 또는 분쟁 처리 기록: 3년 (전자상거래법)</li>
            <li style={liStyle}>접속 로그: 3개월 (통신비밀보호법)</li>
            <li style={liStyle}>업로드된 PDF 파일: 변환 완료 즉시 삭제</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>4. 개인정보의 제3자 제공</h2>
          <p style={pStyle}>회사는 원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만, 다음의 경우에는 예외로 합니다.</p>
          <ul style={{ paddingLeft: 20, listStyle: 'disc' }}>
            <li style={liStyle}>법률에 특별한 규정이 있거나 법령상 의무를 준수하기 위하여 불가피한 경우</li>
            <li style={liStyle}>수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의 요구가 있는 경우</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>5. 개인정보 처리의 위탁</h2>
          <p style={pStyle}>회사는 원활한 서비스 제공을 위해 다음과 같이 개인정보 처리를 위탁하고 있습니다.</p>
          <div style={{ marginTop: 12, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', color: 'rgba(255,255,255,0.7)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>수탁 업체</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', color: 'rgba(255,255,255,0.7)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>위탁 업무</th>
                </tr>
              </thead>
              <tbody>
                <tr><td style={{ padding: '10px 16px', color: 'rgba(255,255,255,0.55)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>Vercel Inc.</td><td style={{ padding: '10px 16px', color: 'rgba(255,255,255,0.55)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>웹 호스팅 및 서버리스 함수</td></tr>
                <tr><td style={{ padding: '10px 16px', color: 'rgba(255,255,255,0.55)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>코리아포트원</td><td style={{ padding: '10px 16px', color: 'rgba(255,255,255,0.55)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>결제 연동 서비스 제공</td></tr>
                <tr><td style={{ padding: '10px 16px', color: 'rgba(255,255,255,0.55)' }}>Google (Gemini API)</td><td style={{ padding: '10px 16px', color: 'rgba(255,255,255,0.55)' }}>AI 기반 PDF 텍스트 추출</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>6. 이용자의 권리</h2>
          <p style={pStyle}>이용자는 다음과 같은 권리를 행사할 수 있습니다.</p>
          <ul style={{ paddingLeft: 20, listStyle: 'disc' }}>
            <li style={liStyle}>개인정보 열람, 정정, 삭제, 처리 정지 요구</li>
            <li style={liStyle}>결제 내역 조회</li>
          </ul>
          <p style={{ ...pStyle, marginTop: 8 }}>위 권리 행사는 이메일(privacy@textreme.co.kr)을 통해 요청할 수 있으며, 회사는 지체 없이 조치합니다.</p>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>7. 쿠키의 사용</h2>
          <ul style={{ paddingLeft: 20, listStyle: 'disc' }}>
            <li style={liStyle}><strong style={{ color: '#fff' }}>필수 쿠키:</strong> 서비스 정상 작동을 위한 기술적 쿠키</li>
            <li style={liStyle}><strong style={{ color: '#fff' }}>분석 쿠키:</strong> 서비스 이용 통계 (선택)</li>
          </ul>
          <p style={{ ...pStyle, marginTop: 8 }}>이용자는 브라우저 설정을 통해 쿠키 저장을 거부할 수 있으며, 이 경우 서비스 이용에 일부 제한이 있을 수 있습니다.</p>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>8. 개인정보의 안전성 확보 조치</h2>
          <ul style={{ paddingLeft: 20, listStyle: 'disc' }}>
            <li style={liStyle}>SSL/TLS 암호화 통신</li>
            <li style={liStyle}>결제 정보는 PG사가 관리 (회사 서버에 저장하지 않음)</li>
            <li style={liStyle}>업로드된 파일의 변환 완료 후 즉시 삭제</li>
            <li style={liStyle}>접근 권한 관리 및 최소화</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>9. 아동 개인정보 보호</h2>
          <p style={pStyle}>회사는 만 14세 미만 아동의 개인정보를 의도적으로 수집하지 않습니다.</p>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>10. 개인정보 보호책임자 및 사업자 정보</h2>
          <ul style={{ paddingLeft: 0, listStyle: 'none' }}>
            <li style={liStyle}><strong style={{ color: '#fff' }}>개인정보 보호책임자:</strong> TeXTREME 운영팀</li>
            <li style={liStyle}><strong style={{ color: '#fff' }}>연락처:</strong> privacy@textreme.co.kr</li>
          </ul>
          <div style={{ marginTop: 12, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', color: 'rgba(255,255,255,0.7)', borderBottom: '1px solid rgba(255,255,255,0.08)' }} colSpan={2}>사업자 정보</th>
                </tr>
              </thead>
              <tbody>
                <tr><td style={{ padding: '10px 16px', color: 'rgba(255,255,255,0.55)', borderBottom: '1px solid rgba(255,255,255,0.04)', fontWeight: 600 }}>상호</td><td style={{ padding: '10px 16px', color: 'rgba(255,255,255,0.55)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>텍스트림</td></tr>
                <tr><td style={{ padding: '10px 16px', color: 'rgba(255,255,255,0.55)', borderBottom: '1px solid rgba(255,255,255,0.04)', fontWeight: 600 }}>사업자등록번호</td><td style={{ padding: '10px 16px', color: 'rgba(255,255,255,0.55)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>653-33-01529</td></tr>
                <tr><td style={{ padding: '10px 16px', color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>업태/종목</td><td style={{ padding: '10px 16px', color: 'rgba(255,255,255,0.55)' }}>정보통신업 / 소프트웨어 개발 및 공급업</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>11. 권익 침해 구제 방법</h2>
          <p style={pStyle}>개인정보 침해에 대한 피해 구제, 상담 등이 필요하신 경우 다음 기관에 문의하실 수 있습니다.</p>
          <ul style={{ paddingLeft: 20, listStyle: 'disc' }}>
            <li style={liStyle}>개인정보분쟁조정위원회: (국번없이) 1833-6972 (www.kopico.go.kr)</li>
            <li style={liStyle}>개인정보침해신고센터: (국번없이) 118 (privacy.kisa.or.kr)</li>
            <li style={liStyle}>대검찰청 사이버수사과: (국번없이) 1301 (www.spo.go.kr)</li>
            <li style={liStyle}>경찰청 사이버안전국: (국번없이) 182 (cyberbureau.police.go.kr)</li>
          </ul>
        </div>

        <div style={{ paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>이 개인정보처리방침은 2026년 3월 4일부터 적용됩니다.</p>
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
