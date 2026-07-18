import type { PrimitiveKey } from "./primitive.js";

export type DraftSessionStatus =
  | "in_progress"
  | "testing"
  | "promoted"
  | "abandoned"
  | "expired";

export interface DraftSession {
  id: string;
  status: DraftSessionStatus;
  ownerContact?: string;
  tenantId?: string;
  createdAt: string;
  expiresAt?: string;
}

/** Field values namespaced per primitive: fieldValues["catalogue"]["items"] */
export type PrimitiveFieldValues = Record<string, unknown>;

export interface DraftConfig {
  draftSessionId: string;
  version: number;
  lobKey: string | null;
  selectedPrimitives: readonly PrimitiveKey[];
  fieldValues: Partial<Record<PrimitiveKey, PrimitiveFieldValues>>;
}
