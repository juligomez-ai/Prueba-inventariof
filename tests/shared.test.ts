import { afterEach, describe, expect, it, vi } from "vitest";
import { DomainError, errorMessage } from "@/shared/errors";
import { fmtDate, parseLocalDate, startOfToday } from "@/shared/numbers";

describe("mensajes de error para el usuario", () => {
  afterEach(() => vi.restoreAllMocks());

  it("las reglas de negocio se muestran tal cual", () => {
    expect(errorMessage(new DomainError("Primero cierra el conteo."))).toBe("Primero cierra el conteo.");
  });
  it("los errores internos no exponen detalles", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(errorMessage(new Error("connect ECONNREFUSED 10.0.0.1:5432"))).not.toContain("ECONNREFUSED");
  });
  it("un valor repetido en un campo único se explica", () => {
    expect(errorMessage({ code: "P2002", meta: { target: ["barcode"] } })).toBe("Ya existe un registro con ese valor (barcode).");
  });
});

describe("fechas en la zona del negocio (Colombia)", () => {
  afterEach(() => vi.useRealTimers());

  it("una fecha de formulario no cambia de día al mostrarse", () => {
    expect(fmtDate(parseLocalDate("2026-11-15"))).toBe(fmtDate(new Date("2026-11-15T17:00:00Z")));
  });
  it("hoy empieza a medianoche de Colombia, aunque el servidor esté en UTC", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-16T03:00:00Z")); // 15 nov, 10 p. m. en Colombia
    expect(startOfToday().toISOString()).toBe("2026-11-15T05:00:00.000Z");
  });
});
