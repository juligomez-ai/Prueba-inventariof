import { ApiError, type Content } from "@google/genai";
import { z } from "zod";
import { copilotConfigured, runCopilot } from "@/infrastructure/ai/copilot";

export const maxDuration = 120;

const Body = z.object({
  text: z.string().trim().min(1).max(4000),
  history: z.array(z.object({ role: z.enum(["user", "model"]), parts: z.array(z.unknown()) })).max(80),
});

export async function POST(request: Request) {
  if (!copilotConfigured())
    return Response.json(
      { error: "El Copiloto no está configurado: falta la variable de entorno GEMINI_API_KEY." },
      { status: 503 },
    );

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Solicitud inválida." }, { status: 400 });

  try {
    const result = await runCopilot(parsed.data.history as Content[], parsed.data.text);
    return Response.json(result);
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 429)
        return Response.json({ error: "Se alcanzó el límite de uso de Gemini; intenta en un momento." }, { status: 429 });
      if (e.status === 402)
        return Response.json(
          { error: "La cuenta de Gemini no tiene saldo (créditos prepagados agotados). Recárgala en Google AI Studio." },
          { status: 502 },
        );
      if (e.status === 401 || e.status === 403)
        return Response.json({ error: "La clave de la API de Gemini no es válida o no tiene permisos." }, { status: 502 });
      if (e.status === 400)
        return Response.json({ error: "La conversación no es válida; reiníciala e intenta de nuevo." }, { status: 400 });
      return Response.json({ error: `Error del servicio de IA (${e.status}).` }, { status: 502 });
    }
    console.error(e);
    return Response.json({ error: "Error inesperado del Copiloto." }, { status: 500 });
  }
}
