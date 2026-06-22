// api/_lib/identity.js
// "One account = one person." A non-admin account is bound to the first person it
// reads for (first name + age). Later attempts with a different person are rejected,
// so a paying user can't farm readings for friends — everyone buys their own.
// Admins (see ADMIN_PRINCIPALS) are exempt and may read for anyone.
import { sbSelect, sbUpdate } from './supabase.js';
import { httpError, isAdmin } from './util.js';

export function firstName(name) {
  return String(name || '').trim().toLowerCase().split(/\s+/)[0] || '';
}

// Enforce + lazily bind the account identity. age may be a number or a YYYY-MM-DD
// (we accept a precomputed integer here). Allows ±1 year drift (birthdays) so the
// same person isn't blocked between a reading and a later horoscope signup.
export async function enforceIdentity({ owner, name, age }) {
  if (isAdmin(owner)) return { admin: true };
  const fn = firstName(name);
  const a = Number(age);

  const rows = await sbSelect('users', `principal=eq.${encodeURIComponent(owner)}&select=bound_first_name,bound_age&limit=1`);
  const u = Array.isArray(rows) && rows[0];

  // First gated action for this account → bind it.
  if (!u || u.bound_first_name == null) {
    await sbUpdate('users', `principal=eq.${encodeURIComponent(owner)}`, { bound_first_name: fn, bound_age: a });
    return { bound: true };
  }

  const sameName = u.bound_first_name === fn;
  const sameAge = Number.isFinite(a) && Math.abs(Number(u.bound_age) - a) <= 1;
  if (!sameName || !sameAge) {
    const who = u.bound_first_name ? u.bound_first_name[0].toUpperCase() + u.bound_first_name.slice(1) : 'one person';
    throw httpError(403, `This account is registered to ${who} (age ${u.bound_age}). Each account is for one person — please sign up and subscribe with your own email to get your reading.`);
  }
  return { ok: true };
}

// Age in whole years from a YYYY-MM-DD date of birth.
export function ageFromDob(dob) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dob || ''));
  if (!m) return null;
  const b = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const now = new Date();
  let age = now.getUTCFullYear() - b.getUTCFullYear();
  const mo = now.getUTCMonth() - b.getUTCMonth();
  if (mo < 0 || (mo === 0 && now.getUTCDate() < b.getUTCDate())) age--;
  return age;
}
