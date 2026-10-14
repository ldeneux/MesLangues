import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Utilise la service role côté serveur pour créer la partie
// (à définir dans les variables d'env Vercel : SUPABASE_SERVICE_ROLE_KEY)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans caractères ambigus
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const visualTheme = body.visualTheme ?? 'defaut';
  const levelIds = body.levelIds ?? ['CM1'];
  const categoryIds = body.categoryIds ?? [];
  const mode = body.mode ?? 'classique';
  const profileId = body.profileId ?? null;

  const joinCode = generateJoinCode();

  const { data, error } = await supabaseAdmin
    .from('games')
    .insert({
      join_code: joinCode,
      visual_theme: visualTheme,
      level_ids: levelIds,
      category_ids: categoryIds,
      mode,
      profile_id: profileId,
      status: 'lobby',
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ game: data });
}
