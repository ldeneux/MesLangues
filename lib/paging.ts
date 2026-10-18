/**
 * Lit toutes les lignes d'une requête Supabase : chaque réponse est limitée à 1000 lignes, on enchaîne donc les pages.
 * `build(from, to)` doit renvoyer la requête avec `.order(...)` (ordre stable) et `.range(from, to)`.
 */
export async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}
