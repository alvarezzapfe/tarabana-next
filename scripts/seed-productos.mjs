import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local without dotenv dependency
const envPath = resolve(import.meta.dirname, "../.env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m) process.env[m[1]] = m[2];
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const cervezas = [
  { nombre: "Brisa", estilo: "Session IPA", abv: 4.7, slug: "brisa" },
  { nombre: "Caliza", estilo: "New England IPA", abv: 6.3, slug: "caliza" },
  { nombre: "Chula Vista", estilo: "West Coast IPA", abv: 6.5, slug: "chula-vista" },
  { nombre: "Magma", estilo: "Double IPA", abv: 8.3, slug: "magma" },
  { nombre: "Oleaje", estilo: "Lager Mexicana", abv: 4.5, slug: "oleaje" },
  { nombre: "Sílice", estilo: "Czech Pale Lager", abv: 5.1, slug: "silice" },
  { nombre: "Terragrana", estilo: "Red IPA", abv: 7.1, slug: "terragrana" },
];

const BUCKET = "productos";
const LATAS_DIR = resolve("public/latas");

async function main() {
  console.log("── Subiendo imágenes al bucket '%s' ──\n", BUCKET);

  const rows = [];

  for (const c of cervezas) {
    const file = `${c.slug}.webp`;
    const path = resolve(LATAS_DIR, file);
    const buffer = readFileSync(path);
    const storagePath = `latas/${file}`;

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType: "image/webp",
        upsert: true,
      });

    if (upErr) {
      console.error(`  ✗ ${file}: ${upErr.message}`);
      process.exit(1);
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

    console.log(`  ✓ ${file} → ${publicUrl}`);

    rows.push({
      nombre: c.nombre,
      estilo: c.estilo,
      abv: c.abv,
      imagen_url: publicUrl,
      activo: true,
    });
  }

  console.log("\n── Insertando productos ──\n");

  const { data, error } = await supabase
    .from("productos")
    .insert(rows)
    .select("id, nombre, estilo, abv, imagen_url, activo");

  if (error) {
    console.error("  ✗ Insert error:", error.message);
    process.exit(1);
  }

  console.table(data);
  console.log("\n✓ %d productos sembrados.", data.length);
}

main();
