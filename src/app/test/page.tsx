'use client'

import { useState, useRef, useCallback } from 'react'
import { buildEpubOnClient, extractPageImages, PageDataForEpub } from '@/lib/epub-builder'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 타입 정의
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface PageElement {
  type: 'heading' | 'paragraph' | 'quote' | 'list_item' | 'image_placeholder' | 'caption'
  text?: string
  level?: number
  description?: string
}

interface TestResult {
  fileName: string
  fileSize: number
  pageCount: number
  totalElements: number
  emptyPages: number
  imagePages: number
  totalInputTokens: number
  totalOutputTokens: number
  costKRW: number
  elapsedSec: number
  secPerPage: number
  status: 'pending' | 'converting' | 'done' | 'error'
  error?: string
  epubBlob?: Blob
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 배치 테스트 페이지 컴포넌트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function BatchTestPage() {
  const [results, setResults] = useState<TestResult[]>([])
  const [currentIdx, setCurrentIdx] = useState(-1)
  const [currentProgress, setCurrentProgress] = useState(0)
  const [currentStatus, setCurrentStatus] = useState('')
  const [logs, setLogs] = useState<string[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef(false)

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`])
  }

  // ━━━ 단일 PDF 변환 ━━━
  const convertOne = useCallback(async (file: File): Promise<TestResult> => {
    const startTime = Date.now()
    const result: TestResult = {
      fileName: file.name,
      fileSize: file.size,
      pageCount: 0,
      totalElements: 0,
      emptyPages: 0,
      imagePages: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      costKRW: 0,
      elapsedSec: 0,
      secPerPage: 0,
      status: 'converting',
    }

    try {
      // ★ 1단계: 클라이언트에서 pdf-lib로 PDF 분할
      setCurrentStatus(`${file.name} — PDF 분할 중...`)
      addLog(`📄 ${file.name} — ${(file.size / 1024 / 1024).toFixed(1)}MB`)

      const { PDFDocument } = await import('pdf-lib')
      const arrayBuffer = await file.arrayBuffer()
      const srcDoc = await PDFDocument.load(arrayBuffer)
      result.pageCount = srcDoc.getPageCount()
      addLog(`  ${result.pageCount}페이지 감지, 분할 중...`)

      // 1페이지 PDF들로 분할
      const singlePageBase64s: { base64: string; pageNumber: number }[] = []
      for (let i = 0; i < result.pageCount; i++) {
        const newDoc = await PDFDocument.create()
        const [copiedPage] = await newDoc.copyPages(srcDoc, [i])
        newDoc.addPage(copiedPage)
        const bytes = await newDoc.save()
        // Uint8Array → base64
        let binary = ''
        for (let j = 0; j < bytes.length; j++) {
          binary += String.fromCharCode(bytes[j])
        }
        singlePageBase64s.push({ base64: btoa(binary), pageNumber: i + 1 })
      }

      setCurrentProgress(5)
      addLog(`  분할 완료, Gemini API 호출 시작...`)

      // ★ 2단계: 3배치 동시 전송 (Vercel 4.5MB body 제한 + 속도 최적화)
      const MAX_BATCH_BYTES = 3 * 1024 * 1024 // 3MB (JSON 오버헤드 고려)
      const CONCURRENT = 3 // 동시 전송 배치 수
      const allPageResults: PageDataForEpub[] = []

      // 먼저 모든 배치를 준비
      const allBatches: (typeof singlePageBase64s)[] = []
      let batchIdx = 0
      while (batchIdx < singlePageBase64s.length) {
        const batchPages: typeof singlePageBase64s = []
        let batchBytes = 0
        while (batchIdx < singlePageBase64s.length && batchPages.length < 10) {
          const pageSize = singlePageBase64s[batchIdx].base64.length
          if (batchPages.length > 0 && batchBytes + pageSize > MAX_BATCH_BYTES) break
          batchPages.push(singlePageBase64s[batchIdx])
          batchBytes += pageSize
          batchIdx++
        }
        allBatches.push(batchPages)
      }

      addLog(`  ${allBatches.length}개 배치 준비 완료, ${CONCURRENT}개씩 동시 전송`)

      // CONCURRENT개씩 동시 전송
      let completedPages = 0
      for (let round = 0; round < allBatches.length; round += CONCURRENT) {
        if (abortRef.current) throw new Error('사용자 중단')

        const roundBatches = allBatches.slice(round, round + CONCURRENT)
        const firstPage = roundBatches[0][0].pageNumber
        const lastPage = roundBatches[roundBatches.length - 1][roundBatches[roundBatches.length - 1].length - 1].pageNumber
        setCurrentStatus(`${file.name} — p${firstPage}~${lastPage}/${result.pageCount} (${roundBatches.length}배치 동시)`)

        // 동시 fetch
        const responses = await Promise.all(
          roundBatches.map(batchPages =>
            fetch('/api/convert', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pages: batchPages }),
            })
          )
        )

        // 응답 처리
        for (const response of responses) {
          if (!response.ok) {
            const err = await response.json().catch(() => ({ error: `서버 오류 ${response.status}` }))
            throw new Error(err.error || `HTTP ${response.status}`)
          }

          const data = await response.json()
          const batchResults = data.results || []

          for (const r of batchResults) {
            allPageResults.push({ pageNumber: r.pageNumber, elements: r.elements })
            result.totalInputTokens += r.inputTokens || 0
            result.totalOutputTokens += r.outputTokens || 0
            result.totalElements += r.elements.length

            if (r.elements.length === 0) result.emptyPages++

            const preview = r.elements.find((e: any) => e.text)?.text?.slice(0, 50) || '(빈 텍스트)'
            addLog(`  p${r.pageNumber}: ${r.elements.length} els | ${preview}`)
            completedPages++
          }
        }

        // 진행률 업데이트
        const pct = 5 + Math.round((completedPages / result.pageCount) * 75) // 5~80%
        setCurrentProgress(pct)
      }

      // 페이지 순서 정렬 (동시 전송으로 순서가 섞일 수 있음)
      allPageResults.sort((a, b) => a.pageNumber - b.pageNumber)

      // 비용 계산
      const costUSD = result.totalInputTokens / 1_000_000 * 0.15 + result.totalOutputTokens / 1_000_000 * 0.60
      result.costKRW = Math.round(costUSD * 1450)

      // 이미지 필요한 페이지 찾기
      const imagePagesNeeded = allPageResults
        .filter(p => p.elements.some(e => e.type === 'image_placeholder'))
        .map(p => p.pageNumber)
      result.imagePages = imagePagesNeeded.length

      // ★ 3단계: 이미지 렌더링 (필요한 페이지만)
      setCurrentProgress(80)
      let pageImages: Map<number, string[]> = new Map()
      if (imagePagesNeeded.length > 0) {
        addLog(`  🖼️ 이미지 추출: ${imagePagesNeeded.length}개 페이지`)
        setCurrentStatus(`${file.name} — 이미지 추출 중...`)
        pageImages = await extractPageImages(file, imagePagesNeeded, addLog)
        addLog(`  🖼️ 이미지 추출 완료: ${Array.from(pageImages.values()).reduce((s, a) => s + a.length, 0)}개`)
      }

      // ★ 4단계: EPUB 빌드
      setCurrentProgress(90)
      setCurrentStatus(`${file.name} — EPUB 빌드 중...`)
      addLog(`  📦 EPUB 빌드 중...`)
      const title = file.name.replace(/\.pdf$/i, '')
      result.epubBlob = await buildEpubOnClient(allPageResults, title, pageImages)
      addLog(`  📦 EPUB 빌드 완료 (${(result.epubBlob.size / 1024).toFixed(0)}KB)`)

      setCurrentProgress(100)
      const elapsed = (Date.now() - startTime) / 1000
      result.elapsedSec = Math.round(elapsed * 10) / 10
      result.secPerPage = result.pageCount > 0 ? Math.round((elapsed / result.pageCount) * 10) / 10 : 0
      result.status = 'done'
      addLog(`✅ ${file.name} 완료 — ${result.elapsedSec}초, ₩${result.costKRW}, 이미지 ${result.imagePages}p, 빈 ${result.emptyPages}p`)

    } catch (err: any) {
      result.status = 'error'
      result.error = err.message
      result.elapsedSec = Math.round((Date.now() - startTime) / 1000 * 10) / 10
      addLog(`❌ ${file.name} 실패 — ${err.message}`)
    }

    return result
  }, [])

  // ━━━ 배치 실행 ━━━
  const runBatch = useCallback(async (files: File[]) => {
    setIsRunning(true)
    setIsDone(false)
    abortRef.current = false
    setLogs([])
    setResults([])

    const pdfFiles = files
      .filter(f => f.name.toLowerCase().endsWith('.pdf'))
      .sort((a, b) => a.name.localeCompare(b.name))

    if (pdfFiles.length === 0) {
      addLog('⚠️ 폴더에 PDF 파일이 없습니다.')
      setIsRunning(false)
      return
    }

    addLog(`━━━ 배치 테스트 시작: ${pdfFiles.length}개 PDF ━━━`)

    const initialResults: TestResult[] = pdfFiles.map(f => ({
      fileName: f.name,
      fileSize: f.size,
      pageCount: 0, totalElements: 0, emptyPages: 0, imagePages: 0,
      totalInputTokens: 0, totalOutputTokens: 0, costKRW: 0,
      elapsedSec: 0, secPerPage: 0, status: 'pending' as const,
    }))
    setResults(initialResults)

    const finalResults: TestResult[] = [...initialResults]

    for (let i = 0; i < pdfFiles.length; i++) {
      if (abortRef.current) {
        addLog('⛔ 사용자에 의해 중단됨')
        break
      }

      setCurrentIdx(i)
      setCurrentProgress(0)
      setCurrentStatus(`${pdfFiles[i].name} 준비 중...`)

      finalResults[i] = { ...finalResults[i], status: 'converting' }
      setResults([...finalResults])

      const r = await convertOne(pdfFiles[i])
      finalResults[i] = r
      setResults([...finalResults])

      // EPUB 자동 다운로드
      if (r.epubBlob) {
        const url = URL.createObjectURL(r.epubBlob)
        const a = document.createElement('a')
        a.href = url
        a.download = r.fileName.replace('.pdf', '.epub')
        a.click()
        URL.revokeObjectURL(url)
      }

      // 다음 파일 전 1초 대기
      if (i < pdfFiles.length - 1 && !abortRef.current) {
        await new Promise(r => setTimeout(r, 1000))
      }
    }

    setCurrentIdx(-1)
    setCurrentProgress(0)
    setCurrentStatus('')
    setIsRunning(false)
    setIsDone(true)

    // 요약
    const done = finalResults.filter(r => r.status === 'done')
    const failed = finalResults.filter(r => r.status === 'error')
    const totalPages = done.reduce((s, r) => s + r.pageCount, 0)
    const totalTime = done.reduce((s, r) => s + r.elapsedSec, 0)
    const totalCost = done.reduce((s, r) => s + r.costKRW, 0)
    const totalEmpty = done.reduce((s, r) => s + r.emptyPages, 0)
    const totalImages = done.reduce((s, r) => s + r.imagePages, 0)

    addLog(`\n━━━ 배치 테스트 완료 ━━━`)
    addLog(`성공: ${done.length}개 / 실패: ${failed.length}개`)
    addLog(`총 페이지: ${totalPages}p / 총 시간: ${Math.round(totalTime)}초`)
    addLog(`총 비용: ₩${totalCost} / 이미지 페이지: ${totalImages}p / 빈 페이지: ${totalEmpty}p (${totalPages > 0 ? (totalEmpty / totalPages * 100).toFixed(1) : 0}%)`)
    addLog(`평균 페이지당: ${totalPages > 0 ? (totalTime / totalPages).toFixed(1) : 0}초`)
  }, [convertOne])

  // ━━━ CSV 다운로드 ━━━
  const downloadCSV = () => {
    const header = '파일명,용량(MB),페이지수,총요소,빈페이지,빈페이지비율(%),이미지페이지,Input토큰,Output토큰,비용(원),소요시간(초),페이지당(초),상태,에러\n'
    const rows = results.map(r =>
      `"${r.fileName}",${(r.fileSize / 1024 / 1024).toFixed(1)},${r.pageCount},${r.totalElements},${r.emptyPages},${r.pageCount > 0 ? (r.emptyPages / r.pageCount * 100).toFixed(1) : 0},${r.imagePages},${r.totalInputTokens},${r.totalOutputTokens},${r.costKRW},${r.elapsedSec},${r.secPerPage},${r.status},"${r.error || ''}"`
    ).join('\n')

    const bom = '\uFEFF'
    const blob = new Blob([bom + header + rows], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `textreme-batch-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ━━━ EPUB 일괄 다운로드 ━━━
  const downloadAllEpubs = () => {
    results.forEach(r => {
      if (r.epubBlob) {
        const url = URL.createObjectURL(r.epubBlob)
        const a = document.createElement('a')
        a.href = url
        a.download = r.fileName.replace('.pdf', '.epub')
        a.click()
        URL.revokeObjectURL(url)
      }
    })
  }

  // ━━━ UI ━━━
  const doneResults = results.filter(r => r.status === 'done')
  const totalPages = doneResults.reduce((s, r) => s + r.pageCount, 0)
  const totalCost = doneResults.reduce((s, r) => s + r.costKRW, 0)
  const totalTime = doneResults.reduce((s, r) => s + r.elapsedSec, 0)

  return (
    <div style={{ fontFamily: "'Noto Sans KR', monospace", background: '#0d0d1a', color: '#eee', minHeight: '100vh', padding: 24 }}>
      <h1 style={{ fontSize: 22, marginBottom: 4, color: '#F59E0B' }}>⚡ TeXTREME 배치 테스트</h1>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 24 }}>폴더 선택 → 클라이언트 분할 → 배치 변환 → EPUB 자동 다운로드 → CSV 리포트</p>

      {/* 폴더 선택 */}
      <div
        onClick={() => !isRunning && folderInputRef.current?.click()}
        style={{
          padding: '32px 24px', borderRadius: 12, textAlign: 'center',
          cursor: isRunning ? 'not-allowed' : 'pointer',
          border: '2px dashed rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.05)',
          marginBottom: 20, fontSize: 15,
        }}
      >
        {isRunning ? (currentStatus || '변환 중...') : '📁 클릭하여 PDF 폴더 선택'}
        <input
          ref={folderInputRef}
          type="file"
          {...{ webkitdirectory: '', directory: '' } as any}
          multiple
          style={{ display: 'none' }}
          onChange={e => {
            if (e.target.files && e.target.files.length > 0) {
              runBatch(Array.from(e.target.files))
            }
            e.target.value = ''
          }}
        />
      </div>

      {/* 현재 진행 프로그레스 바 */}
      {isRunning && currentProgress > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, color: '#aaa' }}>
            <span>{currentStatus}</span>
            <span>{currentProgress}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)' }}>
            <div style={{ height: '100%', borderRadius: 3, background: '#F59E0B', width: `${currentProgress}%`, transition: 'width 0.3s' }} />
          </div>
        </div>
      )}

      {/* 중단 버튼 */}
      {isRunning && (
        <button onClick={() => { abortRef.current = true }}
          style={{ marginBottom: 16, padding: '8px 20px', borderRadius: 8, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: 13, cursor: 'pointer' }}>
          ⛔ 중단
        </button>
      )}

      {/* 결과 테이블 */}
      {results.length > 0 && (
        <div style={{ marginBottom: 20, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#888' }}>
                <th style={{ padding: '8px 6px', textAlign: 'left' }}>#</th>
                <th style={{ padding: '8px 6px', textAlign: 'left' }}>파일명</th>
                <th style={{ padding: '8px 6px', textAlign: 'right' }}>페이지</th>
                <th style={{ padding: '8px 6px', textAlign: 'right' }}>요소</th>
                <th style={{ padding: '8px 6px', textAlign: 'right' }}>빈p</th>
                <th style={{ padding: '8px 6px', textAlign: 'right' }}>이미지p</th>
                <th style={{ padding: '8px 6px', textAlign: 'right' }}>비용</th>
                <th style={{ padding: '8px 6px', textAlign: 'right' }}>시간</th>
                <th style={{ padding: '8px 6px', textAlign: 'right' }}>p당</th>
                <th style={{ padding: '8px 6px', textAlign: 'center' }}>상태</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} style={{
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  background: i === currentIdx ? 'rgba(245,158,11,0.06)' : 'transparent',
                }}>
                  <td style={{ padding: '6px', color: '#666' }}>{i + 1}</td>
                  <td style={{ padding: '6px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.fileName}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{r.pageCount || '-'}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{r.totalElements || '-'}</td>
                  <td style={{ padding: '6px', textAlign: 'right', color: r.emptyPages > 0 ? '#ef4444' : '#666' }}>{r.emptyPages || '-'}</td>
                  <td style={{ padding: '6px', textAlign: 'right', color: r.imagePages > 0 ? '#3b82f6' : '#666' }}>{r.imagePages || '-'}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{r.costKRW ? `₩${r.costKRW}` : '-'}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{r.elapsedSec ? `${r.elapsedSec}s` : '-'}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{r.secPerPage ? `${r.secPerPage}s` : '-'}</td>
                  <td style={{ padding: '6px', textAlign: 'center' }}>
                    {r.status === 'pending' && <span style={{ color: '#666' }}>⏳</span>}
                    {r.status === 'converting' && <span style={{ color: '#F59E0B' }}>🔄</span>}
                    {r.status === 'done' && <span style={{ color: '#22c55e' }}>✅</span>}
                    {r.status === 'error' && <span style={{ color: '#ef4444' }} title={r.error}>❌</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 요약 바 */}
      {doneResults.length > 0 && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16, padding: '12px 16px', borderRadius: 10, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', fontSize: 13 }}>
          <span>📄 {doneResults.length}개 완료</span>
          <span>📑 총 {totalPages}p</span>
          <span>💰 ₩{totalCost}</span>
          <span>⏱️ {Math.round(totalTime)}초</span>
          <span>📊 p당 {totalPages > 0 ? (totalTime / totalPages).toFixed(1) : 0}초</span>
        </div>
      )}

      {/* 액션 버튼 */}
      {isDone && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <button onClick={downloadCSV}
            style={{ padding: '10px 20px', borderRadius: 8, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e', fontSize: 13, cursor: 'pointer' }}>
            📊 CSV 리포트 다운로드
          </button>
          <button onClick={downloadAllEpubs}
            style={{ padding: '10px 20px', borderRadius: 8, background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#3b82f6', fontSize: 13, cursor: 'pointer' }}>
            📚 EPUB 전체 재다운로드
          </button>
          <button onClick={() => { setResults([]); setLogs([]); setIsDone(false) }}
            style={{ padding: '10px 20px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#aaa', fontSize: 13, cursor: 'pointer' }}>
            🔄 초기화
          </button>
        </div>
      )}

      {/* 로그 */}
      <div style={{ background: '#0a0a14', borderRadius: 8, padding: 16, maxHeight: 400, overflow: 'auto', fontSize: 11, lineHeight: 1.7 }}>
        <div style={{ color: '#555', marginBottom: 8, fontWeight: 600 }}>실시간 로그</div>
        {logs.length === 0 ? (
          <div style={{ color: '#333' }}>폴더를 선택하면 로그가 표시됩니다</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} style={{
              color: log.includes('❌') || log.includes('ERROR') ? '#ef4444'
                : log.includes('✅') ? '#22c55e'
                : log.includes('📄') ? '#F59E0B'
                : log.includes('🖼️') || log.includes('📦') ? '#3b82f6'
                : log.includes('━━━') ? '#888'
                : '#777',
              borderBottom: '1px solid rgba(255,255,255,0.02)', padding: '1px 0',
            }}>
              {log}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
