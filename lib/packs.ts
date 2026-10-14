// Pack « <préfixe> · <catégorie> » (créé au besoin) où vont les questions importées : à ajouter à un profil dans Paramétrage.
export async function ensurePack(
  supabaseAdmin: any,
  prefix: string,
  categoryId: string,
  levelId: string
): Promise<{ packId?: string; packName: string; error?: string }> {
  const { data: cat } = await supabaseAdmin.from('categories').select('name').eq('id', categoryId).single();
  const packName = `${prefix} · ${cat?.name ?? 'Divers'}`;
  const { data: existing } = await supabaseAdmin
    .from('question_packs')
    .select('id')
    .eq('name', packName)
    .eq('level_id', levelId)
    .eq('category_id', categoryId)
    .limit(1);
  if (existing?.[0]?.id) return { packId: existing[0].id, packName };
  const { data: created, error } = await supabaseAdmin
    .from('question_packs')
    .insert({ name: packName, level_id: levelId, category_id: categoryId })
    .select('id')
    .single();
  if (error || !created) return { packName, error: `Pack non créé : ${error?.message}` };
  return { packId: created.id, packName };
}

export const insertErrorMessage = (message: string) =>
  `${message}.${/media_url/.test(message) ? " Exécute supabase/migration-015-media.sql dans l'éditeur SQL de Supabase." : ''}`;
