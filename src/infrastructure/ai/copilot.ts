import { ApiError, FinishReason, FunctionCallingConfigMode, GoogleGenAI, type Content, type GenerateContentParameters, type Part } from "@google/genai";
import { executeTool, tools, type Proposal } from "./tools";

/**
 * Cadena de modelos: si uno está saturado (503), con límite (429) o ya no existe (404),
 * se usa el siguiente. GEMINI_MODEL, si se define, va primero.
 */
const MODEL_CHAIN = [
  ...new Set([process.env.GEMINI_MODEL, "gemini-3.5-flash", "gemini-flash-latest", "gemini-3.5-flash-lite"].filter(Boolean) as string[]),
];
export const COPILOT_MODEL = MODEL_CHAIN[0];
const RETRYABLE = new Set([404, 429, 500, 503]);
const MAX_TOOL_ROUNDS = 10;

const SYSTEM_PROMPT = `Eres el Copiloto de Producción de SYNTHEX para Botánica Viva S.A.S., una PyME colombiana (Medellín) que fabrica cosmética natural: cremas, bálsamos labiales, jabones artesanales y serums.

Cómo opera el negocio:
- Materias primas (mantecas, aceites, activos, conservantes) en kg o L; empaques y productos terminados en unidades.
- Cada producto terminado tiene una fórmula que rinde un lote estándar (ej. 100 cremas).
- Solo cuenta como disponible lo que está en lotes liberados, no vencidos y no reservados por otras órdenes. Los lotes en cuarentena no se pueden usar.
- Todo producto terminado queda en cuarentena hasta que control de calidad lo libera.
- Moneda COP; el IVA de compras no entra al costo. Costeo: promedio ponderado.

Reglas:
1. Nunca inventes cantidades, SKU, costos ni stock: obtén todo con las herramientas. Primero usa buscar_producto para identificar el SKU exacto. Si hay varios candidatos parecidos, pregunta al usuario cuál.
2. Intención de producción ("quiero producir 30 cremas", "¿me alcanza?"): usa verificar_factibilidad y luego SIEMPRE proponer_orden_produccion (con fecha AAAA-MM-DD si la menciona). Si faltan insumos, di cuáles con cantidades exactas, el máximo producible y llama a proponer_orden_compra con los faltantes.
3. Fórmula desde texto libre: identifica cada insumo con buscar_producto, respeta las unidades del texto (g, ml, kg, L, und.) y llama a proponer_formula. Si un insumo no existe, no lo inventes: dile al usuario que lo cree en Productos.
4. Preguntas de uso del sistema ("¿cómo recibo una compra?"): usa ayuda_uso y responde con los pasos.
5. Las propuestas no se guardan solas: el usuario las confirma con un botón. Nunca digas que ya creaste algo. Tú nunca mueves inventario.
6. Responde en español, breve y concreto, con cifras en formato colombiano (1.250 und.; $2.920). Usa listas cortas con guiones y **negritas** solo para lo clave. No uses tablas ni encabezados Markdown.`;

export interface CopilotResult {
  messages: Content[];
  reply: string;
  proposals: Proposal[];
  toolCalls: { name: string; input: unknown }[];
  model: string;
}

export function copilotConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

const BLOCKED = new Set<string>([
  FinishReason.SAFETY,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.BLOCKLIST,
  FinishReason.SPII,
]);

/**
 * Bucle de function calling: el historial completo (incluidas las firmas de
 * pensamiento de las llamadas a funciones) se devuelve al cliente y se reenvía sin modificar.
 */
export async function runCopilot(history: Content[], userText: string): Promise<CopilotResult> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const today = new Intl.DateTimeFormat("es-CO", { dateStyle: "full", timeZone: "America/Bogota" }).format(new Date());
  const messages: Content[] = [...history, { role: "user", parts: [{ text: userText }] }];
  const proposals: Proposal[] = [];
  const toolCalls: { name: string; input: unknown }[] = [];
  let reply = "";
  let modelIndex = 0;

  // Llama al modelo vigente y, si no responde, pasa al siguiente de la cadena.
  const generate = async (params: Omit<GenerateContentParameters, "model">) => {
    for (;;) {
      try {
        return await ai.models.generateContent({ ...params, model: MODEL_CHAIN[modelIndex] });
      } catch (e) {
        if (e instanceof ApiError && RETRYABLE.has(e.status) && modelIndex < MODEL_CHAIN.length - 1) {
          modelIndex++;
          continue;
        }
        throw e;
      }
    }
  };

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await generate({
      contents: messages,
      config: {
        systemInstruction: `${SYSTEM_PROMPT}\n\nFecha de hoy: ${today}.`,
        tools: [{ functionDeclarations: tools }],
        toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
      },
    });

    const candidate = response.candidates?.[0];
    if (response.promptFeedback?.blockReason || (candidate?.finishReason && BLOCKED.has(candidate.finishReason))) {
      reply = "No puedo ayudar con esa solicitud. Intenta reformularla en términos de producción o inventario.";
      break;
    }
    const content: Content = candidate?.content ?? { role: "model", parts: [] };
    messages.push({ role: "model", parts: content.parts ?? [] });

    const text = (content.parts ?? [])
      .filter((p) => p.text && !p.thought)
      .map((p) => p.text)
      .join("")
      .trim();
    if (text) reply = text;

    const calls = (content.parts ?? []).filter((p) => p.functionCall).map((p) => p.functionCall!);
    if (calls.length === 0) {
      if (!reply && candidate?.finishReason === FinishReason.MAX_TOKENS)
        reply = "La respuesta fue demasiado larga; intenta una pregunta más específica.";
      break;
    }

    // Todas las respuestas de funciones van juntas en un solo turno.
    const results: Part[] = [];
    for (const call of calls) {
      const name = call.name ?? "";
      toolCalls.push({ name, input: call.args });
      const r = await executeTool(name, (call.args ?? {}) as Record<string, unknown>, proposals);
      results.push({
        functionResponse: {
          id: call.id,
          name,
          response: r.isError ? { error: r.content } : { output: JSON.parse(r.content) },
        },
      });
    }
    messages.push({ role: "user", parts: results });
  }

  return { messages, reply, proposals, toolCalls, model: MODEL_CHAIN[modelIndex] };
}
