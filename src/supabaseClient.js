import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pnzhagvqcjeojvlsxnzg.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuemhhZ3ZxY2plb2p2bHN4bnpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAxMzk4NzEsImV4cCI6MjA2NTcxNTg3MX0.fNLsZSFQR6yBovOGLji3zJlke7Ni1yASowXPmmeIxvk';

export const supabase = createClient(supabaseUrl, supabaseAnonKey); 