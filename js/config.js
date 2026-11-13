// Public settings only. The publishable key is safe to ship in the page; safety comes from RLS and RPC checks.
// Never put a secret / service_role key here.
export const SB_URL = "https://oaikkspkqdfoejjlusvk.supabase.co";
export const SB_KEY = "sb_publishable_4u1W0ookpNi_nzKiyhTiow_z41iQ5KR";
export const LOGIN_FN = SB_URL + "/functions/v1/student-login";

// Idle handling: touch the server at most once per this interval while the child is active.
export const TOUCH_EVERY_MS = 5 * 60 * 1000;
// Detect "teacher logged everyone out" by re-reading the session this often (read-only call).
export const REVOKE_POLL_MS = 2 * 60 * 1000;

// Picture password: picture no. 01..12, four pictures in order.
export const PICS = ["🐱", "🐶", "🐸", "🌟", "🍎", "🚗", "🎈", "🌈", "🐟", "🌻", "⚽", "🎵"];
export const PIC_LEN = 4;

