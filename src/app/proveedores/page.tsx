import { saveCarrierAction, saveSupplierAction } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, CardBody, CardHeader, Field, Input, Notice, PageHeader, Table, Td, Th } from "@/components/ui";
import { prisma } from "@/infrastructure/database/prisma";

export default async function Suppliers() {
  const [suppliers, carriers] = await Promise.all([
    prisma.supplier.findMany({ include: { _count: { select: { purchaseOrders: true, products: true } } }, orderBy: { name: "asc" } }),
    prisma.carrier.findMany({ orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Proveedores y transportadoras" description="Datos de contacto, plazos de pago y tiempos de entrega (RF-6.1); plantillas de rastreo (RF-7.3b)." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Proveedores" />
          <Table>
            <thead><tr><Th>Proveedor</Th><Th>NIT</Th><Th>Contacto</Th><Th>Ciudad</Th><Th className="text-right">Pago</Th><Th className="text-right">Entrega</Th><Th className="text-right">OCs</Th></tr></thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <Td className="font-medium">{s.name}</Td><Td className="text-xs">{s.taxId}</Td>
                  <Td className="text-xs">{s.contactName}<div className="text-muted">{s.phone} · {s.email}</div></Td>
                  <Td>{s.city}</Td><Td className="text-right">{s.paymentTermDays} d</Td><Td className="text-right">{s.leadTimeDays} d</Td><Td className="text-right">{s._count.purchaseOrders}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Nuevo proveedor" />
          <CardBody>
            <ActionForm action={saveSupplierAction} resetOnSuccess>
              <Field label="Razón social"><Input name="name" required /></Field>
              <Field label="NIT"><Input name="taxId" required /></Field>
              <Field label="Contacto"><Input name="contactName" /></Field>
              <div className="grid grid-cols-2 gap-2"><Field label="Teléfono"><Input name="phone" /></Field><Field label="Ciudad"><Input name="city" /></Field></div>
              <Field label="Correo"><Input name="email" type="email" /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Plazo de pago (días)"><Input name="paymentTermDays" type="number" defaultValue={30} /></Field>
                <Field label="Tiempo de entrega (días)"><Input name="leadTimeDays" type="number" defaultValue={7} /></Field>
              </div>
              <SubmitButton>Guardar proveedor</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Transportadoras" description="Si la plantilla incluye {guia}, el enlace abre el rastreo con la guía cargada; si no, abre la página y copia la guía." />
          <div className="p-5 pb-0"><Notice>Verifica la dirección de rastreo de cada transportadora antes de usarla: las páginas cambian con el tiempo.</Notice></div>
          <Table>
            <thead><tr><Th>Transportadora</Th><Th>Página de rastreo</Th><Th>Guía en el enlace</Th><Th>Editar</Th></tr></thead>
            <tbody>
              {carriers.map((c) => (
                <tr key={c.id}>
                  <Td className="font-medium">{c.name}</Td>
                  <Td className="max-w-xs break-all text-xs">{c.trackingUrlTemplate ?? "—"}</Td>
                  <Td>{c.acceptsParam ? <Badge tone="green">Sí</Badge> : <Badge>No: se copia</Badge>}</Td>
                  <Td>
                    <ActionForm action={saveCarrierAction} className="flex gap-2">
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="name" value={c.name} />
                      <Input name="trackingUrlTemplate" defaultValue={c.trackingUrlTemplate ?? ""} className="min-w-56 text-xs" />
                      <SubmitButton variant="outline" className="text-xs">Guardar</SubmitButton>
                    </ActionForm>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Nueva transportadora" />
          <CardBody>
            <ActionForm action={saveCarrierAction} resetOnSuccess>
              <Field label="Nombre"><Input name="name" required /></Field>
              <Field label="URL de rastreo" hint="(usa {guia})"><Input name="trackingUrlTemplate" placeholder="https://…/rastreo?guia={guia}" /></Field>
              <SubmitButton>Guardar</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
