import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// The project URL and publishable key are safe to include in browser code.
// Database access is controlled by the policies in supabase/schema.sql.
export const db = createClient(
  'https://rotzraiqgmpoewcgwfcb.supabase.co',
  'sb_publishable_rc_9j8qQR8SyCxo6GVGxgw_f7iJWafF'
);
