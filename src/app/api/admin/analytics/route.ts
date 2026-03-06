export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('x-admin-key');
  if (authHeader !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const days = parseInt(url.searchParams.get('days') || '30');

    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceISO = since.toISOString();

    // 전체 이벤트 가져오기
    const { data: events, error } = await supabaseAdmin
      .from('user_events')
      .select('event_type, visitor_id, session_id, event_data, device_type, referrer, created_at')
      .gte('created_at', sinceISO)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const evts = events || [];

    // ━━━ 퍼널 집계 ━━━
    const funnelOrder = [
      'page_view', 'file_upload', 'compat_check', 'pricing_view',
      'payment_start', 'payment_complete', 'conversion_start',
      'conversion_complete', 'epub_download'
    ];
    const funnelLabels: Record<string, string> = {
      page_view: '페이지 방문',
      file_upload: '파일 업로드',
      compat_check: '호환성 체크',
      pricing_view: '결제 페이지',
      payment_start: '결제 시도',
      payment_complete: '결제 완료',
      conversion_start: '변환 시작',
      conversion_complete: '변환 완료',
      epub_download: 'EPUB 다운로드',
    };
    const funnel = funnelOrder.map(type => ({
      event: type,
      label: funnelLabels[type] || type,
      count: evts.filter(e => e.event_type === type).length,
      uniqueVisitors: new Set(evts.filter(e => e.event_type === type).map(e => e.visitor_id)).size,
    }));

    // ━━━ 방문자 통계 ━━━
    const uniqueVisitors = new Set(evts.map(e => e.visitor_id)).size;
    const uniqueSessions = new Set(evts.map(e => e.session_id)).size;

    // 재방문자: 2개 이상 세션을 가진 visitor
    const visitorSessions: Record<string, Set<string>> = {};
    evts.forEach(e => {
      if (!visitorSessions[e.visitor_id]) visitorSessions[e.visitor_id] = new Set();
      visitorSessions[e.visitor_id].add(e.session_id);
    });
    const returnVisitors = Object.values(visitorSessions).filter(s => s.size >= 2).length;

    // ━━━ 디바이스 ━━━
    const pageViews = evts.filter(e => e.event_type === 'page_view');
    const deviceMobile = new Set(pageViews.filter(e => e.device_type === 'mobile').map(e => e.visitor_id)).size;
    const deviceDesktop = new Set(pageViews.filter(e => e.device_type === 'desktop').map(e => e.visitor_id)).size;

    // ━━━ 유입 경로 Top 10 ━━━
    const referrerCounts: Record<string, number> = {};
    pageViews.forEach(e => {
      let ref = e.referrer || '직접 접속';
      try {
        if (ref && ref !== '직접 접속') {
          ref = new URL(ref).hostname;
        }
      } catch {}
      referrerCounts[ref] = (referrerCounts[ref] || 0) + 1;
    });
    const topReferrers = Object.entries(referrerCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([source, count]) => ({ source, count }));

    // ━━━ 호환성 체크 결과 분포 ━━━
    const compatEvents = evts.filter(e => e.event_type === 'compat_check');
    const compatOk = compatEvents.filter(e => e.event_data?.result === 'ok').length;
    const compatWarn = compatEvents.filter(e => e.event_data?.result === 'warn').length;
    const compatBlock = compatEvents.filter(e => e.event_data?.result === 'block').length;
    const warnProceeded = evts.filter(e => e.event_type === 'warn_proceed').length;

    // ━━━ 뷰어 통계 ━━━
    const viewerOpens = evts.filter(e => e.event_type === 'viewer_open').length;
    const viewerCloses = evts.filter(e => e.event_type === 'viewer_close');
    const avgViewerDuration = viewerCloses.length > 0
      ? viewerCloses.reduce((s, e) => s + (e.event_data?.durationSeconds || 0), 0) / viewerCloses.length
      : 0;
    const settingChanges = evts.filter(e => e.event_type === 'viewer_setting');
    const settingTypes: Record<string, number> = {};
    settingChanges.forEach(e => {
      const setting = e.event_data?.setting || 'unknown';
      settingTypes[setting] = (settingTypes[setting] || 0) + 1;
    });

    // ━━━ 결제 이탈 ━━━
    const paymentStarts = evts.filter(e => e.event_type === 'payment_start').length;
    const paymentCompletes = evts.filter(e => e.event_type === 'payment_complete').length;
    const paymentCancels = evts.filter(e => e.event_type === 'payment_cancel').length;
    const quotaBlocked = evts.filter(e => e.event_type === 'quota_blocked').length;

    // ━━━ 파일 업로드 통계 ━━━
    const uploadEvents = evts.filter(e => e.event_type === 'file_upload');
    const fileTypes: Record<string, number> = {};
    uploadEvents.forEach(e => {
      const ext = e.event_data?.fileType || 'unknown';
      fileTypes[ext] = (fileTypes[ext] || 0) + 1;
    });

    // ━━━ 일별 추이 (최근 N일) ━━━
    const dailyMap: Record<string, { visitors: Set<string>, conversions: number, revenue: number }> = {};
    evts.forEach(e => {
      const day = e.created_at.slice(0, 10);
      if (!dailyMap[day]) dailyMap[day] = { visitors: new Set(), conversions: 0, revenue: 0 };
      dailyMap[day].visitors.add(e.visitor_id);
      if (e.event_type === 'conversion_complete') dailyMap[day].conversions++;
      if (e.event_type === 'payment_complete') dailyMap[day].revenue += e.event_data?.amount || 0;
    });
    const dailyTrend = Object.entries(dailyMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, d]) => ({
        date,
        visitors: d.visitors.size,
        conversions: d.conversions,
        revenue: d.revenue,
      }));

    return NextResponse.json({
      funnel,
      visitors: {
        unique: uniqueVisitors,
        sessions: uniqueSessions,
        returning: returnVisitors,
        returnRate: uniqueVisitors > 0 ? ((returnVisitors / uniqueVisitors) * 100) : 0,
      },
      devices: { mobile: deviceMobile, desktop: deviceDesktop },
      topReferrers,
      compatibility: { ok: compatOk, warn: compatWarn, block: compatBlock, warnProceeded },
      payment: { starts: paymentStarts, completes: paymentCompletes, cancels: paymentCancels, quotaBlocked },
      viewer: {
        opens: viewerOpens,
        avgDurationSeconds: avgViewerDuration,
        settingChanges: settingTypes,
      },
      fileTypes,
      dailyTrend,
    });
  } catch (err: any) {
    console.error('Analytics API error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
