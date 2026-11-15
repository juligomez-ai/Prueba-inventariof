"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/app/actions";
import { Button, Notice, cn } from "./ui";

/** Formulario que invoca un Server Action y muestra el error o el éxito. */
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
  const [state, formAction] = useActionState(action, null);
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state?.ok) return;
    if (redirectTo || state.redirect) router.push(state.redirect ?? redirectTo!);
    else if (resetOnSuccess) ref.current?.reset();
  }, [state, redirectTo, resetOnSuccess, router]);

  return (
    <form ref={ref} action={formAction} className={cn("space-y-3", className)}>
      {children}
      {state?.error && <Notice tone="red">{state.error}</Notice>}
      {state?.ok && state.message && <Notice tone="green">{state.message}</Notice>}
    </form>
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
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} className={className} name={name} value={value}>
      {pending ? "Procesando…" : children}
    </Button>
  );
}
