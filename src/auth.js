import { requireSupabase } from './supabase';

export async function signInWithPassword(email, password) {
  return requireSupabase().auth.signInWithPassword({ email, password });
}

export async function signUp(email, password, displayName) {
  return requireSupabase().auth.signUp({ email, password, options: { data: { display_name: displayName } } });
}

export async function signOut() {
  return requireSupabase().auth.signOut();
}

export function subscribeToAuth(callback) {
  return requireSupabase().auth.onAuthStateChange((_event, session) => callback(session));
}
