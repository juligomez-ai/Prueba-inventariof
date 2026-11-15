import { createOrderAction } from "@/app/actions";
import { checkFeasibility } from "@/application/use-cases/production";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FeasibilityTable } from "@/components/feasibility-table";
import { ButtonLink, Card, CardBody, CardHeader, Field, Input, Notice, PageHeader, Select, Textarea } from "@/components/ui";
import { prisma } from "@/infrastructure/database/prisma";
import { errorMessage } from "@/shared/errors";
import { fmtMoney, fmtQty } from "@/shared/numbers";

export default async function NewOrder(props: PageProps<"/produccion/nueva">) {
  const sp = await props.searchParams;
  const products = await prisma.product.findMany({ where: { type: "PRODUCTO_TERMINADO", archived: false, recipe: { isNot: null } }, orderBy: { sku: "asc" } });
  const productId = typeof sp.producto === "string" ? sp.producto : products[0]?.id;
  const qty = Number(typeof sp.cantidad === "string" ? sp.cantidad : 100);
  let feas: Awaited<ReturnType<typeof checkFeasibility>> | null = null;
  let error: string | null = null;
  if (productId && qty > 0) {
    try { feas = await checkFeasibility(productId, qty); } catch (e) { error = errorMessage(e); }
  }
  return (
    <div className="max-w-5xl">
      <PageHeader title="Nueva orden de producción" description="Primero valida si te alcanza el inventario; luego crea la orden en borrador." />
      <Card>
        <CardHeader title="1. ¿Qué y cuánto quieres producir?" />
        <CardBody>
          <form className="flex flex-wrap items-end gap-3">
            <Field label="Producto" className="min-w-64 flex-1">
              <Select name="producto" defaultValue={productId}>
                {products.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}
              </Select>
            </Field>
            <Field label="Cantidad (und.)"><Input name="cantidad" type="number" min={1} step={1} defaultValue={qty} /></Field>
            <button className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent">Validar disponibilidad</button>
          </form>
        </CardBody>
      </Card>
      {error && <div className="mt-4"><Notice tone="red">{error}</Notice></div>}
      {feas && (
        <Card className="mt-4">
          <CardHeader
            title="2. Disponibilidad de insumos"
            description={
              feas.feasible
                ? `Te alcanza. Costo estimado ${fmtMoney(feas.estimatedCost)} (${fmtMoney(feas.estimatedUnitCost)} por unidad).`
                : `No alcanza: puedes producir máximo ${fmtQty(feas.maxProducible, "und")} · costo estimado ${fmtMoney(feas.estimatedCost)}.`
            }
            actions={!feas.feasible ? <ButtonLink variant="outline" href={`/compras/nueva?producto=${productId}&cantidad=${qty}`}>Crear OC con faltantes</ButtonLink> : undefined}
          />
          <FeasibilityTable f={feas} />
        </Card>
      )}
      {feas && (
        <Card className="mt-4">
          <CardHeader title="3. Crear la orden" description={feas.feasible ? "Quedará en borrador; al iniciarla se reservan los lotes." : "Puedes crearla en borrador, pero no podrá iniciarse hasta cubrir los faltantes."} />
          <CardBody>
            <ActionForm action={createOrderAction} className="grid gap-3 sm:grid-cols-3">
              <input type="hidden" name="productId" value={productId} />
              <Field label="Cantidad"><Input name="quantity" type="number" min={1} step={1} defaultValue={qty} /></Field>
              <Field label="Fecha planeada"><Input name="plannedDate" type="date" /></Field>
              <Field label="Notas" className="sm:col-span-3"><Textarea name="notes" rows={2} /></Field>
              <div className="sm:col-span-3"><SubmitButton>Crear orden en borrador</SubmitButton></div>
            </ActionForm>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
