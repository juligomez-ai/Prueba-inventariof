/** Error de regla de negocio: su mensaje se muestra tal cual al usuario. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

/** Mensaje para el usuario: las reglas de negocio se muestran; los errores internos se registran y se ocultan. */
export function errorMessage(e: unknown) {
  if (e instanceof DomainError) return e.message;
  // Prisma: violación de un campo único (código de barras, nombre de transportadora…)
  if (typeof e === "object" && e !== null && "code" in e && e.code === "P2002") {
    const target = (e as { meta?: { target?: string[] | string } }).meta?.target;
    return `Ya existe un registro con ese valor${target ? ` (${[target].flat().join(", ")})` : ""}.`;
  }
  console.error(e);
  return "Ocurrió un error inesperado. Intenta de nuevo.";
}
