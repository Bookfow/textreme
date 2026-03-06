'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, RefreshCw, ChevronLeft, ChevronRight, BarChart3, FileText, Clock, DollarSign, AlertTriangle, Image, Shield, Smartphone, Monitor, Coins, Users, TrendingUp, Eye, MousePointer } from 'lucide-react';
import Link from 'next/link';

// ━━━ 타입 ━━━
interface Stats {
  totalConversions: number; totalPages: number; successfulPages: number; failedPages: number;
  totalCostWon: number; totalRevenue: number; totalImagesExtracted: number; totalMasksDetected: number;
  totalJpegCompressed: number; totalFileSizeBytes: number; totalInputTokens: number; totalOutputTokens: number;
  avgDurationSeconds: number; avgPagesPerConversion: number; successRate: number;
  statusBreakdown: { success: number; partial: number; failed: number };
  deviceBreakdown: { mobile: number; desktop: number; other: number };
}
interface LogEntry {
  id: string; created_at: string; file_name: string; file_size_bytes: number; total_pages: number;
  successful_pages: number; failed_pages: number; batch_count: number; duration_seconds: number;
  cost_won: number; status: string; images_extracted: number; masks_detected: number;
  jpeg_compressed_pages: number; failed_page_numbers: number[]; error_messages: string[];
  user_agent: string; payment_id: string; payment_amount: number; referrer: string;
  device_type: string; input_tokens: number; output_tokens: number;
}
interface Pagination { page: number; limit: number; total: number; totalPages: number }
interface FunnelStep { event: string; label: string; count: number; uniqueVisitors: number }
interface Analytics {
  funnel: FunnelStep[];
  visitors: { unique: number; sessions: number; returning: number; returnRate: number };
  devices: { mobile: number; desktop: number };
  topReferrers: { source: string; count: number }[];
  compatibility: { ok: number; warn: number; block: number; warnProceeded: number };
  payment: { starts: number; completes: number; cancels: number; quotaBlocked: number };
  viewer: { opens: number; avgDurationSeconds: number; settingChanges: Record<string, number> };
  fileTypes: Record<string, number>;
  dailyTrend: { date: string; visitors: number; conversions: number; revenue: number }[];
}

