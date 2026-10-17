/* Public client config. The publishable (anon) key is safe in the browser:
   every table is protected by row-level security and needs a signed-in household member. */
window.FIN_CONFIG = {
  supabaseUrl: 'https://YOUR-PROJECT-REF.supabase.co',
  supabaseKey: 'YOUR-PUBLISHABLE-ANON-KEY',
  version: '1',   // bump to bust browser caches after a deploy
};
