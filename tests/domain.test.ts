import { describe, expect, it } from "vitest";
import { classifyAbc } from "@/domain/services/abc";
import { allocate } from "@/domain/services/allocation";
import { formatSerial, productionLotCode, splitIntoPacks, trackingUrl } from "@/domain/services/codes";
import { maxProducible, requirements } from "@/domain/services/requirements";
import { toBase } from "@/domain/services/units";
import { weightedAverage } from "@/domain/services/weightedAverageCost";

describe("costo promedio ponderado (README §9.1)", () => {
  it("2 kg a $57.000 + 3 kg a $62.000 = $60.000", () => {
    expect(weightedAverage(2, 57000, 3, 62000)).toBe(60000);
  });
  it("sin saldo previo toma el costo de la entrada", () => {
    expect(weightedAverage(0, 0, 5, 1200)).toBe(1200);
  });
});

describe("requerimientos de fórmula (RF-9.2/9.3)", () => {
  const lines = [
    { productId: "karite", quantity: 0.8 },
    { productId: "frasco", quantity: 100 },
  ];
  it("250 cremas con fórmula que rinde 100 → × 2,5", () => {
    expect(requirements(lines, 100, 250)).toEqual([
      { productId: "karite", required: 2 },
      { productId: "frasco", required: 250 },
    ]);
  });
  it("máximo producible lo limita el frasco", () => {
    const avail = new Map([["karite", 5], ["frasco", 140]]);
    expect(maxProducible(lines, 100, avail, true)).toBe(140);
  });
});

describe("FEFO por bultos (RN-5.1.4)", () => {
  const d = (s: string) => new Date(s);
  const containers = [
    { id: "nuevo", available: 25, expiryDate: d("2027-12-01"), createdAt: d("2026-10-01") },
    { id: "viejo-abierto", available: 3, expiryDate: d("2027-06-30"), createdAt: d("2026-01-01") },
    { id: "viejo-lleno", available: 25, expiryDate: d("2027-06-30"), createdAt: d("2026-01-01") },
  ];
  it("toma primero lo que vence antes y, a igual vencimiento, el bulto abierto", () => {
    const r = allocate(containers, 10);
    expect(r.picks.map((p) => [p.container.id, p.quantity])).toEqual([
      ["viejo-abierto", 3],
      ["viejo-lleno", 7],
    ]);
    expect(r.shortage).toBe(0);
  });
  it("informa el faltante", () => {
    expect(allocate(containers, 60).shortage).toBe(7);
  });
});

describe("códigos y empaque", () => {
  it("serial de bulto", () => expect(formatSerial("MP-001", 123)).toBe("MP-001-000123"));
  it("lote de producto terminado en fecha de Colombia", () =>
    expect(productionLotCode("PT-001", new Date("2026-11-15T03:00:00Z"), 1)).toBe("PT001-261114-01"));
  it("100 cremas en cajas de 24", () => expect(splitIntoPacks(100, 24)).toEqual([24, 24, 24, 24, 4]));
  it("sin tamaño de empaque es un solo bulto", () => expect(splitIntoPacks(3.5, null)).toEqual([3.5]));
  it("URL de rastreo con la guía", () =>
    expect(trackingUrl("https://x.co/rastreo?guia={guia}", "123 45")).toBe("https://x.co/rastreo?guia=123%2045"));
});

describe("unidades y ABC", () => {
  it("400 g → 0,4 kg", () => expect(toBase(400, "g", "kg")).toBeCloseTo(0.4));
  it("no convierte g a L", () => expect(() => toBase(1, "g", "L")).toThrow());
  it("clasifica ABC por valor", () => {
    const r = classifyAbc([
      { id: "a", value: 800 },
      { id: "b", value: 150 },
      { id: "c", value: 50 },
    ]);
    expect([r.get("a"), r.get("b"), r.get("c")]).toEqual(["A", "B", "C"]);
  });
});

import { splitIntoCount } from "@/domain/services/codes";
describe("bultos por recepción", () => {
  it("75 kg en 3 sacos", () => expect(splitIntoCount(75, 3)).toEqual([25, 25, 25]));
  it("10 en 3 bultos suma exacto", () => expect(splitIntoCount(10, 3).reduce((a, b) => a + b, 0)).toBeCloseTo(10, 6));
});

import { countAccuracyByValue, productionVariance } from "@/domain/services/kpis";
describe("indicadores del tablero", () => {
  it("exactitud por valor: faltan 2 etiquetas de $120 sobre 200", () => {
    const a = countAccuracyByValue([
      { systemQty: 100, countedQty: 98, unitCost: 120 },
      { systemQty: 100, countedQty: 100, unitCost: 120 },
    ]);
    expect(a).toBeCloseTo(99, 6);
  });
  it("sin conteos no hay exactitud", () => expect(countAccuracyByValue([])).toBeNull());
  it("variación: 39 jabones de 40 planeados con el mismo costo total", () => {
    const v = productionVariance([{ plannedQty: 40, producedQty: 39, theoreticalCost: 4000, actualCost: 4000 }]);
    expect(v.variance).toBeCloseTo(100);
  });
});
