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
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data: logs, count, error: logsError } = await supabaseAdmin
      .from('conversion_logs')
      .select('*', { count: 'exact' })
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (logsError) throw logsError;

    const { data: allLogs, error: allError } = await supabaseAdmin
      .from('conversion_logs')
      .select('total_pages, successful_pages, failed_pages, duration_seconds, cost_won, status, images_extracted, masks_detected, jpeg_compressed_pages, file_size_bytes, payment_amount, device_type, input_tokens, output_tokens')
      .gte('created_at', since.toISOString());

    if (allError) throw allError;

    const mobileCount = allLogs?.filter(l => l.device_type === 'mobile').length || 0;
    const pcCount = allLogs?.filter(l => l.device_type === 'desktop').length || 0;

    const stats = {
      totalConversions: allLogs?.length || 0,
      totalPages: allLogs?.reduce((s, l) => s + (l.total_pages || 0), 0) || 0,
      successfulPages: allLogs?.reduce((s, l) => s + (l.successful_pages || 0), 0) || 0,
      failedPages: allLogs?.reduce((s, l) => s + (l.failed_pages || 0), 0) || 0,
      totalCostWon: allLogs?.reduce((s, l) => s + (l.cost_won || 0), 0) || 0,
      totalRevenue: allLogs?.reduce((s, l) => s + (l.payment_amount || 0), 0) || 0,
      totalImagesExtracted: allLogs?.reduce((s, l) => s + (l.images_extracted || 0), 0) || 0,
      totalMasksDetected: allLogs?.reduce((s, l) => s + (l.masks_detected || 0), 0) || 0,
      totalJpegCompressed: allLogs?.reduce((s, l) => s + (l.jpeg_compressed_pages || 0), 0) || 0,
      totalFileSizeBytes: allLogs?.reduce((s, l) => s + (l.file_size_bytes || 0), 0) || 0,
      totalInputTokens: allLogs?.reduce((s, l) => s + (l.input_tokens || 0), 0) || 0,
      totalOutputTokens: allLogs?.reduce((s, l) => s + (l.output_tokens || 0), 0) || 0,
      avgDurationSeconds: allLogs?.length
        ? allLogs.reduce((s, l) => s + (l.duration_seconds || 0), 0) / allLogs.length
        : 0,
      avgPagesPerConversion: allLogs?.length
        ? allLogs.reduce((s, l) => s + (l.total_pages || 0), 0) / allLogs.length
        : 0,
      successRate: allLogs?.length
        ? (allLogs.filter(l => l.status === 'success').length / allLogs.length * 100)
        : 0,
      statusBreakdown: {
        success: allLogs?.filter(l => l.status === 'success').length || 0,
        partial: allLogs?.filter(l => l.status === 'partial').length || 0,
        failed: allLogs?.filter(l => l.status === 'failed').length || 0,
      },
      deviceBreakdown: {
        mobile: mobileCount,
        desktop: pcCount,
        other: (allLogs?.length || 0) - mobileCount - pcCount,
      },
    };

    return NextResponse.json({
      stats,
      logs,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (err: any) {
    console.error('Stats API error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
