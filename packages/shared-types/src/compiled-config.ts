import type { PrimitiveKey } from "./primitive.js";

export interface MenuEntry {
  id: string;
  label: string;
  description?: string;
  targetState: string;
}

export interface RootMenu {
  headerText: string;
  bodyText: string;
  entries: readonly MenuEntry[];
}

export interface StateTableEntry {
  primitiveKey: PrimitiveKey;
  /** parameters passed to that primitive's generic handler, drawn entirely from compiled field values */
  handlerArgs: Record<string, unknown>;
}

export interface CompiledConfig {
  /** draftSessionId while testing in sandbox, tenantId once published */
  sourceId: string;
  version: number;
  compiledAt: string;
  rootMenu: RootMenu;
  stateTable: Record<string, StateTableEntry>;
}
