"use client";

import { Bot, Factory, FlaskConical, RotateCcw, Send, ShoppingCart, User, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { confirmOrderProposalAction, confirmPurchaseProposalAction, confirmRecipeProposalAction } from "@/app/actions";
import { Badge, Button, Card, Notice, Textarea } from "@/components/ui";
import type { Proposal } from "@/infrastructure/ai/tools";
import { fmtMoney, fmtQty } from "@/shared/numbers";

interface Turn {
  role: "user" | "assistant";
  text: string;
  proposals?: Proposal[];
  toolCalls?: { name: string; input: unknown }[];
  error?: boolean;
}

const EXAMPLES = [
  "Quiero producir 250 cremas de karité, ¿me alcanza el inventario?",
  "¿Qué lotes vencen en los próximos 60 días?",
  "¿Cuánto vale mi inventario de empaques?",
  "¿Cómo registro la llegada de una compra?",
];
const RECIPE_EXAMPLE =
  "Para 100 bálsamos labiales uso 400 g de cera de abejas, 300 g de manteca de cacao, 280 ml de aceite de coco, 20 ml de vitamina E, 100 tubos y 100 etiquetas.";

const toolLabel: Record<string, string> = {
  buscar_producto: "Buscó en el catálogo",
  consultar_existencias: "Consultó existencias",
  consultar_formula: "Consultó la fórmula",
  verificar_factibilidad: "Verificó disponibilidad",
  valor_inventario: "Calculó el valor del inventario",
  lotes_por_vencer: "Revisó vencimientos",
  consultar_alertas: "Revisó alertas",
  proponer_orden_produccion: "Preparó una orden de producción",
  proponer_orden_compra: "Preparó una orden de compra",
  proponer_formula: "Preparó una fórmula",
  ayuda_uso: "Consultó el centro de ayuda",
};

export function CopilotChat({ configured, model, initial }: { configured: boolean; model: string; initial: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [history, setHistory] = useState<unknown[]>([]);
  const [text, setText] = useState(initial);
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, loading]);

  const send = async (msg: string) => {
    const value = msg.trim();
    if (!value || loading) return;
    setTurns((t) => [...t, { role: "user", text: value }]);
    setText("");
    setLoading(true);
    try {
      const res = await fetch("/api/copilot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: value, history }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error del Copiloto");
      setHistory(data.messages);
      setTurns((t) => [...t, { role: "assistant", text: data.reply, proposals: data.proposals, toolCalls: data.toolCalls }]);
    } catch (e) {
      setTurns((t) => [...t, { role: "assistant", text: e instanceof Error ? e.message : "Error", error: true }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <Card className="flex min-h-[60vh] flex-col xl:col-span-2">
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {!configured && <Notice tone="red">Falta configurar <code>GEMINI_API_KEY</code> en el servidor; el Copiloto no puede responder.</Notice>}
          {turns.length === 0 && (
            <div className="space-y-3 py-6 text-center">
              <Bot className="mx-auto h-10 w-10 text-primary" />
              <p className="text-sm text-muted">Pregunta por una producción, por tu inventario o pega una fórmula.</p>
              <div className="flex flex-col items-center gap-2">
                {[...EXAMPLES, RECIPE_EXAMPLE].map((e) => (
                  <button key={e} onClick={() => send(e)} disabled={!configured} className="max-w-xl rounded-lg border border-border bg-accent/40 px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50">{e}</button>
                ))}
              </div>
            </div>
          )}
          {turns.map((t, i) => <TurnView key={i} turn={t} />)}
          {loading && <div className="flex items-center gap-2 text-sm text-muted"><Bot className="h-4 w-4 animate-pulse" /> Consultando el inventario…</div>}
          <div ref={endRef} />
        </div>
        <div className="border-t border-border p-3">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(text); }}>
            <Textarea
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }}
              placeholder="Ej.: necesito 60 serums para el viernes, ¿me alcanza?"
              disabled={!configured}
            />
            <div className="flex flex-col gap-2">
              <Button type="submit" disabled={loading || !configured || !text.trim()} aria-label="Enviar"><Send className="h-4 w-4" /></Button>
              <Button type="button" variant="ghost" onClick={() => { setTurns([]); setHistory([]); }} aria-label="Reiniciar conversación"><RotateCcw className="h-4 w-4" /></Button>
            </div>
          </form>
        </div>
      </Card>
      <Card className="h-fit p-5 text-sm">
        <h2 className="mb-2 font-semibold">Cómo funciona</h2>
        <ul className="list-disc space-y-1.5 pl-4 text-muted">
          <li>Modelo: <code>{model}</code> (Google Gemini) con llamadas a herramientas; si está saturado, usa un modelo de respaldo.</li>
          <li>La IA no calcula stock ni costos: llama a los mismos casos de uso que usa la aplicación.</li>
          <li>Solo cuenta stock liberado, no vencido y no reservado.</li>
          <li>Las órdenes, compras y fórmulas que propone se guardan solo si las confirmas. Nunca mueve inventario.</li>
        </ul>
      </Card>
    </div>
  );
}

