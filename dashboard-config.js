// Quotewright quote console — configuration.
// The anon key is a PUBLIC key (safe to ship in the browser); Row Level Security
// on the `quotes` table is what actually protects the data — see dashboard-rls.sql.
// Paste your project's anon key below (Supabase -> Project Settings -> API -> anon public).
window.QW_CONFIG = {
  SUPABASE_URL: "https://mtwgxwylufebaisawxvw.supabase.co",
  SUPABASE_ANON_KEY: "PASTE_ANON_PUBLIC_KEY_HERE",
  OWNER: "hassannonwovens",
};
