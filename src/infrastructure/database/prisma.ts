import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type Tx = Prisma.TransactionClient;
export type Db = PrismaClient | Tx;

/** Ejecuta una función en una transacción serializable (con reintentos por conflicto). */
export async function inTransaction<T>(fn: (tx: Tx) => Promise<T>, retries = 3): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 60_000,
        maxWait: 15_000,
      });
    } catch (e) {
      const conflict =
        e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034";
      if (!conflict || attempt >= retries) throw e;
    }
  }
}

/** Consecutivo atómico por nombre: documentos (OP, OC, REM…), seriales de bultos y lotes de producción del día. */
export async function nextSequence(tx: Tx, name: string): Promise<number> {
  const seq = await tx.sequence.upsert({
    where: { name },
    create: { name, value: 1 },
    update: { value: { increment: 1 } },
  });
  return seq.value;
}

export const pad = (v: number, size = 4) => String(v).padStart(size, "0");

/** Siguiente número de un documento con su prefijo: OC-0001, OP-0001, REM-0001… */
export async function nextDocCode(tx: Tx, prefix: string) {
  return `${prefix}-${pad(await nextSequence(tx, prefix))}`;
}
