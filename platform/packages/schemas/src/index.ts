// Entry point for @opsbench/schemas.
// Re-exports the TypeScript types and the JSON Schemas, and provides a validator
// factory so services and spikes share one source of truth (spec Part 1).
//
// JSON imports use import attributes (Node >= 20.10 / tsx). Consumers run under tsx
// or a bundler with JSON module support.
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import common from "../json/common.json" with { type: "json" };
import approvalObject from "../json/approval-object.json" with { type: "json" };
import auditRecord from "../json/audit-record.json" with { type: "json" };
import policyDecisionRecord from "../json/policy-decision-record.json" with { type: "json" };
import autonomyCertificate from "../json/autonomy-certificate.json" with { type: "json" };
import memoryScope from "../json/memory-scope.json" with { type: "json" };
import canonicalEvent from "../json/canonical-event.json" with { type: "json" };
import escalationLadder from "../json/escalation-ladder.json" with { type: "json" };
import capabilityEnvelope from "../json/capability-envelope.json" with { type: "json" };

export * from "./types.js";

export const schemas = {
  common,
  approvalObject,
  auditRecord,
  policyDecisionRecord,
  autonomyCertificate,
  memoryScope,
  canonicalEvent,
  escalationLadder,
  capabilityEnvelope,
} as const;

export type SchemaName = Exclude<keyof typeof schemas, "common">;

/**
 * Build a single Ajv instance with all Opsbench schemas registered.
 * `common.json` is added first so sibling `$ref`s resolve.
 */
export function buildAjv(): Ajv2020 {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  ajv.addSchema(common as object, (common as { $id: string }).$id);
  for (const [name, schema] of Object.entries(schemas)) {
    if (name === "common") continue;
    ajv.addSchema(schema as object, (schema as { $id: string }).$id);
  }
  return ajv;
}

/** Compiled validator for one schema by its camelCase name. */
export function validator(name: SchemaName): ValidateFunction {
  const ajv = buildAjv();
  const schema = schemas[name] as { $id: string };
  const compiled = ajv.getSchema(schema.$id);
  if (!compiled) throw new Error(`schema not registered: ${name}`);
  return compiled as ValidateFunction;
}
