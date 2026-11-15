/** Error de regla de negocio: su mensaje se muestra tal cual al usuario. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

export const errorMessage = (e: unknown) =>
  e instanceof DomainError ? e.message : e instanceof Error ? e.message : "Error inesperado";
