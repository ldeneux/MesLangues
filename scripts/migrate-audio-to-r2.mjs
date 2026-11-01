// Copie les fichiers audio du bucket Supabase « phrase-audio » vers Cloudflare R2, en gardant la même arborescence.
//
//   node scripts/migrate-audio-to-r2.mjs                 → copie (reprenable : les fichiers déjà copiés sont ignorés)
//   node scripts/migrate-audio-to-r2.mjs --dry-run       → compte seulement, ne copie rien
//   node scripts/migrate-audio-to-r2.mjs --delete-source → supprime de Supabase les fichiers dont la copie R2 est vérifiée
//
// Variables nécessaires (dans .env.local, jamais dans le dépôt) : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET. Voir LISEZ-MOI-R2.md.
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

// Lecture simple de .env.local (sans dépendance)
for (const file of ['.env.local', '.env']) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/\s+#.*$/, '').replace(/^["']|["']$/g, '');
  }
}

const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run');
const DELETE_SOURCE = args.has('--delete-source');
const BUCKET = 'phrase-audio';
const need = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];
const missing = need.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Variables manquantes : ${missing.join(', ')}`);
  process.exit(1);
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});
const publicBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}`;

// --- 1) Liste tous les fichiers du bucket (parcours des dossiers) ---
async function listAll() {
  const files = [];
  const queue = [''];
  let folders = 0;
  async function worker() {
    while (queue.length) {
      const prefix = queue.pop();
      folders++;
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await sb.storage.from(BUCKET).list(prefix, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
        if (error) throw new Error(`Liste de « ${prefix || '/'} » impossible : ${error.message}`);
        for (const item of data ?? []) {
          const path = prefix ? `${prefix}/${item.name}` : item.name;
          if (item.id === null) queue.push(path); // dossier
          else files.push({ path, size: item.metadata?.size ?? null });
        }
        if (!data || data.length < 1000) break;
      }
      if (folders % 200 === 0) console.log(`  … ${folders} dossiers parcourus, ${files.length} fichiers`);
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  return files;
}

async function r2Size(key) {
  try {
    const head = await r2.send(new HeadObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }));
    return head.ContentLength ?? 0;
  } catch (e) {
    if (e?.$metadata?.httpStatusCode === 404 || e?.name === 'NotFound') return null;
    throw e;
  }
}

async function pool(items, n, fn) {
  let i = 0;
  const results = [];
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const idx = i++;
        results[idx] = await fn(items[idx], idx);
      }
    })
  );
  return results;
}

console.log('Liste des fichiers Supabase…');
const files = await listAll();
const totalMo = files.reduce((s, f) => s + (f.size ?? 0), 0) / 1048576;
console.log(`${files.length} fichiers, environ ${Math.round(totalMo)} Mo dans « ${BUCKET} ».`);
if (DRY) process.exit(0);

if (!DELETE_SOURCE) {
  // --- 2) Copie vers R2 ---
  let copied = 0, skipped = 0, failed = 0;
  await pool(files, 10, async (f, idx) => {
    try {
      const existing = await r2Size(f.path);
      if (existing !== null && (f.size === null || existing === f.size)) {
        skipped++;
      } else {
        const res = await fetch(`${publicBase}/${f.path.split('/').map(encodeURIComponent).join('/')}`);
        if (!res.ok) throw new Error(`lecture Supabase ${res.status}`);
        const body = Buffer.from(await res.arrayBuffer());
        await r2.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: f.path, Body: body, ContentType: 'audio/mpeg', CacheControl: 'public, max-age=31536000' }));
        copied++;
      }
    } catch (e) {
      failed++;
      console.error(`ÉCHEC ${f.path} : ${e.message}`);
    }
    if ((copied + skipped + failed) % 500 === 0) console.log(`  ${copied + skipped + failed} / ${files.length} (copiés ${copied}, déjà là ${skipped}, échecs ${failed})`);
  });
  console.log(`\nTerminé : ${copied} copiés, ${skipped} déjà présents, ${failed} échecs.`);
  if (failed) console.log('Relance la même commande : seuls les fichiers en échec seront retentés.');
  else console.log('Étape suivante : exécute le SQL supabase/migrations/034_audio_vers_r2.sql, puis vérifie le son dans l\'appli.');
} else {
  // --- 3) Suppression de Supabase, uniquement si la copie R2 existe avec la même taille ---
  let removed = 0, kept = 0;
  const toRemove = [];
  await pool(files, 10, async (f) => {
    const size = await r2Size(f.path);
    if (size !== null && (f.size === null || size === f.size)) toRemove.push(f.path);
    else kept++;
  });
  for (let i = 0; i < toRemove.length; i += 100) {
    const { error } = await sb.storage.from(BUCKET).remove(toRemove.slice(i, i + 100));
    if (error) {
      console.error(`Suppression impossible : ${error.message}`);
      break;
    }
    removed += Math.min(100, toRemove.length - i);
  }
  console.log(`Supprimés de Supabase : ${removed}. Conservés (pas de copie R2 vérifiée) : ${kept}.`);
}
