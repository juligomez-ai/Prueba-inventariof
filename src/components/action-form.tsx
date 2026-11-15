"use client";

import { useRouter } from "next/navigation";
import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/app/actions";
import { Button, Notice, cn } from "./ui";

const PendingContext = createContext(false);

/**
 * Formulario que invoca un Server Action y muestra el error o el éxito.
 * Se envía con onSubmit (no con la prop `action`) para que React no limpie los campos
 * cuando el servidor responde con un error de validación: el usuario corrige y reenvía.
 * Tras un éxito sí se limpia (salvo resetOnSuccess={false}).
 */
export function ActionForm({
  action,
  children,
  className,
  redirectTo,
  resetOnSuccess,
}: {
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  children: ReactNode;
  className?: string;
  redirectTo?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state?.ok) return;
    if (redirectTo || state.redirect) router.push(state.redirect ?? redirectTo!);
    // Tras un éxito se limpia el formulario para que tome los valores actualizados del servidor
    // (ej. lo pendiente de una OC después de una recepción parcial). Tras un error NO se limpia.
    else if (resetOnSuccess !== false) ref.current?.reset();
  }, [state, redirectTo, resetOnSuccess, router]);

  return (
    <PendingContext.Provider value={pending}>
      <form
        ref={ref}
        className={cn("space-y-3", className)}
        onSubmit={(e) => {
          e.preventDefault();
          if (pending) return;
          // El botón presionado (name/value) viaja en el FormData, p. ej. op=start
          const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
          const fd = new FormData(e.currentTarget, submitter);
          startTransition(() => formAction(fd));
        }}
      >
        {children}
        {state?.error && <Notice tone="red">{state.error}</Notice>}
        {state?.ok && state.message && <Notice tone="green">{state.message}</Notice>}
      </form>
    </PendingContext.Provider>
  );
}

export function SubmitButton({
  children,
  variant,
  className,
  name,
  value,
}: {
  children: ReactNode;
  variant?: "primary" | "outline" | "ghost" | "danger";
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending: formPending } = useFormStatus();
  const pending = useContext(PendingContext) || formPending;
  return (
    <Button type="submit" variant={variant} disabled={pending} className={className} name={name} value={value}>
      {pending ? "Procesando…" : children}
    </Button>
  );
}
