import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const logEntry = {
      file_name: body.fileName || 'unknown',
      file_size_bytes: body.fileSizeBytes || 0,
      total_pages: body.totalPages || 0,
      successful_pages: body.successfulPages || 0,
      failed_pages: body.failedPages || 0,
      batch_count: body.batchCount || 0,
      duration_seconds: body.durationSeconds || 0,
      cost_won: body.costWon || 0,
      status: body.status || 'unknown',
      images_extracted: body.imagesExtracted || 0,
      masks_detected: body.masksDetected || 0,
      jpeg_compressed_pages: body.jpegCompressedPages || 0,
      failed_page_numbers: body.failedPageNumbers || [],
      error_messages: body.errorMessages || [],
      user_agent: req.headers.get('user-agent') || 'unknown',
      payment_id: body.paymentId || '',
      payment_amount: body.paymentAmount || 0,
      referrer: body.referrer || '',
      device_type: body.deviceType || '',
      input_tokens: body.inputTokens || 0,
      output_tokens: body.outputTokens || 0,
    };

    const { error } = await supabaseAdmin
      .from('conversion_logs')
      .insert(logEntry);

    if (error) {
      console.error('Supabase insert error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Log API error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
