'use client'

import { useState, useRef, useEffect, useCallback } from "react"
import { Upload, FileText, Zap, Download, Check, BookOpen, Smartphone, Globe, ArrowRight, X, Type, Eye, CheckCircle2 } from "lucide-react"
import DemoReader from "@/components/demo-reader"
import EpubViewerLite from "@/components/epub-viewer-lite"
import { convertTxtToEpub, convertDocxToEpub } from "@/lib/text-to-epub"

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TeXTREME — Landing + Demo + Convert + Complete
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PRICE_PER_PAGE = 10

const PRICE_EXAMPLES = [
  { pages: 50, display: "50p 소책자" },
  { pages: 142, display: "142p 자기계발서" },
  { pages: 300, display: "300p 전공서적" },
  { pages: 500, display: "500p 기술서적" },
]

const SAMPLE_CHAPTERS = [
  {
    title: "1장 디자이너의 날갯짓이 불러일으킨 태풍",
    paragraphs: [
      "영국의 식민지였던 인도에는 코브라가 너무 많아서 실행된 정책이 하나 있다. 코브라를 잡아 오면 보상금을 주는 정책이다. 이 정책을 실행한 초반에는 코브라가 줄어드는 듯했지만, 나중에는 돈을 벌기 위해 일부러 코브라를 번식시키는 사람들이 생겨났다.",
      "이 사실을 알게 된 영국 정부는 보상 정책을 중단했다. 그러자 코브라 사육자들은 가치가 없어진 코브라를 몽땅 풀어버렸다. 결과적으로 정책을 시행하기 전보다 더 많은 야생 코브라가 사람들의 생명을 위협하는 상황이 벌어졌다.",
      "20세기 초, 프랑스의 식민지였던 베트남 하노이에서도 비슷한 일이 있었다. 여기서는 '쥐 없애기' 정책을 시행했는데, 코브라 정책과 마찬가지로 쥐를 잡아서 죽이고 그 꼬리를 가져오면 보상금을 주는 제도였다.",
      "하지만 보상금 사냥꾼들은 쥐를 죽인 뒤 몸통은 버리고 꼬리만 잘라 제출했다. 더 나아가 일부는 꼬리만 자르고 쥐를 다시 풀어주어 번식하게 만들었다. 심지어 쥐를 직접 사육하는 농장까지 등장했다. 이것이 바로 '코브라 효과'라 불리는 현상이다.",
    ]
  },
  {
    title: "2장 들어올 때는 마음대로였겠지만 나갈 때는 아니다",
    paragraphs: [
      "오후 6시 반, 문자 알림음이 울린다. 'OO카드 8*4* 승인 23,100원 일시불'. 무언가 이상하다. 카드 주인인 나는 지금 집에서 저녁 메뉴를 고민하고 있는데, 결제 알림이라니?",
      "급하게 가방을 뒤적거려보니 다행히 카드를 잃어버리진 않았다. 설마 해킹당한 건가? 결제된 곳은 '엔에이치엔 케이씨피(NHN KCP)'. 네이버에 검색해 보니 지식인에 비슷한 상황의 사람들이 많이 보였다.",
      "알고 보니 이것은 무료 체험 후 자동 결제되는 구독 서비스였다. 3일 무료 체험에 가입했던 것이 잊혀진 채 유료로 전환된 것이다. 이런 패턴을 '다크 패턴'이라 부른다.",
      "다크 패턴은 사용자를 속여 의도하지 않은 행동을 하게 만드는 인터페이스 디자인이다. 구독 취소 버튼을 찾기 어렵게 숨기거나, 해지 과정을 복잡하게 만드는 것이 대표적이다.",
    ]
  },
  {
    title: "3장 좋은 디자인의 조건",
    paragraphs: [
      "디터 람스는 1960년대부터 브라운(Braun)의 수석 디자이너로 일하며 '좋은 디자인의 10가지 원칙'을 정립했다. 그 첫 번째 원칙은 '좋은 디자인은 혁신적이다'라는 것이다.",
      "두 번째 원칙은 '좋은 디자인은 제품을 유용하게 만든다'이다. 아무리 아름다워도 쓸모없는 제품은 좋은 디자인이 아니다. 디자인은 기능에 봉사해야 한다.",
      "세 번째 원칙은 '좋은 디자인은 미적이다'. 제품의 심미성은 사용성에 직접적인 영향을 미친다. 사람들은 아름다운 것을 더 잘 사용하고, 더 오래 사용한다.",
      "네 번째와 다섯 번째 원칙은 '좋은 디자인은 제품을 이해하기 쉽게 만든다'와 '좋은 디자인은 눈에 띄지 않는다'이다. 최고의 디자인은 사용자가 디자인의 존재를 의식하지 못할 때 달성된다.",
      "이 원칙들은 반세기가 지난 지금도 유효하다. 애플의 조나단 아이브는 람스의 영향을 깊이 받았으며, 아이폰의 디자인 철학에도 이 원칙들이 녹아 있다.",
    ]
  },
  {
    title: "4장 사용자 경험의 재발견",
    paragraphs: [
      "1998년, 구글은 검색 페이지에서 모든 장식을 제거했다. 당시 야후와 알타비스타가 포털 사이트로 진화하며 화면을 온갖 링크와 광고로 채우고 있을 때, 구글은 텅 빈 하얀 화면에 검색창 하나만 놓았다.",
      "이것은 단순한 미니멀리즘이 아니었다. 사용자가 검색 엔진에 오는 단 하나의 이유, 즉 '무언가를 찾기 위해'라는 본질에 집중한 결정이었다. 불필요한 것을 전부 걷어낸 것이다.",
      "같은 원리가 모바일 독서 경험에도 적용된다. 종이책의 경험을 디지털로 옮길 때, 가장 중요한 것은 텍스트 그 자체다. 글꼴, 여백, 줄간격 — 이 세 가지가 완벽하면 나머지는 부수적이다.",
      "PDF는 인쇄를 위한 포맷이다. A4 용지에 최적화된 레이아웃을 5인치 화면에서 읽는 것은, 축소된 포스터를 돋보기로 읽는 것과 다르지 않다. 리플로우 가능한 EPUB이 모바일 독서의 답인 이유가 여기에 있다.",
    ]
  },
  {
    title: "5장 작은 변화가 만드는 큰 차이",
    paragraphs: [
      "영국 정부의 행동경제학팀(BIT, Behavioural Insights Team)은 세금 체납자에게 보내는 독촉장의 문구를 약간 바꿨다. '당신 동네의 대부분 사람들은 이미 세금을 냈습니다'라는 한 줄을 추가한 것이다.",
      "이 작은 문구 변경으로 세금 납부율이 15% 상승했다. 사회적 증거(Social Proof)라는 심리적 원리가 작동한 것이다. 사람들은 다른 사람들이 하는 행동을 따라하려는 본능이 있다.",
      "비슷한 원리로, 호텔의 수건 재사용 안내문에 '이 방의 이전 투숙객 75%가 수건을 재사용했습니다'라고 적으면 재사용률이 크게 오른다. 환경 보호를 호소하는 것보다 훨씬 효과적이다.",
      "넛지(Nudge)는 이런 작은 디자인 변화가 사람들의 행동을 변화시킨다는 이론이다. 선택의 자유는 유지하면서도, 환경을 디자인하여 더 나은 결정을 유도할 수 있다.",
      "카페테리아에서 과일을 눈높이에 놓고, 디저트를 뒤쪽으로 옮기는 것만으로 건강한 식사 선택이 25% 늘어났다는 연구 결과는 넛지의 대표적 사례다.",
    ]
  },
  {
    title: "6장 미래를 설계하는 사람들",
    paragraphs: [
      "2007년 1월, 스티브 잡스는 맥월드에서 아이폰을 공개하며 말했다. '오늘, 애플은 전화를 재발명합니다.' 그리고 실제로 그렇게 되었다. 아이폰 이전과 이후의 휴대전화는 완전히 다른 물건이다.",
      "하지만 아이폰의 혁신은 하드웨어에 있지 않았다. 멀티터치 인터페이스, 즉 손가락으로 직접 콘텐츠를 조작한다는 패러다임 전환이 핵심이었다. 버튼이 사라지고, 화면이 곧 인터페이스가 되었다.",
      "이와 같이, 전자책 독서 경험도 패러다임 전환이 필요하다. PDF를 그대로 모바일에 옮기는 것은 피처폰의 인터페이스를 터치스크린에 올리는 것과 같다. 콘텐츠가 기기에 맞춰 흘러야 한다.",
      "텍스트가 화면 크기에 따라 자연스럽게 리플로우되고, 독자가 글꼴과 크기를 자유롭게 조절하며, 형광펜과 메모가 종이책처럼 자연스러운 — 그런 디지털 독서 경험이 우리가 만들고자 하는 것이다.",
    ]
  },
]

