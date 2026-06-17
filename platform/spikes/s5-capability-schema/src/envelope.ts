// Consumes the REAL CapabilityEnvelope from packages/schemas (spec 01 §8).
// Per S5 brief: import via tsx relative path from the schemas package.
// We re-export the type and add a combined validator that checks BOTH the
// envelope shape AND the observability/1 verb-param shape (the latter lives in
// this spike pending promotion).

import { type CapabilityEnvelope, validator } from "../../../packages/schemas/src/index.ts";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import observabilityV1 from "./observability-v1.schema.json" with { type: "json" };
import { verbOf, type ObservabilityVerb } from "./verbs.ts";

export type { CapabilityEnvelope };

const envelopeValidator = validator("capabilityEnvelope");

// Standalone AJV for the verb-param sub-schemas.
const verbAjv = new Ajv2020({ allErrors: true, strict: false });
addFormats(verbAjv);
verbAjv.addSchema(observabilityV1, observabilityV1.$id);

const VERB_DEFS: Record<ObservabilityVerb, string> = {
  query_metrics: "query_metrics",
  search_logs: "search_logs",
  get_trace: "get_trace",
  list_monitors: "list_monitors",
  write_annotation: "write_annotation",
};

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/** Validate the full envelope (real schema) AND its params (observability/1). */
export function validateEnvelope(env: CapabilityEnvelope): ValidationResult {
  const errors: string[] = [];

  if (!envelopeValidator(env)) {
    for (const e of envelopeValidator.errors ?? []) {
      errors.push(`envelope${e.instancePath} ${e.message}`);
    }
  }

  let verb: ObservabilityVerb;
  try {
    verb = verbOf(env.capability);
  } catch (err) {
    return { ok: false, errors: [...errors, (err as Error).message] };
  }

  const def = VERB_DEFS[verb];
  const validate = verbAjv.getSchema(`${observabilityV1.$id}#/$defs/${def}`);
  if (!validate) {
    errors.push(`no verb-param schema for ${verb}`);
  } else if (!validate(env.params)) {
    for (const e of validate.errors ?? []) {
      errors.push(`params${e.instancePath} ${e.message}`);
    }
  }

  return { ok: errors.length === 0, errors };
}
