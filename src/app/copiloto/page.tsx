import { PageHeader } from "@/components/ui";
import { COPILOT_MODEL, copilotConfigured } from "@/infrastructure/ai/copilot";
import { CopilotChat } from "./chat";

export default async function CopilotPage(props: PageProps<"/copiloto">) {
  const sp = await props.searchParams;
  return (
    <>
      <PageHeader
        title="Copiloto de Producción"
        description="Pregunta en lenguaje natural o pega una fórmula. La IA consulta el inventario real con herramientas y solo propone: tú confirmas."
      />
      <CopilotChat configured={copilotConfigured()} model={COPILOT_MODEL} initial={typeof sp.q === "string" ? sp.q : ""} />
    </>
  );
}
