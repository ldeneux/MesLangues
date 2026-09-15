'use server';

import { supabaseAdmin } from './supabaseAdmin';

export type Profile = {
  id: string;
  display_name: string;
  emoji: string;
};

export async function listProfiles(): Promise<Profile[]> {
  const { data, error } = await supabaseAdmin
    .from('user_profiles')
    .select('id, display_name, emoji')
    .order('created_at');

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createProfile(displayName: string, emoji: string): Promise<Profile> {
  const clean = displayName.trim();
  if (!clean) throw new Error('Le nom du profil ne peut pas être vide');

  const { data, error } = await supabaseAdmin
    .from('user_profiles')
    .insert({ display_name: clean, emoji })
    .select('id, display_name, emoji')
    .single();

  if (error) throw new Error(error.message);
  return data;
}
