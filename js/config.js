/* Public client config. The publishable key is safe in the browser:
   every table is protected by row-level security and needs a signed-in household member.
   NEVER put the secret (sb_secret_…) key in this file or anywhere in the repo. */
window.FIN_CONFIG = {
  supabaseUrl: 'https://sbloucgjyndaqnruxhxv.supabase.co',
  supabaseKey: 'sb_publishable_pyWZmZNwvqWpNapWOqaDAg_RmLfguVW',
  version: '18',   // bump to bust browser caches after a deploy
};
