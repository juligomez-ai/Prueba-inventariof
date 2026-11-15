/**
 * Carga rápida de los datos de ejemplo desde una "foto" SQL (prisma/demo-data.sql).
 *
 * La historia de 6 meses se simula una sola vez en local (npm run demo:export) y se guarda como
 * INSERTs. Simularla en el despliegue no es viable: la base está en São Paulo y los servidores de
 * build de Vercel en EE. UU., y la simulación hace ~30.000 consultas.
 * Al cargar, todas las fechas se desplazan para que la historia termine "hoy".
 */
import fs from "node:fs";
import type { PrismaClient } from "@prisma/client";

export const SNAPSHOT_FILE = "prisma/demo-data.sql";

export async function loadSnapshot(prisma: PrismaClient, file = SNAPSHOT_FILE) {
  const text = fs.readFileSync(file, "utf8");
  const header = text.match(/^-- snapshot: (\S+)/m);
  if (!header) throw new Error(`${file} no tiene la línea "-- snapshot: <fecha ISO>".`);
  const snapshotAt = new Date(header[1]);

  // Sentencias INSERT multi-fila de pg_dump (cada una termina en una línea que acaba en ");")
  const statements: string[] = [];
  let cur: string[] | null = null;
  for (const line of text.split("\n")) {
    if (!cur && line.startsWith("INSERT INTO ")) cur = [];
    if (cur) {
      cur.push(line);
      if (line.endsWith(");")) {
        statements.push(cur.join("\n"));
        cur = null;
      }
    }
  }
  console.log(`Cargando ${statements.length} bloques de datos de ejemplo…`);
  for (const sql of statements) await prisma.$executeRawUnsafe(sql);

  // Desplaza todas las fechas para que la historia termine hoy
  const shiftSeconds = Math.round((Date.now() - snapshotAt.getTime()) / 1000);
  const cols = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name <> '_prisma_migrations' AND data_type LIKE 'timestamp%'`;
  for (const c of cols)
    await prisma.$executeRawUnsafe(
      `UPDATE "${c.table_name}" SET "${c.column_name}" = "${c.column_name}" + make_interval(secs => $1) WHERE "${c.column_name}" IS NOT NULL`,
      shiftSeconds,
    );
  console.log(`Fechas desplazadas ${Math.round(shiftSeconds / 3600)} h para que la historia termine hoy.`);
}
