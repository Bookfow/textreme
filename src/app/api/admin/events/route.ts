export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const entry = {
      visitor_id: body.visitorId || 'unknown',
      session_id: body.sessionId || 'unknown',
      event_type: body.eventType || 'unknown',
      event_data: body.eventData || {},
      device_type: body.deviceType || '',
      referrer: (body.referrer || '').slice(0, 500),
      user_agent: (body.userAgent || req.headers.get('user-agent') || '').slice(0, 500),
      page_url: (body.pageUrl || '').slice(0, 200),
    };

    const { error } = await supabaseAdmin
      .from('user_events')
      .insert(entry);

    if (error) {
      console.error('Event insert error:', error.message, error.details);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Events API error:', err?.message || err);
    return NextResponse.json({ success: false, error: err?.message || 'unknown' }, { status: 500 });
  }
}
