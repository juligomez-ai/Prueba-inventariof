import { round4 } from "@/shared/numbers";

export interface AllocatableContainer {
  id: string;
  available: number;
  expiryDate: Date | null;
  createdAt: Date;
}

/**
 * FEFO por bultos (RF-5.3, RN-5.1.4): primero lo que vence antes;
 * a igual vencimiento, el bulto con menor cantidad (para vaciar primero los abiertos);
 * luego el más antiguo. Los que no vencen van al final.
 */
export function fefoSort<T extends AllocatableContainer>(containers: T[]): T[] {
  return [...containers].sort((a, b) => {
    const ea = a.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const eb = b.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (ea !== eb) return ea - eb;
    if (a.available !== b.available) return a.available - b.available;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

export function allocate<T extends AllocatableContainer>(containers: T[], quantity: number) {
  const picks: { container: T; quantity: number }[] = [];
  let pending = round4(quantity);
  for (const c of fefoSort(containers)) {
    if (pending <= 0) break;
    if (c.available <= 0) continue;
    const take = round4(Math.min(c.available, pending));
    picks.push({ container: c, quantity: take });
    pending = round4(pending - take);
  }
  return { picks, shortage: Math.max(0, pending) };
}
