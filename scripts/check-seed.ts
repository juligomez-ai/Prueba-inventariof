/** Resume los datos de ejemplo y verifica el invariante Kardex = bultos (saldo del último movimiento = suma de bultos). */
import { checkFeasibility, recipeCost } from "@/application/use-cases/production";
import { prisma } from "@/infrastructure/database/prisma";
import { productBalance, stockSummary } from "@/infrastructure/database/stock";

async function main() {
  const karite = await prisma.product.findUniqueOrThrow({ where: { sku: "MP-001" } });
  console.log("karité saldo", await productBalance(prisma, karite.id), "costo promedio", karite.avgCost.toString());
  const crema = await prisma.product.findUniqueOrThrow({ where: { sku: "PT-001" }, include: { recipe: true } });
  const rc = await recipeCost(crema.recipe!.id);
  console.log("crema costo lote", rc.batchCost, "unitario", rc.unitCost);
  const f = await checkFeasibility(crema.id, 250);
  console.log("250 cremas factible:", f.feasible, "máximo:", f.maxProducible, f.rows.filter((r) => r.shortage > 0).map((r) => `${r.name}: ${r.shortage}`));
  const s = await stockSummary(prisma);
  for (const sku of ["PT-001", "PT-002", "PT-003", "EMP-005"]) {
    const p = await prisma.product.findUniqueOrThrow({ where: { sku } });
    console.log(sku, s.get(p.id));
  }
  console.log("movimientos", await prisma.stockMovement.count(), "bultos", await prisma.container.count());
  const counts = await prisma.stockMovement.groupBy({ by: ["type"], _count: true });
  console.log(counts.map((c) => `${c.type}:${c._count}`).join(" "));
  let bad = 0;
  for (const p of await prisma.product.findMany()) {
    const last = await prisma.stockMovement.findFirst({ where: { productId: p.id }, orderBy: { number: "desc" } });
    const bal = await productBalance(prisma, p.id);
    if (last && Math.abs(Number(last.balanceAfter) - bal) > 1e-6) {
      bad++;
      console.log("DESCUADRE", p.sku, last.balanceAfter.toString(), bal);
    }
  }
  console.log(bad === 0 ? "Kardex = bultos: OK" : `${bad} descuadres`);
}
main().finally(() => prisma.$disconnect());
