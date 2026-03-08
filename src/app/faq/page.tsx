'use client'

import { useState } from "react"
import Link from "next/link"
import { Zap, ArrowLeft } from "lucide-react"

const fontLink = `@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;900&family=Outfit:wght@600;700;800;900&display=swap');`

const globalStyles = `
${fontLink}
* { margin: 0; padding: 0; box-sizing: border-box; }
`

interface FaqItem {
  q: string
  a: string
}

interface FaqSection {
  title: string
  icon: string
  items: FaqItem[]
}

const FAQ_DATA: FaqSection[] = [
  {
    title: "변환 관련",
    icon: "🔄",
    items: [
      {
        q: "EPUB이 뭔가요? PDF와 뭐가 다른가요?",
        a: "EPUB은 전자책 표준 포맷으로, 화면 크기에 맞춰 텍스트가 자동으로 재배치(리플로우)됩니다. PDF는 인쇄용이라 모바일에서 읽기 불편하지만, EPUB은 글자 크기·줄간격을 자유롭게 조절할 수 있어 스마트폰에서도 편안하게 읽을 수 있습니다."
      },
      {
        q: "어떤 PDF가 변환 가능한가요?",
        a: "텍스트 기반 PDF(소설, 에세이, 보고서, 교재 등)가 가장 잘 변환됩니다. 이미지나 표가 포함된 PDF도 지원합니다. 단, 스캔본 PDF, 500p 초과, 비밀번호 보호 PDF는 변환할 수 없습니다."
      },
      {
        q: "변환에 얼마나 걸리나요?",
        a: "페이지당 약 1~2초입니다. 300페이지 책 기준 약 5분 내외로 완료됩니다."
      },
      {
        q: "변환된 EPUB의 품질은 어느 정도인가요?",
        a: "AI 비전 엔진이 페이지를 직접 분석하여 제목·본문·인용·리스트 등 문서 구조를 정확하게 변환합니다. 한글 인식률 99%+ 이상이며, 조사·어미·띄어쓰기까지 정밀하게 처리합니다."
      },
      {
        q: "이미지나 표도 변환되나요?",
        a: "네, PDF 내의 이미지와 표를 자동으로 감지하여 원본 위치 그대로 EPUB에 배치합니다."
      },
      {
        q: "스캔본 PDF는 왜 변환이 안 되나요?",
        a: "스캔본 PDF는 텍스트가 아닌 전체가 이미지로 구성되어 있어 AI가 정확한 텍스트를 추출하기 어렵습니다. 텍스트림은 최고 품질의 변환만을 제공하기 때문에, 품질이 보장되지 않는 스캔본은 변환을 시도하지 않습니다."
      },
      {
        q: "500페이지 제한은 왜 있나요?",
        a: "변환 속도와 안정성을 보장하기 위한 제한입니다. 500페이지 이하에서 가장 안정적이고 빠른 변환 품질을 제공할 수 있습니다."
      },
    ]
  },
  {
    title: "결제 관련",
    icon: "💳",
    items: [
      {
        q: "변환 비용은 얼마인가요?",
        a: "페이지당 ₩9(런칭 이벤트 가격)이며, 100원 단위로 내림 처리됩니다. 최소 결제 금액은 ₩500입니다. 예를 들어 142페이지 자기계발서는 ₩1,200입니다."
      },
      {
        q: "변환 결과가 마음에 안 들면 환불되나요?",
        a: "변환 전 AI가 PDF 호환성을 자동 검증하여, 품질이 보장되지 않는 PDF는 결제 자체가 진행되지 않습니다. 그래도 문제가 있으시면 support@textreme.co.kr로 연락해주세요."
      },
      {
        q: "어떤 결제 수단을 지원하나요?",
        a: "토스페이먼츠를 통해 신용카드, 체크카드, 간편결제(토스페이, 카카오페이, 네이버페이 등) 등 다양한 결제 수단을 지원합니다."
      },
      {
        q: "결제 전에 미리 확인할 수 있나요?",
        a: "네, PDF를 업로드하면 AI가 자동으로 호환성을 검증합니다. 스캔본이거나 변환이 어려운 PDF는 결제 전에 안내해드리므로, 불필요한 결제가 발생하지 않습니다."
      },
    ]
  },
  {
    title: "사용 관련",
    icon: "📱",
    items: [
      {
        q: "변환된 EPUB은 어디서 읽을 수 있나요?",
        a: "EPUB 3.0 표준을 준수하므로, 교보eBook, 리디, Apple Books, Google Play 북, Kobo 등 대부분의 전자책 앱에서 바로 열어 읽을 수 있습니다. 텍스트림 자체 뷰어에서도 바로 미리보기가 가능합니다."
      },
      {
        q: "회원가입이 필요한가요?",
        a: "아니요, 회원가입 없이 바로 사용할 수 있습니다. PDF를 업로드하고 결제하면 즉시 변환이 시작됩니다."
      },
      {
        q: "변환한 파일은 서버에 저장되나요?",
        a: "아니요, 업로드된 PDF는 변환 처리 후 즉시 삭제됩니다. 변환된 EPUB은 사용자 기기에 직접 다운로드되며, 서버에 보관되지 않습니다."
      },
      {
        q: "모바일에서도 사용할 수 있나요?",
        a: "네, 모바일 브라우저에서 그대로 사용할 수 있습니다. 웹앱으로 설치하면 앱처럼 더 편리하게 이용할 수 있습니다."
      },
      {
        q: "웹앱 설치는 어떻게 하나요?",
        a: "사이트 하단의 '웹앱으로 설치' 버튼을 누르면 홈 화면에 추가됩니다. 설치 후에는 일반 앱처럼 아이콘을 눌러 바로 실행할 수 있습니다."
      },
    ]
  },
  {
    title: "저작권 · 보안",
    icon: "🔒",
    items: [
      {
        q: "내 PDF 파일이 안전하게 처리되나요?",
        a: "업로드된 파일은 변환 처리 후 즉시 삭제되며, 서버에 보관되지 않습니다. 변환된 EPUB은 사용자 기기에 직접 다운로드되며, 모든 전송은 SSL/TLS 암호화를 통해 이루어집니다."
      },
      {
        q: "저작권이 있는 PDF도 변환할 수 있나요?",
        a: "이용자 본인이 저작권을 보유하거나 변환 권한이 있는 PDF만 업로드해야 합니다. 타인의 저작권을 침해하는 파일의 변환으로 발생하는 모든 법적 책임은 이용자에게 있습니다."
      },
    ]
  },
]

