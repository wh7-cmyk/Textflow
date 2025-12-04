import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dmgxwyhdpconpjhvnfjr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtZ3h3eWhkcGNvbnBqaHZuZmpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NTQwMDYsImV4cCI6MjA4MDQzMDAwNn0.ilw0kOzxqmnZpf7_VhYO7BBaony9a_flHqLaz2lprsQ';

export const supabase = createClient(supabaseUrl, supabaseKey);