type ViewType = "landing" | "demo" | "pricing" | "converting" | "complete" | "viewer"

interface ExtractedText { page: number; text: string }

const fontLink = `@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;900&family=Outfit:wght@600;700;800;900&display=swap');`

const globalStyles = `
${fontLink}
* { margin: 0; padding: 0; box-sizing: border-box; }
@keyframes float { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-12px); } }
@keyframes fadeUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
@keyframes pulse-ring { 0% { transform: scale(0.9); opacity: 0.5; } 100% { transform: scale(1.4); opacity: 0; } }
@keyframes slideText { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes checkPop { 0% { transform: scale(0); opacity: 0; } 50% { transform: scale(1.2); } 100% { transform: scale(1); opacity: 1; } }
.fade-up { animation: fadeUp 0.8s ease-out both; }
.fade-up-d1 { animation: fadeUp 0.8s ease-out 0.1s both; }
.fade-up-d2 { animation: fadeUp 0.8s ease-out 0.2s both; }
.fade-up-d3 { animation: fadeUp 0.8s ease-out 0.3s both; }
.fade-up-d4 { animation: fadeUp 0.8s ease-out 0.4s both; }
.fade-up-d5 { animation: fadeUp 0.8s ease-out 0.5s both; }
.slide-text { animation: slideText 0.4s ease-out both; }
.glow-amber { box-shadow: 0 0 40px rgba(245,158,11,0.15), 0 0 80px rgba(245,158,11,0.05); }
.check-pop { animation: checkPop 0.5s ease-out both; }
.card-hover { transition: transform 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease; cursor: default; }
.card-hover:hover { transform: translateY(-4px); border-color: rgba(245,158,11,0.25) !important; box-shadow: 0 8px 24px rgba(245,158,11,0.08); }
.icon-float { transition: transform 0.3s ease; display: inline-flex; }
.card-hover:hover .icon-float { transform: translateY(-2px) scale(1.1); }
.btn-glow { transition: all 0.25s ease; }
.btn-glow:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(245,158,11,0.2); border-color: rgba(245,158,11,0.5) !important; }
.step-card { transition: transform 0.25s ease, box-shadow 0.25s ease; }
.step-card:hover { transform: translateY(-6px); box-shadow: 0 12px 32px rgba(0,0,0,0.3); }
@keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
.shimmer-text { background: linear-gradient(90deg, #F59E0B 30%, #fde68a 50%, #F59E0B 70%); background-size: 200% auto; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; animation: shimmer 3s linear infinite; }
.compare-glow { transition: all 0.3s ease; }
.compare-glow:hover { box-shadow: 0 8px 32px rgba(34,197,94,0.12); transform: translateY(-2px); }
@keyframes attention { 0%,100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(245,158,11,0.3); } 50% { transform: scale(1.03); box-shadow: 0 0 20px 4px rgba(245,158,11,0.15); } }
.demo-attention-btn { animation: attention 2.5s ease-in-out infinite; transition: all 0.2s; }
.demo-attention-btn:hover { animation: none; transform: translateY(-2px); box-shadow: 0 6px 24px rgba(245,158,11,0.25); border-color: rgba(245,158,11,0.6) !important; }
.compare-grid { display: grid; grid-template-columns: 1fr; gap: 24px; max-width: 280px; margin: 0 auto; }
@media (min-width: 640px) { .compare-grid { grid-template-columns: 1fr 1fr; max-width: 100%; } }
`

