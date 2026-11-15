import { ProductForm } from "@/components/product-form";
import { PageHeader } from "@/components/ui";
import { prisma } from "@/infrastructure/database/prisma";

export default async function NewProduct() {
  const suppliers = await prisma.supplier.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  return (
    <div className="max-w-5xl">
      <PageHeader title="Nuevo producto" description="Después de crearlo, carga su inventario inicial desde Ajustes." />
      <ProductForm suppliers={suppliers} />
    </div>
  );
}
