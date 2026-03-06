import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// 서버 전용 (service_role key → RLS 우회)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// ━━━ 타입 정의 ━━━
export interface ConversionLog {
  id?: string;
  created_at?: string;
  file_name: string;
  file_size_bytes: number;
  total_pages: number;
  successful_pages: number;
  failed_pages: number;
  batch_count: number;
  duration_seconds: number;
  cost_won: number;
  status: 'success' | 'partial' | 'failed';
  images_extracted: number;
  masks_detected: number;
  jpeg_compressed_pages: number;
  failed_page_numbers: number[];
  error_messages: string[];
  user_agent: string;
}
