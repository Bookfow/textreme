import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const { error } = await supabaseAdmin
      .from('user_events')
      .insert({
        visitor_id: body.visitorId || 'unknown',
        session_id: body.sessionId || 'unknown',
        event_type: body.eventType || 'unknown',
        event_data: body.eventData || {},
        device_type: body.deviceType || '',
        referrer: body.referrer || '',
        user_agent: body.userAgent || req.headers.get('user-agent') || '',
        page_url: body.pageUrl || '',
      });

    if (error) {
      console.error('Event insert error:', error);
      return NextResponse.json({ success: false }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