/** Markdown mínimo y seguro (sin HTML): **negritas** y viñetas con guion. */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => {
        const bullet = /^\s*[-*•]\s+/.test(line);
        const indent = /^\s{2,}/.test(line);
        const content = line.replace(/^\s*[-*•]\s+/, "").split(/(\*\*[^*]+\*\*)/g).map((part, j) => (part.startsWith("**") && part.endsWith("**") ? <strong key={j}>{part.slice(2, -2)}</strong> : part));
        return (
          <div key={i} className={bullet ? `flex gap-1.5 ${indent ? "pl-5" : "pl-1"}` : line.trim() ? "" : "h-2"}>
            {bullet && <span>•</span>}
            <span>{content}</span>
          </div>
        );
      })}
    </>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  const isUser = turn.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${isUser ? "bg-gray-200" : "bg-accent text-primary"}`}>{isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}</div>
      <div className={`max-w-[85%] space-y-2 ${isUser ? "text-right" : ""}`}>
        {turn.toolCalls && turn.toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {turn.toolCalls.map((c, i) => (
              <span key={i} title={JSON.stringify(c.input)} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600"><Wrench className="h-3 w-3" /> {toolLabel[c.name] ?? c.name}</span>
            ))}
          </div>
        )}
        <div className={`inline-block rounded-lg px-3 py-2 text-left text-sm ${isUser ? "bg-primary text-primary-foreground" : turn.error ? "bg-red-50 text-red-900" : "bg-accent/60"}`}>
          {isUser ? turn.text : <RichText text={turn.text} />}
        </div>
        {turn.proposals?.map((p) => <ProposalCard key={p.id} p={p} />)}
      </div>
    </div>
  );
}

function ProposalCard({ p }: { p: Proposal }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string; href?: string } | null>(null);

  const confirm = () =>
    start(async () => {
      const r =
        p.kind === "order"
          ? await confirmOrderProposalAction({ productId: p.productId, quantity: p.quantity, plannedDate: p.plannedDate, notes: p.notes })
          : p.kind === "purchase"
            ? await confirmPurchaseProposalAction({ supplierId: p.supplierId, notes: p.notes, lines: p.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice })) })
            : await confirmRecipeProposalAction({ productId: p.productId, name: p.name, yieldQuantity: p.yieldQuantity, items: p.items.map((i) => ({ ingredientId: i.ingredientId, quantity: i.quantity, unit: i.unit })) });
      setResult({ ok: r.ok, text: r.ok ? (r.message ?? "Listo") : (r.error ?? "Error"), href: r.redirect });
      router.refresh();
    });

  return (
    <Card className="p-4 text-left">
      {p.kind === "order" && (
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2 font-semibold"><Factory className="h-4 w-4 text-primary" /> Orden de producción propuesta</div>
          <div>{p.productName} · <b>{fmtQty(p.quantity, "und")}</b>{p.plannedDate && ` · para ${p.plannedDate}`}</div>
          <div className="text-muted">Costo estimado {fmtMoney(p.estimatedCost)} · {p.feasible ? <Badge tone="green">Stock disponible</Badge> : <Badge tone="yellow">Con faltantes: máximo {fmtQty(p.maxProducible, "und")}</Badge>}</div>
          {p.notes && <div className="text-muted">{p.notes}</div>}
        </div>
      )}
      {p.kind === "purchase" && (
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2 font-semibold"><ShoppingCart className="h-4 w-4 text-primary" /> Orden de compra propuesta · {p.supplierName}</div>
          <ul>{p.lines.map((l) => <li key={l.productId} className="flex justify-between gap-4"><span>{l.name}</span><span className="tabular text-muted">{fmtQty(l.quantity, l.unit)} × {fmtMoney(l.unitPrice)}</span></li>)}</ul>
          <div className="text-muted">Total sin IVA {fmtMoney(p.total)}</div>
        </div>
      )}
      {p.kind === "recipe" && (
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2 font-semibold"><FlaskConical className="h-4 w-4 text-primary" /> Fórmula propuesta: {p.name}</div>
          <div className="text-muted">{p.productName} · rinde {fmtQty(p.yieldQuantity, "und")} · {fmtMoney(p.batchCost)} por lote · {fmtMoney(p.unitCost)} por unidad</div>
          <ul className="mt-1 grid grid-cols-1 gap-x-4 sm:grid-cols-2">{p.items.map((i) => <li key={i.ingredientId} className="flex justify-between gap-2"><span>{i.name}</span><span className="tabular text-muted">{fmtQty(i.quantity, i.unit)}</span></li>)}</ul>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!result?.ok && <Button onClick={confirm} disabled={pending}>{pending ? "Guardando…" : p.kind === "order" ? "Crear orden en borrador" : p.kind === "purchase" ? "Crear orden de compra" : "Guardar fórmula"}</Button>}
        {result && (result.ok && result.href ? <Button variant="outline" onClick={() => router.push(result.href!)}>{result.text} Ver →</Button> : <Notice tone={result.ok ? "green" : "red"}>{result.text}</Notice>)}
      </div>
    </Card>
  );
}
