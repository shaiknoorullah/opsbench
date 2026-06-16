// Pluggable MemoryBackend interface.
//
// CONTRACT: the backend NEVER receives a free-form namespace. Every namespace
// crossing this boundary has passed `assertCompiled`. The backend is also
// tenant-naive on purpose — the proxy prefixes tenant isolation into the
// namespace it hands down, so two tenants can never collide even if a backend
// implementation ignores tenant_id.

export interface StoredMemory {
  id: string;
  tenant_id: string;
  /** Compiled namespace (already validated by the proxy). */
  namespace: string;
  text: string;
  /** Higher = more relevant. In-memory backend uses a cosine-ish stub. */
  relevance?: number;
  created_at: number; // epoch ms — recency axis
  topics?: string[];
  entities?: string[];
  trust_label?: "verified_fact" | "runbook" | "feedback_memory";
  written_by?: string;
  source_event?: string;
}

export interface WriteInput {
  tenant_id: string;
  namespace: string;
  text: string;
  topics?: string[];
  entities?: string[];
  trust_label?: StoredMemory["trust_label"];
  written_by?: string;
  source_event?: string;
}

export interface SearchInput {
  tenant_id: string;
  /**
   * EXACT namespace to search. The proxy issues one SearchInput per permitted
   * tier (fan-out); the backend must match this namespace EXACTLY (eq), never
   * a prefix — prefix matching would leak descendants.
   */
  namespace: string;
  query: string;
  limit: number;
}

export interface MemoryBackend {
  readonly name: string;
  write(input: WriteInput): Promise<StoredMemory>;
  search(input: SearchInput): Promise<StoredMemory[]>;
  /** Total stored count (for benchmark/diagnostics). */
  count(): Promise<number>;
}
