'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, RefreshCw, ChevronLeft, ChevronRight, BarChart3, FileText, Clock, DollarSign, AlertTriangle, Image, Shield, Smartphone, Monitor, Coins } from 'lucide-react';
import Link from 'next/link';

interface Stats {
  totalConversions: number;
  totalPages: number;
  successfulPages: number;
  failedPages: number;
  totalCostWon: number;
  totalRevenue: number;
  totalImagesExtracted: number;
  totalMasksDetected: number;
  totalJpegCompressed: number;
  totalFileSizeBytes: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  avgDurationSeconds: number;
  avgPagesPerConversion: number;
  successRate: number;
  statusBreakdown: { success: number; partial: number; failed: number };
  deviceBreakdown: { mobile: number; desktop: number; other: number };
}

interface LogEntry {
  id: string;
  created_at: string;
  file_name: string;
  file_size_bytes: number;
  total_pages: number;
  successful_pages: number;
  failed_pages: number;
  batch_count: number;
  duration_seconds: number;
  cost_won: number;
  status: string;
  images_extracted: number;
  masks_detected: number;
  jpeg_compressed_pages: number;
  failed_page_numbers: number[];
  error_messages: string[];
  user_agent: string;
  payment_id: string;
  payment_amount: number;
  referrer: string;
  device_type: string;
  input_tokens: number;
  output_tokens: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function AdminDashboard() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const fetchData = useCallback(async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/stats?days=${days}&page=${page}&limit=50`, {
        headers: { 'x-admin-key': password },
      });
      if (res.status === 401) {
        setAuthenticated(false);
        setError('인증 실패');
        return;
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setStats(data.stats);
      setLogs(data.logs || []);
      setPagination(data.pagination);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [days, password]);

  useEffect(() => {
    if (authenticated) fetchData();
  }, [authenticated, days, fetchData]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim()) {
      setAuthenticated(true);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}m ${s}s`;
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'success': return '#4ade80';
      case 'partial': return '#fbbf24';
      case 'failed': return '#f87171';
      default: return '#9ca3af';
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'success': return '성공';
      case 'partial': return '부분성공';
      case 'failed': return '실패';
      default: return status;
    }
  };

  const deviceLabel = (d: string) => {
    switch (d) {
      case 'mobile': return '모바일';
      case 'desktop': return 'PC';
      default: return d || '기타';
    }
  };

  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toString();
  };

  // ━━━ 로그인 화면 ━━━
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
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin(e)}
              placeholder="관리자 비밀번호"
              style={{
                width: '100%', padding: '12px 16px', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8, color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box',
              }}
              autoFocus
            />
            <button
              onClick={handleLogin}
              style={{
                width: '100%', padding: '12px 0', marginTop: 12, background: '#a78bfa', color: '#000',
                border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/" style={{ color: 'rgba(255,255,255,0.4)', display: 'flex' }}><ArrowLeft size={18} /></Link>
          <h1 style={{ fontSize: 16, fontWeight: 600 }}>TeXTREME Admin</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <select
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '6px 10px', borderRadius: 6, fontSize: 13 }}
          >
            <option value={7}>최근 7일</option>
            <option value={30}>최근 30일</option>
            <option value={90}>최근 90일</option>
            <option value={365}>최근 1년</option>
          </select>
          <button
            onClick={() => fetchData(pagination.page)}
            disabled={loading}
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> 새로고침
          </button>
        </div>
      </div>

      <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
        {/* 통계 카드 */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14, marginBottom: 28 }}>
            <StatCard icon={<FileText size={18} />} label="총 변환" value={stats.totalConversions.toString()} sub={`${stats.totalPages.toLocaleString()} 페이지`} color="#a78bfa" />
            <StatCard icon={<BarChart3 size={18} />} label="성공률" value={`${stats.successRate.toFixed(1)}%`} sub={`성공 ${stats.statusBreakdown.success} · 부분 ${stats.statusBreakdown.partial} · 실패 ${stats.statusBreakdown.failed}`} color="#4ade80" />
            <StatCard icon={<Clock size={18} />} label="평균 변환시간" value={formatDuration(stats.avgDurationSeconds)} sub={`평균 ${stats.avgPagesPerConversion.toFixed(0)}p/건`} color="#38bdf8" />
            <StatCard icon={<DollarSign size={18} />} label="총 매출" value={`₩${stats.totalRevenue.toLocaleString()}`} sub={`API비용 ₩${stats.totalCostWon.toLocaleString()}`} color="#fbbf24" />
            <StatCard icon={<Coins size={18} />} label="Gemini 토큰" value={formatTokens(stats.totalInputTokens + stats.totalOutputTokens)} sub={`In ${formatTokens(stats.totalInputTokens)} · Out ${formatTokens(stats.totalOutputTokens)}`} color="#f472b6" />
            <StatCard icon={<Image size={18} />} label="이미지 추출" value={stats.totalImagesExtracted.toString()} sub={`JPEG압축 ${stats.totalJpegCompressed}p`} color="#34d399" />
            <StatCard icon={<AlertTriangle size={18} />} label="마스크 감지" value={stats.totalMasksDetected.toString()} sub={`실패 ${stats.failedPages}p`} color="#fb923c" />
            <StatCard icon={<Smartphone size={18} />} label="디바이스" value={`${stats.deviceBreakdown.mobile} : ${stats.deviceBreakdown.desktop}`} sub={`모바일 : PC`} color="#60a5fa" />
          </div>
        )}

        {/* 로그 테이블 */}
        <div style={{ background: '#141414', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 15, fontWeight: 600 }}>변환 로그</h2>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{pagination.total}건</span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['시간', '파일명', '페이지', '성공', '실패', '시간', '결제', '디바이스', '토큰', '상태'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <>
                    <tr
                      key={log.id}
                      onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer', transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: 'rgba(255,255,255,0.5)' }}>{formatDate(log.created_at)}</td>
                      <td style={{ padding: '10px 12px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.file_name}>{log.file_name}</td>
                      <td style={{ padding: '10px 12px' }}>{log.total_pages}</td>
                      <td style={{ padding: '10px 12px', color: '#4ade80' }}>{log.successful_pages}</td>
                      <td style={{ padding: '10px 12px', color: log.failed_pages > 0 ? '#f87171' : 'rgba(255,255,255,0.3)' }}>{log.failed_pages}</td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{formatDuration(log.duration_seconds)}</td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>₩{log.payment_amount.toLocaleString()}</td>
                      <td style={{ padding: '10px 12px' }}>
                        {log.device_type === 'mobile' ? <Smartphone size={14} color="#60a5fa" /> : <Monitor size={14} color="#a78bfa" />}
                      </td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{formatTokens(log.input_tokens + log.output_tokens)}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: `${statusColor(log.status)}20`, color: statusColor(log.status) }}>
                          {statusLabel(log.status)}
                        </span>
                      </td>
                    </tr>
                    {expandedRow === log.id && (
                      <tr key={`${log.id}-detail`}>
                        <td colSpan={10} style={{ padding: '12px 20px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, fontSize: 12 }}>
                            <div>
                              <p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>파일 크기</p>
                              <p>{formatBytes(log.file_size_bytes)}</p>
                            </div>
                            <div>
                              <p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>배치 수</p>
                              <p>{log.batch_count}개</p>
                            </div>
                            <div>
                              <p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>결제 ID</p>
                              <p style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.5)', wordBreak: 'break-all' }}>{log.payment_id || '-'}</p>
                            </div>
                            <div>
                              <p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>이미지 추출</p>
                              <p>{log.images_extracted}개</p>
                            </div>
                            <div>
                              <p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>JPEG 압축</p>
                              <p>{log.jpeg_compressed_pages}p</p>
                            </div>
                            <div>
                              <p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>마스크 감지</p>
                              <p>{log.masks_detected}개</p>
                            </div>
                            <div>
                              <p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>유입 경로</p>
                              <p style={{ color: 'rgba(255,255,255,0.5)', wordBreak: 'break-all' }}>{log.referrer || '직접 접속'}</p>
                            </div>
                            <div>
                              <p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>토큰 (In/Out)</p>
                              <p>{formatTokens(log.input_tokens)} / {formatTokens(log.output_tokens)}</p>
                            </div>
                            <div>
                              <p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>User Agent</p>
                              <p style={{ wordBreak: 'break-all', color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{log.user_agent}</p>
                            </div>
                            {log.failed_page_numbers?.length > 0 && (
                              <div>
                                <p style={{ color: '#f87171', marginBottom: 4 }}>실패 페이지</p>
                                <p>{log.failed_page_numbers.join(', ')}</p>
                              </div>
                            )}
                            {log.error_messages?.length > 0 && (
                              <div style={{ gridColumn: '1 / -1' }}>
                                <p style={{ color: '#f87171', marginBottom: 4 }}>에러 메시지</p>
                                {log.error_messages.map((msg, i) => (
                                  <p key={i} style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', fontSize: 11 }}>{msg}</p>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={10} style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>
                      {loading ? '로딩 중...' : '데이터가 없습니다'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 페이지네이션 */}
          {pagination.totalPages > 1 && (
            <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16 }}>
              <button
                onClick={() => fetchData(pagination.page - 1)}
                disabled={pagination.page <= 1}
                style={{ background: 'transparent', border: 'none', color: pagination.page <= 1 ? 'rgba(255,255,255,0.2)' : '#fff', cursor: 'pointer', display: 'flex' }}
              >
                <ChevronLeft size={18} />
              </button>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => fetchData(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                style={{ background: 'transparent', border: 'none', color: pagination.page >= pagination.totalPages ? 'rgba(255,255,255,0.2)' : '#fff', cursor: 'pointer', display: 'flex' }}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </div>
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