function calcPrice(pages: number): number {
  return Math.max(500, Math.floor((pages * PRICE_PER_PAGE) / 100) * 100)
}

export default function TeXTREME() {
  const [view, setView] = useState<ViewType>("landing")
  const [file, setFile] = useState<File | null>(null)
  const [fileName, setFileName] = useState("")
  const [filePages, setFilePages] = useState(0)
  const [progress, setProgress] = useState(0)
  const [currentPage, setCurrentPage] = useState(0)
  const [extractedTexts, setExtractedTexts] = useState<ExtractedText[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [isPwaInstalled, setIsPwaInstalled] = useState(false)
  const demoSectionRef = useRef<HTMLDivElement>(null)
  const [epubUrl, setEpubUrl] = useState<string | null>(null)

  // ━━━ PWA install prompt ━━━
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsPwaInstalled(true)
    }
    const handler = (e: Event) => { e.preventDefault(); setDeferredPrompt(e) }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstallPwa = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const result = await deferredPrompt.userChoice
    if (result.outcome === 'accepted') setIsPwaInstalled(true)
    setDeferredPrompt(null)
  }

  // ━━━ Conversion simulation ━━━
  const startConversion = useCallback((pages: number) => {
    setView("converting")
    setProgress(0)
    setCurrentPage(0)
    setExtractedTexts([])

    let p = 0
    let page = 0
    const totalSteps = 60
    const pageInterval = Math.max(1, Math.floor(totalSteps / Math.min(pages, 30)))

    progressInterval.current = setInterval(() => {
      p += 1 + Math.random() * 2
      page += 1
      if (p >= 100) {
        p = 100
        if (progressInterval.current) clearInterval(progressInterval.current)
        setTimeout(() => setView("complete"), 600)
      }
      setProgress(Math.min(100, Math.round(p)))
      setCurrentPage(Math.min(Math.round((p / 100) * pages), pages))

      if (page % pageInterval === 0) {
        const sampleIdx = Math.floor(Math.random() * SAMPLE_CHAPTERS.length)
        const sample = SAMPLE_CHAPTERS[sampleIdx]
        const paraIdx = Math.floor(Math.random() * sample.paragraphs.length)
        setExtractedTexts(prev => {
          const next: ExtractedText[] = [...prev, { page: Math.round((p / 100) * pages), text: sample.paragraphs[paraIdx].slice(0, 80) + "..." }]
          return next.slice(-6)
        })
      }
    }, 80)
  }, [])

  useEffect(() => {
    return () => { if (progressInterval.current) clearInterval(progressInterval.current) }
  }, [])

  const handleFile = async (f: File) => {
    if (!f) return
    const ext = f.name.split('.').pop()?.toLowerCase() || ''
    setFileName(f.name)

    // EPUB → 바로 뷰어
    if (ext === 'epub') {
      const url = URL.createObjectURL(f)
      setEpubUrl(url)
      setView("viewer")
      return
    }

    // TXT → EPUB 변환 후 뷰어
    if (ext === 'txt') {
      try {
        const text = await f.text()
        if (!text.trim()) return
        const title = f.name.replace(/\.txt$/i, '')
        const blob = await convertTxtToEpub(text, title, '')
        const url = URL.createObjectURL(blob)
        setEpubUrl(url)
        setView("viewer")
      } catch {}
      return
    }

    // DOCX → EPUB 변환 후 뷰어
    if (ext === 'docx') {
      try {
        const arrayBuffer = await f.arrayBuffer()
        const title = f.name.replace(/\.docx$/i, '')
        const blob = await convertDocxToEpub(arrayBuffer, title, '')
        const url = URL.createObjectURL(blob)
        setEpubUrl(url)
        setView("viewer")
      } catch {}
      return
    }

    // PDF → 가격 확인 후 변환
    if (ext === 'pdf') {
      setFile(f)
      const pages = 50 + Math.floor(Math.random() * 250)
      setFilePages(pages)
      setView("pricing")
      return
    }
  }

  const reset = () => {
    if (epubUrl) URL.revokeObjectURL(epubUrl)
    setView("landing"); setFile(null); setFileName(""); setFilePages(0); setProgress(0); setCurrentPage(0); setExtractedTexts([]); setEpubUrl(null)
    if (progressInterval.current) clearInterval(progressInterval.current)
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Demo View — Fullscreen DemoReader
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (view === "demo") {
    return (
      <div style={{ height: "100vh", fontFamily: "'Noto Sans KR', system-ui, sans-serif" }}>
        <style>{globalStyles}</style>
        <DemoReader
          chapters={SAMPLE_CHAPTERS}
          title="디자인의 심리학 — 샘플"
          onBack={() => setView("landing")}
        />
      </div>
    )
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Viewer — EpubViewerLite (EPUB/TXT/DOCX)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (view === "viewer" && epubUrl) {
    return (
      <div style={{ width: "100vw", height: "100dvh", fontFamily: "'Noto Sans KR', system-ui, sans-serif" }}>
        <style>{`* { margin: 0; padding: 0; box-sizing: border-box; }`}</style>
        <EpubViewerLite
          epubUrl={epubUrl}
          onBack={reset}
        />
      </div>
    )
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Pricing View — PDF 분석 결과 + 결제
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (view === "pricing") {
    const price = calcPrice(filePages)
    return (
      <div style={{ fontFamily: "'Noto Sans KR', sans-serif", minHeight: "100vh", background: "#06060c", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <style>{globalStyles}</style>
        <div style={{ width: "100%", maxWidth: 480 }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 40, justifyContent: "center" }}>
            <Zap size={20} color="#F59E0B" />
            <span style={{ fontFamily: "'Outfit'", fontWeight: 800, fontSize: 18, color: "#fff" }}>TeXTREME</span>
          </div>

          {/* File info */}
          <div className="fade-up" style={{ padding: 24, borderRadius: 16, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(245,158,11,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <FileText size={22} color="#F59E0B" />
              </div>
              <div style={{ textAlign: "left" }}>
                <div style={{ color: "#fff", fontSize: 15, fontWeight: 600 }}>{fileName || "document.pdf"}</div>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, marginTop: 2 }}>{filePages}페이지 감지됨</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {[
                { label: "페이지", value: `${filePages}p` },
                { label: "결제액", value: `₩${price.toLocaleString()}` },
                { label: "변환 형식", value: "EPUB 3.0" },
              ].map((item, i) => (
                <div key={i} style={{ padding: "14px 8px", borderRadius: 10, background: "rgba(255,255,255,0.03)", textAlign: "center" }}>
                  <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginBottom: 4 }}>{item.label}</div>
                  <div style={{ color: "#fff", fontSize: 15, fontWeight: 700 }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Price breakdown */}
          <div className="fade-up-d1" style={{ padding: "20px 24px", borderRadius: 14, background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.15)", marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>페이지당 단가</span>
              <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: 600 }}>₩{PRICE_PER_PAGE}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{filePages}페이지 × ₩{PRICE_PER_PAGE}</span>
              <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: 600 }}>₩{(filePages * PRICE_PER_PAGE).toLocaleString()}</span>
            </div>
            <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "12px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>100원 단위 반올림</span>
              <span style={{ color: "#F59E0B", fontSize: 13 }}>최소 ₩500</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>최종 결제액</span>
              <span style={{ fontFamily: "'Outfit'", color: "#F59E0B", fontSize: 24, fontWeight: 800 }}>₩{price.toLocaleString()}</span>
            </div>
          </div>

          {/* Buttons */}
          <div className="fade-up-d3" style={{ display: "flex", gap: 12 }}>
            <button onClick={reset}
              style={{ flex: 1, padding: "16px 20px", borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
              취소
            </button>
            <button onClick={() => startConversion(filePages)}
              style={{ flex: 2, padding: "16px 20px", borderRadius: 12, background: "linear-gradient(135deg, #F59E0B, #D97706)", border: "none", color: "#000", fontSize: 16, fontWeight: 800, cursor: "pointer", boxShadow: "0 0 30px rgba(245,158,11,0.2)" }}>
              ₩{price.toLocaleString()} 결제하고 변환
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Converting View
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (view === "converting") {
    return (
      <div style={{ fontFamily: "'Noto Sans KR', sans-serif", minHeight: "100vh", background: "#06060c", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <style>{globalStyles}</style>
        <div style={{ width: "100%", maxWidth: 480, textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 40, justifyContent: "center" }}>
            <Zap size={20} color="#F59E0B" />
            <span style={{ fontFamily: "'Outfit'", fontWeight: 800, fontSize: 18, color: "#fff" }}>TeXTREME</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 16, borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", marginBottom: 32 }}>
            <FileText size={20} color="#F59E0B" />
            <div style={{ textAlign: "left", flex: 1 }}>
              <div style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>{fileName || "document.pdf"}</div>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>{filePages}페이지 · 예상 가격 ₩{calcPrice(filePages).toLocaleString()}</div>
            </div>
          </div>

          {/* Progress ring */}
          <div style={{ position: "relative", width: 160, height: 160, margin: "0 auto 32px" }}>
            <svg width="160" height="160" viewBox="0 0 160 160">
              <circle cx="80" cy="80" r="70" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
              <circle cx="80" cy="80" r="70" fill="none" stroke="#F59E0B" strokeWidth="6" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 70}`}
                strokeDashoffset={`${2 * Math.PI * 70 * (1 - progress / 100)}`}
                transform="rotate(-90 80 80)"
                style={{ transition: "stroke-dashoffset 0.3s ease" }} />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: "'Outfit'", fontWeight: 800, fontSize: 40, color: "#fff" }}>{progress}</span>
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: -4 }}>%</span>
            </div>
          </div>

          <p style={{ color: "#F59E0B", fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
            {progress < 100 ? "AI가 페이지를 분석하고 있습니다" : "변환 완료!"}
          </p>
          <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, marginBottom: 32 }}>
            {currentPage}/{filePages} 페이지 처리됨
          </p>

          <div style={{ height: 4, borderRadius: 4, background: "rgba(255,255,255,0.06)", overflow: "hidden", marginBottom: 32 }}>
            <div style={{ height: "100%", borderRadius: 4, background: "linear-gradient(90deg, #F59E0B, #FBBF24)", transition: "width 0.3s", width: `${progress}%` }} />
          </div>

          {/* Live extraction feed */}
          <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", animation: "pulse-ring 2s infinite" }} />
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 600 }}>실시간 추출</span>
            </div>
            <div style={{ padding: 12, maxHeight: 180, overflow: "hidden" }}>
              {extractedTexts.map((item, i) => (
                <div key={i} className={i === extractedTexts.length - 1 ? "slide-text" : ""}
                  style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.03)", display: "flex", gap: 10 }}>
                  <span style={{ color: "#F59E0B", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>p.{item.page}</span>
                  <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.text}</span>
                </div>
              ))}
              {extractedTexts.length === 0 && (
                <p style={{ color: "rgba(255,255,255,0.2)", fontSize: 12, textAlign: "center", padding: 20 }}>추출 대기 중...</p>
              )}
            </div>
          </div>

          <button onClick={reset} style={{ marginTop: 24, padding: "8px 20px", borderRadius: 8, background: "none", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>
            취소
          </button>
        </div>
      </div>
    )
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Complete View — Conversion done, auto-saved
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (view === "complete") {
    return (
      <div style={{ fontFamily: "'Noto Sans KR', sans-serif", minHeight: "100vh", background: "#06060c", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <style>{globalStyles}</style>
        <div style={{ width: "100%", maxWidth: 480, textAlign: "center" }}>
          {/* Success icon */}
          <div className="check-pop" style={{ width: 96, height: 96, borderRadius: "50%", background: "rgba(34,197,94,0.1)", border: "2px solid rgba(34,197,94,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 32px" }}>
            <CheckCircle2 size={48} color="#22c55e" />
          </div>

          <h2 className="fade-up" style={{ fontFamily: "'Noto Sans KR'", fontWeight: 800, fontSize: 28, color: "#fff", marginBottom: 12, letterSpacing: "-0.02em" }}>
            변환 완료!
          </h2>
          <p className="fade-up-d1" style={{ color: "rgba(255,255,255,0.5)", fontSize: 15, lineHeight: 1.6, marginBottom: 40 }}>
            EPUB 파일이 기기에 자동 저장되었습니다
          </p>

          {/* File info card */}
          <div className="fade-up-d2" style={{ padding: 24, borderRadius: 16, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(34,197,94,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <BookOpen size={22} color="#22c55e" />
              </div>
              <div style={{ textAlign: "left" }}>
                <div style={{ color: "#fff", fontSize: 15, fontWeight: 600 }}>{fileName?.replace('.pdf', '.epub') || "document.epub"}</div>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, marginTop: 2 }}>{filePages}페이지 · ₩{calcPrice(filePages).toLocaleString()}</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {[
                { label: "페이지", value: `${filePages}p` },
                { label: "결제액", value: `₩${calcPrice(filePages).toLocaleString()}` },
                { label: "형식", value: "EPUB 3.0" },
              ].map((item, i) => (
                <div key={i} style={{ padding: "12px 8px", borderRadius: 10, background: "rgba(255,255,255,0.03)", textAlign: "center" }}>
                  <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginBottom: 4 }}>{item.label}</div>
                  <div style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tip */}
          <div className="fade-up-d3" style={{ padding: "16px 20px", borderRadius: 12, background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)", marginBottom: 32, textAlign: "left" }}>
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, lineHeight: 1.6 }}>
              <span style={{ color: "#F59E0B", fontWeight: 700 }}>Tip</span> — 다운로드된 EPUB 파일을 원하는 EPUB 뷰어 앱에서 열어보세요.
            </p>
          </div>

          {/* Actions */}
          <div className="fade-up-d4" style={{ display: "flex", gap: 12 }}>
            <button onClick={reset}
              style={{ flex: 1, padding: "14px 20px", borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              다른 PDF 변환
            </button>
            <button onClick={reset}
              style={{ flex: 1, padding: "14px 20px", borderRadius: 12, background: "linear-gradient(135deg, #F59E0B, #D97706)", border: "none", color: "#000", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              홈으로
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Landing View
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━
  return (
    <div style={{ fontFamily: "'Noto Sans KR', system-ui, sans-serif", background: "#06060c", minHeight: "100vh" }}>
      <style>{globalStyles}</style>

      {/* NAV */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, padding: "16px 24px", background: "rgba(6,6,12,0.8)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <Zap size={22} color="#F59E0B" strokeWidth={2.5} />
            <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 20, color: "#fff", letterSpacing: "-0.02em" }}>
              TeXTREME
            </span>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", fontWeight: 500, marginLeft: 6 }}>
              PDF to EPUB 변환기
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="btn-glow" onClick={() => setView("demo")}
              style={{ padding: "8px 16px", borderRadius: 10, background: "none", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)", fontWeight: 600, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <Eye size={14} /> 체험하기
            </button>
            <button onClick={() => fileInputRef.current?.click()}
              style={{ padding: "8px 20px", borderRadius: 10, background: "linear-gradient(135deg, #F59E0B, #D97706)", color: "#000", fontWeight: 700, fontSize: 14, border: "none", cursor: "pointer" }}>
              변환하기
            </button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "120px 24px 80px", background: "radial-gradient(ellipse 80% 60% at 50% 30%, rgba(245,158,11,0.06) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 50% 80%, rgba(59,130,246,0.04) 0%, transparent 60%), #06060c", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, opacity: 0.03, backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />

        <div className="fade-up" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: 40, border: "1px solid rgba(245,158,11,0.2)", background: "rgba(245,158,11,0.06)", marginBottom: 28 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px #22c55e" }} />
          <span style={{ color: "#F59E0B", fontSize: 13, fontWeight: 600 }}>AI 기반 변환 엔진</span>
        </div>

        <h1 className="fade-up-d1" style={{ fontFamily: "'Noto Sans KR', sans-serif", fontWeight: 900, fontSize: "clamp(36px, 6vw, 64px)", lineHeight: 1.15, textAlign: "center", color: "#fff", maxWidth: 700, letterSpacing: "-0.03em" }}>
          한글 PDF를<br />
          <span style={{ background: "linear-gradient(135deg, #F59E0B, #FBBF24, #F59E0B)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            완벽한 EPUB
          </span>으로
        </h1>

        <p className="fade-up-d2" style={{ fontSize: "clamp(16px, 2.5vw, 20px)", color: "rgba(255,255,255,0.5)", textAlign: "center", maxWidth: 520, lineHeight: 1.6, marginTop: 20, marginBottom: 48 }}>
          AI가 PDF 페이지를 분석하여 모바일에서도<br />편하게 읽을 수 있는 EPUB으로 변환합니다
        </p>

        {/* Upload Zone */}
        <div className="fade-up-d3"
          onClick={() => fileInputRef.current?.click()}
          style={{
            width: "100%", maxWidth: 500, padding: "48px 32px", borderRadius: 20,
            border: "2px dashed rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.02)",
            cursor: "pointer", textAlign: "center", transition: "all 0.3s",
          }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: "rgba(245,158,11,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", animation: "float 4s ease-in-out infinite" }}>
            <Upload size={28} color="#F59E0B" />
          </div>
          <p style={{ color: "#fff", fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
            클릭하여 파일 열기
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <span style={{ padding: "3px 8px", borderRadius: 6, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)", color: "#F59E0B", fontSize: 12, fontWeight: 600 }}>PDF</span>
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>→ EPUB 변환 (유료)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <span style={{ padding: "3px 8px", borderRadius: 6, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", color: "#22c55e", fontSize: 12, fontWeight: 600 }}>EPUB · TXT · DOCX</span>
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>→ 바로 읽기</span>
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept=".pdf,.epub,.txt,.docx" style={{ display: "none" }}
            onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }} />
        </div>

        {/* Stats */}
        <div className="fade-up-d4" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 32, marginTop: 60, maxWidth: 520, width: "100%" }}>
          {[
            { value: "₩10", label: "페이지당", sub: "사용한 만큼만" },
            { value: "~10초", label: "페이지당 변환", sub: "AI 비전 엔진" },
            { value: "99%+", label: "한글 인식률", sub: "한글 특화" },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 28, color: "#F59E0B", letterSpacing: "-0.02em" }}>{s.value}</div>
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: 500, marginTop: 4 }}>{s.label}</div>
              <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, marginTop: 2 }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ━━━ DEMO SECTION — Embedded Mini + Fullscreen CTA ━━━ */}
      <section ref={demoSectionRef} style={{ padding: "100px 24px", background: "linear-gradient(180deg, #06060c 0%, #0a0a14 50%, #06060c 100%)" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <h2 style={{ color: "#fff", fontWeight: 800, fontSize: "clamp(26px, 4vw, 36px)", letterSpacing: "-0.02em", marginBottom: 12 }}>
              결제 전에, 변환 품질을 직접 확인하세요
            </h2>
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 16, maxWidth: 480, margin: "0 auto", lineHeight: 1.6 }}>
              아래는 실제 PDF에서 변환된 EPUB입니다<br />여러분의 PDF로도 최고의 품질의 EPUB 변환이 가능합니다
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", maxWidth: 480, margin: "0 auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, width: "100%" }}>
                {[
                  { icon: "📖", title: "모든 EPUB 뷰어 호환", desc: "원하는 앱에서 바로 열기" },
                  { icon: "📐", title: "EPUB 3.0 표준", desc: "모든 기기·OS 호환" },
                  { icon: "🔤", title: "한글 정확도 99%+", desc: "조사·어미·띄어쓰기 정확" },
                  { icon: "⚡", title: "구조 자동 보존", desc: "제목·본문·인용 분석" },
                ].map((item, i) => (
                  <div key={i} style={{ padding: "14px 10px", borderRadius: 10, background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.1)", textAlign: "center" }} className="card-hover">
                    <div style={{ fontSize: 20, marginBottom: 6 }}>{item.icon}</div>
                    <div style={{ color: "#fff", fontWeight: 700, fontSize: 13, marginBottom: 3 }}>{item.title}</div>
                    <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, lineHeight: 1.4 }}>{item.desc}</div>
                  </div>
                ))}
              </div>

              <button className="demo-attention-btn" onClick={() => setView("demo")}
                style={{
                  marginTop: 28, width: "100%", maxWidth: 360, padding: "13px 20px", borderRadius: 12,
                  background: "linear-gradient(135deg, rgba(245,158,11,0.2), rgba(245,158,11,0.08))",
                  border: "1.5px solid rgba(245,158,11,0.4)", color: "#F59E0B",
                  fontWeight: 700, fontSize: 15, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                }}>
                <Eye size={18} />
                변환 결과 데모 확인
              </button>
            </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section style={{ padding: "100px 24px", background: "#06060c" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", color: "#fff", fontWeight: 800, fontSize: 32, letterSpacing: "-0.02em", marginBottom: 12 }}>
            3단계로 끝
          </h2>
          <p style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 16, marginBottom: 64 }}>
            복잡한 설정 없이, 파일만 올리면 됩니다
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 24 }}>
            {[
              { icon: <Upload size={24} />, num: "01", title: "PDF 업로드", desc: "변환할 PDF 파일을 올려주세요", color: "#3b82f6" },
              { icon: <Zap size={24} />, num: "02", title: "AI가 분석·변환", desc: "AI가 페이지별로 텍스트 구조를 분석하고 EPUB으로 변환합니다", color: "#F59E0B" },
              { icon: <Download size={24} />, num: "03", title: "자동 저장", desc: "변환된 전자책이 기기에 자동으로 저장됩니다", color: "#22c55e" },
            ].map((step, i) => (
              <div key={i} style={{ padding: 32, borderRadius: 16, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", position: "relative", overflow: "hidden" }} className="step-card">
                <div style={{ position: "absolute", top: -20, right: -10, fontFamily: "'Outfit'", fontWeight: 900, fontSize: 100, color: "rgba(255,255,255,0.02)", lineHeight: 1 }}>{step.num}</div>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: `${step.color}15`, display: "flex", alignItems: "center", justifyContent: "center", color: step.color, marginBottom: 20 }}>
                  {step.icon}
                </div>
                <h3 style={{ color: "#fff", fontWeight: 700, fontSize: 18, marginBottom: 8 }}>{step.title}</h3>
                <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, lineHeight: 1.6 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BEFORE / AFTER */}
      <section style={{ padding: "100px 24px", background: "linear-gradient(180deg, #06060c 0%, #0a0a14 100%)" }}>
        <div style={{ maxWidth: 500, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", color: "#fff", fontWeight: 800, fontSize: 32, letterSpacing: "-0.02em", marginBottom: 12 }}>
            이런 차이가 납니다
          </h2>
          <p style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 16, marginBottom: 56 }}>
            모바일에서 PDF를 읽어본 적 있다면, 이 고통을 아실 겁니다
          </p>
          <div className="compare-grid">
            {/* Before */}
            <div style={{ borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ padding: "12px 16px", background: "rgba(239,68,68,0.1)", borderBottom: "1px solid rgba(239,68,68,0.15)", display: "flex", alignItems: "center", gap: 8 }}>
                <X size={16} color="#ef4444" />
                <span style={{ color: "#ef4444", fontSize: 13, fontWeight: 600 }}>PDF</span>
              </div>
              <div style={{ padding: 0, background: "#525659" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", background: "#3b3b3b", borderBottom: "1px solid #2a2a2a" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 14, height: 14, borderRadius: 3, background: "#666", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 7, color: "#bbb" }}>☰</span>
                    </div>
                    <span style={{ fontSize: 6.5, color: "#999", maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>어린왕자.pdf</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ fontSize: 6, color: "#888", padding: "2px 4px", background: "#4a4a4a", borderRadius: 2 }}>−</div>
                    <span style={{ fontSize: 6, color: "#aaa" }}>67%</span>
                    <div style={{ fontSize: 6, color: "#888", padding: "2px 4px", background: "#4a4a4a", borderRadius: 2 }}>+</div>
                  </div>
                </div>
                <div style={{ padding: "12px 16px", position: "relative" }}>
                  <div style={{ background: "#fff", padding: "10px 12px", boxShadow: "0 2px 8px rgba(0,0,0,0.3)", position: "relative" }}>
                    <div style={{ fontSize: 8, color: "#111", fontWeight: 700, marginBottom: 4 }}>제1장 어른들의 세계</div>
                    <div style={{ fontSize: 5.8, color: "#444", lineHeight: 1.55, wordBreak: "keep-all" }}>
                      내가 여섯 살 때의 일이다. 한번은 원시림에 관한 책에서 놀라운 그림을 본 적이 있다. 그 그림은 보아뱀이 맹수를 삼키고 있는 모습이었다. 나는 이 모험담에 큰 감명을 받아 색연필로 내 최초의 그림을 그렸다. 나의 그림 제1호였다. 나는 이 걸작을 어른들에게 보여주며 무섭지 않으냐고 물었다. 어른들의 대답은 이랬다. &quot;모자가 왜 무섭니?&quot; 내 그림은 모자를 그린 것이 아니었다. 보아뱀이 코끼리를 소화시키고 있는 그림이었다. 어른들이 알아볼 수 있도록 보아뱀의 속을 그려 보여주었다. 어른들은 늘 설명을 요구했다. 나의 그림 제2호를 보고서 어른들은 나에게 보아뱀 그림 같은 건 집어치우고 차라리 지리, 역사, 산수, 문법에 관심을 쏟으라고 충고했다. 그래서 나는 여섯 살에 화가라는 훌륭한 직업을 포기하고 말았다.
                    </div>
                  </div>
                  <div style={{ position: "absolute", right: 4, top: 16, bottom: 16, width: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2 }}>
                    <div style={{ width: 3, height: 20, background: "rgba(255,255,255,0.3)", borderRadius: 2, marginTop: 8 }} />
                  </div>
                </div>
                <div style={{ textAlign: "center", padding: "4px 0 8px", fontSize: 6, color: "#888" }}>1 / 142</div>
                <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, textAlign: "center", padding: "8px 0 14px", background: "rgba(0,0,0,0.15)" }}>
                  확대하고 좌우로 스크롤하고...<br />읽다가 포기 😤
                </p>
              </div>
            </div>
            {/* After */}
            <div style={{ borderRadius: 16, overflow: "hidden", border: "1px solid rgba(34,197,94,0.2)" }} className="glow-amber compare-glow">
              <div style={{ padding: "12px 16px", background: "rgba(34,197,94,0.08)", borderBottom: "1px solid rgba(34,197,94,0.15)", display: "flex", alignItems: "center", gap: 8 }}>
                <Check size={16} color="#22c55e" />
                <span style={{ color: "#22c55e", fontSize: 13, fontWeight: 600 }}>EPUB</span>
              </div>
              <div style={{ padding: 20, background: "rgba(255,255,255,0.02)", minHeight: 280 }}>
                <div style={{ background: "#1a1410", borderRadius: 8, padding: 16 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#EEE4E1", marginBottom: 12, lineHeight: 1.3 }}>
                    제1장 어른들의 세계
                  </div>
                  <div style={{ fontSize: 12, color: "#C4A882", lineHeight: 1.8 }}>
                    내가 여섯 살 때의 일이다. 한번은 원시림에 관한 책에서 놀라운 그림을 본 적이 있다. 그 그림은 보아뱀이 맹수를 삼키고 있는 모습이었다...
                  </div>
                </div>
                <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, textAlign: "center", marginTop: 16 }}>
                  글자 크기 자유 조절 · 편하게 읽기 ✨
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section style={{ padding: "100px 24px", background: "#06060c" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", color: "#fff", fontWeight: 800, fontSize: 32, letterSpacing: "-0.02em", marginBottom: 56 }}>
            왜 TeXTREME PDF to EPUB 변환기인가
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            {[
              { icon: <Type size={22} />, title: "한글 특화", desc: "한글 조사·어미·띄어쓰기를 정확히 인식" },
              { icon: <BookOpen size={22} />, title: "구조 보존", desc: "제목·본문·인용·리스트 자동 분석" },
              { icon: <Smartphone size={22} />, title: "모바일 최적화", desc: "화면 크기에 맞춰 자동 리플로우" },
              { icon: <Globe size={22} />, title: "어디서든 변환", desc: "PC·태블릿·스마트폰, 어디서든" },
            ].map((f, i) => (
              <div key={i} style={{ padding: "16px 14px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }} className="card-hover">
                <div style={{ color: "#F59E0B", marginBottom: 14 }}>{f.icon}</div>
                <h4 style={{ color: "#fff", fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{f.title}</h4>
                <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING — Per-page */}
      <section style={{ padding: "100px 24px", background: "radial-gradient(ellipse 80% 50% at 50% 100%, rgba(245,158,11,0.04) 0%, transparent 60%), #06060c" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", color: "#fff", fontWeight: 800, fontSize: 32, letterSpacing: "-0.02em", marginBottom: 12 }}>
            심플한 가격
          </h2>
          <p style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 16, marginBottom: 48 }}>
            구독 없이, 사용한 만큼만 결제하세요
          </p>

          {/* Main price card */}
          <div style={{ textAlign: "center", padding: "48px 32px", borderRadius: 20, background: "linear-gradient(135deg, rgba(245,158,11,0.08), rgba(245,158,11,0.02))", border: "1px solid rgba(245,158,11,0.25)", marginBottom: 32, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -30, right: -20, fontFamily: "'Outfit'", fontWeight: 900, fontSize: 140, color: "rgba(245,158,11,0.04)", lineHeight: 1 }}>₩</div>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, fontWeight: 600, marginBottom: 8 }}>페이지당</p>
            <div style={{ fontFamily: "'Outfit'", fontWeight: 900, fontSize: 56, color: "#fff", lineHeight: 1 }}>
              <span style={{ background: "linear-gradient(135deg, #F59E0B, #FBBF24)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>₩10</span>
            </div>
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, marginTop: 12 }}>100원 단위 반올림 · 최소 ₩500</p>
          </div>

          {/* Price examples */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            {PRICE_EXAMPLES.map((ex, i) => (
              <div key={i} style={{ padding: "16px 20px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{ex.display}</span>
                <span style={{ fontFamily: "'Outfit'", fontWeight: 700, fontSize: 16, color: "#fff" }}>₩{calcPrice(ex.pages).toLocaleString()}</span>
              </div>
            ))}
          </div>

          <p style={{ textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 12, marginTop: 24 }}>
            * 데모로 먼저 체험하고, 만족하면 변환하세요
          </p>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: "80px 24px 48px", background: "#06060c", textAlign: "center" }}>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <button className="btn-glow" onClick={() => setView("demo")}
            style={{ padding: "16px 32px", borderRadius: 14, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", fontWeight: 700, fontSize: 17, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
            <Eye size={20} /> 데모 체험하기
          </button>
          <button onClick={() => fileInputRef.current?.click()}
            style={{ padding: "16px 40px", borderRadius: 14, background: "linear-gradient(135deg, #F59E0B, #D97706)", color: "#000", fontWeight: 800, fontSize: 18, border: "none", cursor: "pointer", boxShadow: "0 0 40px rgba(245,158,11,0.2)", display: "flex", alignItems: "center", gap: 10 }}>
            지금 변환하기 <ArrowRight size={20} />
          </button>
        </div>
        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, marginTop: 16 }}>
          회원가입 필요 없음 · 데모로 먼저 체험 가능
        </p>

        {/* App Download Buttons */}
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 32, flexWrap: "wrap" }}>
          <button onClick={handleInstallPwa}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "12px 24px", borderRadius: 12,
              background: isPwaInstalled ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.06)",
              border: isPwaInstalled ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(255,255,255,0.1)",
              color: isPwaInstalled ? "#22c55e" : "#fff", cursor: isPwaInstalled ? "default" : "pointer",
              transition: "all 0.2s",
            }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
              <span style={{ fontSize: 10, color: isPwaInstalled ? "rgba(34,197,94,0.6)" : "rgba(255,255,255,0.4)", fontWeight: 500 }}>
                {isPwaInstalled ? "설치 완료" : "웹앱으로 설치"}
              </span>
              <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>
                {isPwaInstalled ? "TeXTREME ✓" : "TeXTREME PDF to EPUB 변환기"}
              </span>
            </div>
          </button>
          <div style={{
            display: "flex", alignItems: "center", gap: 10, padding: "12px 24px", borderRadius: 12,
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.3)", cursor: "default",
          }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontWeight: 500 }}>Google Play</span>
              <span style={{ fontSize: 15, fontWeight: 700 }}>곧 출시</span>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ padding: "32px 24px", borderTop: "1px solid rgba(255,255,255,0.05)", background: "#06060c" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Zap size={16} color="#F59E0B" />
            <span style={{ fontFamily: "'Outfit'", fontWeight: 700, fontSize: 14, color: "rgba(255,255,255,0.4)" }}>TeXTREME</span>
          </div>
          <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 12 }}>
            © 2026 텍스트림 · 사업자등록번호 653-33-01529
          </div>
        </div>
      </footer>
    </div>
  )
}
