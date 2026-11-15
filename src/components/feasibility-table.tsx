import type { Feasibility } from "@/application/use-cases/production";
import { fmtMoney, fmtQty } from "@/shared/numbers";
import { Badge, Table, Td, Th } from "./ui";

/** RF-9.3: requerido vs disponible vs faltante por insumo. */
export function FeasibilityTable({ f }: { f: Feasibility }) {
  return (
    <Table>
      <thead><tr><Th>Insumo</Th><Th className="text-right">Requerido</Th><Th className="text-right">Disponible</Th><Th className="text-right">Faltante</Th><Th className="text-right">Costo estimado</Th></tr></thead>
      <tbody>
        {f.rows.map((r) => (
          <tr key={r.productId} className={r.shortage > 0 ? "bg-red-50" : ""}>
            <Td>{r.sku} · {r.name}</Td>
            <Td className="text-right tabular">{fmtQty(r.required, r.unit)}</Td>
            <Td className="text-right tabular">{fmtQty(r.available, r.unit)}</Td>
            <Td className="text-right tabular">{r.shortage > 0 ? <Badge tone="red">{fmtQty(r.shortage, r.unit)}</Badge> : <Badge tone="green">OK</Badge>}</Td>
            <Td className="text-right tabular">{fmtMoney(r.required * r.unitCost)}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