function AccordionItem({ q, a, open, onClick }: { q: string; a: string; open: boolean; onClick: () => void }) {
  return (
    <div style={{
      borderRadius: 14,
      background: open ? "rgba(245,158,11,0.04)" : "rgba(255,255,255,0.03)",
      border: open ? "1px solid rgba(245,158,11,0.2)" : "1px solid rgba(255,255,255,0.08)",
      transition: "all 0.25s ease",
      overflow: "hidden",
    }}>
      <button onClick={onClick} style={{
        width: "100%", padding: "18px 20px", display: "flex", alignItems: "center",
        justifyContent: "space-between", background: "none", border: "none",
        cursor: "pointer", textAlign: "left" as const, gap: 12,
      }}>
        <span style={{ color: "#fff", fontSize: 15, fontWeight: 600, lineHeight: 1.5 }}>{q}</span>
        <span style={{
          color: open ? "#F59E0B" : "rgba(255,255,255,0.3)", fontSize: 20, fontWeight: 300,
          transition: "transform 0.25s ease", transform: open ? "rotate(45deg)" : "rotate(0deg)",
          flexShrink: 0,
        }}>+</span>
      </button>
      <div style={{
        maxHeight: open ? 400 : 0, overflow: "hidden",
        transition: "max-height 0.3s ease, padding 0.3s ease",
        padding: open ? "0 20px 18px" : "0 20px 0",
      }}>
        <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, lineHeight: 1.8 }}>{a}</p>
      </div>
    </div>
  )
}

export default function FaqPage() {
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({})

  const toggleKey = (key: string) => {
    setOpenMap(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div style={{ minHeight: "100vh", background: "#06060c", fontFamily: "'Noto Sans KR', sans-serif" }}>
      <style dangerouslySetInnerHTML={{ __html: globalStyles }} />

      {/* 헤더 */}
      <header style={{
        padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        maxWidth: 800, margin: "0 auto",
      }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
          <ArrowLeft size={18} color="rgba(255,255,255,0.5)" />
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, fontWeight: 500 }}>돌아가기</span>
        </Link>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
          <Zap size={16} color="#F59E0B" />
          <span style={{ fontFamily: "'Outfit'", fontWeight: 700, fontSize: 14, color: "rgba(255,255,255,0.55)" }}>TeXTREME</span>
        </Link>
      </header>

      {/* 타이틀 */}
      <div style={{ padding: "48px 24px 16px", textAlign: "center" }}>
        <h1 style={{ color: "#fff", fontWeight: 800, fontSize: 32, letterSpacing: "-0.02em", marginBottom: 8 }}>
          자주 묻는 질문
        </h1>
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 15 }}>
          궁금한 점을 빠르게 확인하세요
        </p>
      </div>

      {/* FAQ 섹션들 */}
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "24px 24px 60px" }}>
        {FAQ_DATA.map((section, si) => (
          <div key={si} style={{ marginBottom: 40 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 20 }}>{section.icon}</span>
              <h2 style={{ color: "#fff", fontSize: 18, fontWeight: 700 }}>{section.title}</h2>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {section.items.map((item, qi) => {
                const key = `${si}-${qi}`
                return (
                  <AccordionItem key={key} q={item.q} a={item.a}
                    open={!!openMap[key]}
                    onClick={() => toggleKey(key)}
                  />
                )
              })}
            </div>
          </div>
        ))}

        {/* 하단 CTA */}
        <div style={{ textAlign: "center", padding: "40px 0 0" }}>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginBottom: 16 }}>
            더 궁금한 점이 있으신가요?
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" as const }}>
            <Link href="/" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "12px 24px", borderRadius: 12,
              background: "linear-gradient(135deg, #F59E0B, #D97706)",
              color: "#000", fontWeight: 700, fontSize: 15, textDecoration: "none",
            }}>
              PDF → EPUB 변환하러 가기
            </Link>
            <a href="mailto:support@textreme.co.kr" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "12px 24px", borderRadius: 12,
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.7)", fontWeight: 600, fontSize: 15, textDecoration: "none",
            }}>
              이메일 문의
            </a>
          </div>
        </div>
      </div>

      {/* 푸터 */}
      <footer style={{ padding: "24px", borderTop: "1px solid rgba(255,255,255,0.05)", textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
          <Zap size={14} color="#F59E0B" />
          <span style={{ fontFamily: "'Outfit'", fontWeight: 700, fontSize: 13, color: "rgba(255,255,255,0.35)" }}>TeXTREME</span>
        </div>
      </footer>
    </div>
  )
}
