import { notFound } from "next/navigation";
import { ProductForm } from "@/components/product-form";
import { PageHeader } from "@/components/ui";
import { prisma } from "@/infrastructure/database/prisma";
import { plain } from "@/shared/plain";

export default async function EditProduct(props: PageProps<"/productos/[id]/editar">) {
  const { id } = await props.params;
  const [product, suppliers] = await Promise.all([
    prisma.product.findUnique({ where: { id }, include: { conversions: true } }),
    prisma.supplier.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  if (!product) notFound();
  const { avgCost: _avg, ...rest } = plain(product);
  void _avg;
  return (
    <div className="max-w-5xl">
      <PageHeader title={`Editar ${product.name}`} />
      <ProductForm product={rest} suppliers={suppliers} />
    </div>
  );
}