export default function AdminDashboard() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [tab, setTab] = useState<'logs' | 'analytics'>('logs');
  const [stats, setStats] = useState<Stats | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const fetchLogs = useCallback(async (page = 1) => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/admin/stats?days=${days}&page=${page}&limit=50`, { headers: { 'x-admin-key': password } });
      if (res.status === 401) { setAuthenticated(false); setError('인증 실패'); return; }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setStats(data.stats); setLogs(data.logs || []); setPagination(data.pagination);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }, [days, password]);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/admin/analytics?days=${days}`, { headers: { 'x-admin-key': password } });
      if (res.status === 401) { setAuthenticated(false); setError('인증 실패'); return; }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAnalytics(data);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }, [days, password]);

  useEffect(() => {
    if (authenticated) {
      if (tab === 'logs') fetchLogs();
      else fetchAnalytics();
    }
  }, [authenticated, days, tab, fetchLogs, fetchAnalytics]);

  const fmt = {
    bytes: (b: number) => { if (!b) return '0 B'; const k = 1024; const s = ['B','KB','MB','GB']; const i = Math.floor(Math.log(b)/Math.log(k)); return parseFloat((b/Math.pow(k,i)).toFixed(1))+' '+s[i]; },
    dur: (s: number) => { if (s < 60) return s.toFixed(1)+'s'; return Math.floor(s/60)+'m '+Math.round(s%60)+'s'; },
    date: (iso: string) => new Date(iso).toLocaleString('ko-KR', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }),
    tokens: (n: number) => { if (n>=1e6) return (n/1e6).toFixed(1)+'M'; if (n>=1e3) return (n/1e3).toFixed(1)+'K'; return n.toString(); },
    pct: (n: number, total: number) => total > 0 ? (n / total * 100).toFixed(1) + '%' : '0%',
  };
  const statusColor = (s: string) => s==='success'?'#4ade80':s==='partial'?'#fbbf24':s==='failed'?'#f87171':'#9ca3af';
  const statusLabel = (s: string) => s==='success'?'성공':s==='partial'?'부분성공':s==='failed'?'실패':s;

  // ━━━ 로그인 ━━━
  if (!authenticated) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#141414', borderRadius: 16, padding: 40, width: 360, border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <Shield size={32} color="#a78bfa" />
            <h1 style={{ color: '#fff', fontSize: 20, marginTop: 12 }}>Admin Dashboard</h1>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 4 }}>TeXTREME 관리자 전용</p>
          </div>
          <div>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && password.trim() && setAuthenticated(true)}
              placeholder="관리자 비밀번호"
              style={{ width: '100%', padding: '12px 16px', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
              autoFocus />
            <button onClick={() => password.trim() && setAuthenticated(true)}
              style={{ width: '100%', padding: '12px 0', marginTop: 12, background: '#a78bfa', color: '#000', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              로그인
            </button>
            {error && <p style={{ color: '#f87171', fontSize: 13, marginTop: 8, textAlign: 'center' }}>{error}</p>}
          </div>
        </div>
      </div>
    );
  }

  // ━━━ 대시보드 ━━━
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#fff' }}>
      {/* 헤더 */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/" style={{ color: 'rgba(255,255,255,0.4)', display: 'flex' }}><ArrowLeft size={18} /></Link>
          <h1 style={{ fontSize: 16, fontWeight: 600 }}>TeXTREME Admin</h1>
          <div style={{ display: 'flex', gap: 4, background: '#1a1a1a', borderRadius: 8, padding: 3 }}>
            {(['logs', 'analytics'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{ padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer',
                  background: tab === t ? '#a78bfa' : 'transparent', color: tab === t ? '#000' : 'rgba(255,255,255,0.5)' }}>
                {t === 'logs' ? '변환 로그' : '사용자 분석'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <select value={days} onChange={e => setDays(Number(e.target.value))}
            style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '6px 10px', borderRadius: 6, fontSize: 13 }}>
            <option value={1}>오늘</option><option value={7}>최근 7일</option><option value={30}>최근 30일</option><option value={90}>최근 90일</option><option value={365}>최근 1년</option>
          </select>
          <button onClick={() => tab === 'logs' ? fetchLogs(pagination.page) : fetchAnalytics()} disabled={loading}
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
            <RefreshCw size={14} /> 새로고침
          </button>
        </div>
      </div>

      <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
        {tab === 'logs' ? (
          <>
            {/* ━━━ 변환 로그 탭 ━━━ */}
            {stats && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14, marginBottom: 28 }}>
                <StatCard icon={<FileText size={18} />} label="총 변환" value={stats.totalConversions.toString()} sub={`${stats.totalPages.toLocaleString()}p`} color="#a78bfa" />
                <StatCard icon={<BarChart3 size={18} />} label="성공률" value={`${stats.successRate.toFixed(1)}%`} sub={`성공${stats.statusBreakdown.success} 부분${stats.statusBreakdown.partial} 실패${stats.statusBreakdown.failed}`} color="#4ade80" />
                <StatCard icon={<Clock size={18} />} label="평균 시간" value={fmt.dur(stats.avgDurationSeconds)} sub={`평균 ${stats.avgPagesPerConversion.toFixed(0)}p/건`} color="#38bdf8" />
                <StatCard icon={<DollarSign size={18} />} label="총 매출" value={`₩${stats.totalRevenue.toLocaleString()}`} sub={`API비용 ₩${stats.totalCostWon.toLocaleString()}`} color="#fbbf24" />
                <StatCard icon={<Coins size={18} />} label="Gemini 토큰" value={fmt.tokens(stats.totalInputTokens + stats.totalOutputTokens)} sub={`In ${fmt.tokens(stats.totalInputTokens)} Out ${fmt.tokens(stats.totalOutputTokens)}`} color="#f472b6" />
                <StatCard icon={<Image size={18} />} label="이미지" value={stats.totalImagesExtracted.toString()} sub={`JPEG압축 ${stats.totalJpegCompressed}p`} color="#34d399" />
                <StatCard icon={<AlertTriangle size={18} />} label="마스크" value={stats.totalMasksDetected.toString()} sub={`실패 ${stats.failedPages}p`} color="#fb923c" />
                <StatCard icon={<Smartphone size={18} />} label="디바이스" value={`${stats.deviceBreakdown.mobile}:${stats.deviceBreakdown.desktop}`} sub="모바일 : PC" color="#60a5fa" />
              </div>
            )}

            {/* 로그 테이블 */}
            <div style={{ background: '#141414', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between' }}>
                <h2 style={{ fontSize: 15, fontWeight: 600 }}>변환 로그</h2>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{pagination.total}건</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {['시간','파일명','페이지','성공','실패','시간','결제','디바이스','토큰','상태'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {logs.map(log => (
                      <>
                        <tr key={log.id} onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                          style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: 'rgba(255,255,255,0.5)' }}>{fmt.date(log.created_at)}</td>
                          <td style={{ padding: '10px 12px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.file_name}>{log.file_name}</td>
                          <td style={{ padding: '10px 12px' }}>{log.total_pages}</td>
                          <td style={{ padding: '10px 12px', color: '#4ade80' }}>{log.successful_pages}</td>
                          <td style={{ padding: '10px 12px', color: log.failed_pages > 0 ? '#f87171' : 'rgba(255,255,255,0.3)' }}>{log.failed_pages}</td>
                          <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{fmt.dur(log.duration_seconds)}</td>
                          <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>₩{log.payment_amount.toLocaleString()}</td>
                          <td style={{ padding: '10px 12px' }}>{log.device_type === 'mobile' ? <Smartphone size={14} color="#60a5fa" /> : <Monitor size={14} color="#a78bfa" />}</td>
                          <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{fmt.tokens(log.input_tokens + log.output_tokens)}</td>
                          <td style={{ padding: '10px 12px' }}><span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: statusColor(log.status)+'20', color: statusColor(log.status) }}>{statusLabel(log.status)}</span></td>
                        </tr>
                        {expandedRow === log.id && (
                          <tr key={log.id+'-d'}><td colSpan={10} style={{ padding: '12px 20px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, fontSize: 12 }}>
                              <div><p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>파일 크기</p><p>{fmt.bytes(log.file_size_bytes)}</p></div>
                              <div><p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>배치 수</p><p>{log.batch_count}개</p></div>
                              <div><p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>결제 ID</p><p style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.5)', wordBreak: 'break-all' }}>{log.payment_id || '-'}</p></div>
                              <div><p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>이미지</p><p>{log.images_extracted}개</p></div>
                              <div><p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>JPEG 압축</p><p>{log.jpeg_compressed_pages}p</p></div>
                              <div><p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>마스크</p><p>{log.masks_detected}개</p></div>
                              <div><p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>유입 경로</p><p style={{ color: 'rgba(255,255,255,0.5)', wordBreak: 'break-all' }}>{log.referrer || '직접 접속'}</p></div>
                              <div><p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>토큰</p><p>{fmt.tokens(log.input_tokens)} / {fmt.tokens(log.output_tokens)}</p></div>
                              <div><p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>UA</p><p style={{ wordBreak: 'break-all', color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{log.user_agent}</p></div>
                              {log.failed_page_numbers?.length > 0 && <div><p style={{ color: '#f87171', marginBottom: 4 }}>실패 페이지</p><p>{log.failed_page_numbers.join(', ')}</p></div>}
                              {log.error_messages?.length > 0 && <div style={{ gridColumn: '1/-1' }}><p style={{ color: '#f87171', marginBottom: 4 }}>에러</p>{log.error_messages.map((m,i) => <p key={i} style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', fontSize: 11 }}>{m}</p>)}</div>}
                            </div>
                          </td></tr>
                        )}
                      </>
                    ))}
                    {logs.length === 0 && <tr><td colSpan={10} style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>{loading ? '로딩 중...' : '데이터가 없습니다'}</td></tr>}
                  </tbody>
                </table>
              </div>
              {pagination.totalPages > 1 && (
                <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'center', gap: 16, alignItems: 'center' }}>
                  <button onClick={() => fetchLogs(pagination.page - 1)} disabled={pagination.page <= 1} style={{ background: 'transparent', border: 'none', color: pagination.page <= 1 ? 'rgba(255,255,255,0.2)' : '#fff', cursor: 'pointer' }}><ChevronLeft size={18} /></button>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{pagination.page}/{pagination.totalPages}</span>
                  <button onClick={() => fetchLogs(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages} style={{ background: 'transparent', border: 'none', color: pagination.page >= pagination.totalPages ? 'rgba(255,255,255,0.2)' : '#fff', cursor: 'pointer' }}><ChevronRight size={18} /></button>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* ━━━ 사용자 분석 탭 ━━━ */}
            {analytics && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* 방문자 카드 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14 }}>
                  <StatCard icon={<Users size={18} />} label="고유 방문자" value={analytics.visitors.unique.toString()} sub={`${analytics.visitors.sessions} 세션`} color="#a78bfa" />
                  <StatCard icon={<TrendingUp size={18} />} label="재방문율" value={`${analytics.visitors.returnRate.toFixed(1)}%`} sub={`${analytics.visitors.returning}명 재방문`} color="#4ade80" />
                  <StatCard icon={<Smartphone size={18} />} label="디바이스" value={`${analytics.devices.mobile} : ${analytics.devices.desktop}`} sub="모바일 : PC" color="#60a5fa" />
                  <StatCard icon={<Eye size={18} />} label="뷰어 사용" value={analytics.viewer.opens.toString()} sub={`평균 ${fmt.dur(analytics.viewer.avgDurationSeconds)} 열람`} color="#f472b6" />
                  <StatCard icon={<MousePointer size={18} />} label="결제 전환율" value={fmt.pct(analytics.payment.completes, analytics.payment.starts)} sub={`시도 ${analytics.payment.starts} → 완료 ${analytics.payment.completes}`} color="#fbbf24" />
                  <StatCard icon={<AlertTriangle size={18} />} label="Quota 차단" value={analytics.payment.quotaBlocked.toString()} sub={`결제 취소 ${analytics.payment.cancels}`} color="#fb923c" />
                </div>

                {/* 퍼널 */}
                <div style={{ background: '#141414', borderRadius: 12, padding: 24, border: '1px solid rgba(255,255,255,0.06)' }}>
                  <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 20 }}>전환 퍼널</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {analytics.funnel.map((step, i) => {
                      const maxCount = analytics.funnel[0]?.count || 1;
                      const pct = maxCount > 0 ? (step.count / maxCount * 100) : 0;
                      const prevCount = i > 0 ? analytics.funnel[i - 1].count : step.count;
                      const dropoff = prevCount > 0 ? ((prevCount - step.count) / prevCount * 100) : 0;
                      return (
                        <div key={step.event}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', minWidth: 120 }}>{step.label}</span>
                            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{step.count}</span>
                              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{step.uniqueVisitors}명</span>
                              {i > 0 && dropoff > 0 && <span style={{ fontSize: 11, color: '#f87171' }}>-{dropoff.toFixed(0)}%</span>}
                            </div>
                          </div>
                          <div style={{ height: 6, background: 'rgba(255,255,255,0.04)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: pct + '%', background: 'linear-gradient(90deg, #a78bfa, #7c3aed)', borderRadius: 3, transition: 'width 0.5s' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  {/* 유입 경로 */}
                  <div style={{ background: '#141414', borderRadius: 12, padding: 24, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>유입 경로</h2>
                    {analytics.topReferrers.length === 0 && <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>데이터 없음</p>}
                    {analytics.topReferrers.map((r, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>{r.source}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#a78bfa' }}>{r.count}</span>
                      </div>
                    ))}
                  </div>

                  {/* 호환성 체크 */}
                  <div style={{ background: '#141414', borderRadius: 12, padding: 24, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>PDF 호환성 결과</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 13, color: '#4ade80' }}>정상 통과</span>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{analytics.compatibility.ok}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 13, color: '#fbbf24' }}>경고 (warn)</span>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{analytics.compatibility.warn}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 13, color: '#f87171' }}>차단 (block)</span>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{analytics.compatibility.block}</span>
                      </div>
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>경고에도 진행</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#fbbf24' }}>{analytics.compatibility.warnProceeded}</span>
                      </div>
                    </div>
                  </div>

                  {/* 파일 타입 분포 */}
                  <div style={{ background: '#141414', borderRadius: 12, padding: 24, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>업로드 파일 타입</h2>
                    {Object.entries(analytics.fileTypes).length === 0 && <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>데이터 없음</p>}
                    {Object.entries(analytics.fileTypes).sort((a,b) => b[1]-a[1]).map(([type, count]) => (
                      <div key={type} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>{type}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#34d399' }}>{count}</span>
                      </div>
                    ))}
                  </div>

                  {/* 뷰어 설정 변경 */}
                  <div style={{ background: '#141414', borderRadius: 12, padding: 24, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>뷰어 설정 변경</h2>
                    {Object.entries(analytics.viewer.settingChanges).length === 0 && <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>데이터 없음</p>}
                    {Object.entries(analytics.viewer.settingChanges).sort((a,b) => b[1]-a[1]).map(([setting, count]) => (
                      <div key={setting} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>{setting}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#f472b6' }}>{count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 일별 추이 */}
                {analytics.dailyTrend.length > 0 && (
                  <div style={{ background: '#141414', borderRadius: 12, padding: 24, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>일별 추이</h2>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          {['날짜', '방문자', '변환', '매출'].map(h => (
                            <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {analytics.dailyTrend.slice(-14).map(d => (
                            <tr key={d.date} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                              <td style={{ padding: '8px 12px', color: 'rgba(255,255,255,0.5)' }}>{d.date}</td>
                              <td style={{ padding: '8px 12px', color: '#a78bfa' }}>{d.visitors}</td>
                              <td style={{ padding: '8px 12px', color: '#4ade80' }}>{d.conversions}</td>
                              <td style={{ padding: '8px 12px', color: '#fbbf24' }}>₩{d.revenue.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
            {!analytics && !loading && <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', padding: 40 }}>데이터를 불러오는 중...</p>}
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{ background: '#141414', borderRadius: 12, padding: 18, border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ color }}>{icon}</div>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>{sub}</div>
    </div>
  );
}
