// Entry point for @opsbench/schemas.
// Re-exports the TypeScript types and the JSON Schemas, and provides a validator
// factory so services and spikes share one source of truth (spec Part 1).
//
// JSON imports use import attributes (Node >= 20.10 / tsx). Consumers run under tsx
// or a bundler with JSON module support.
// ajv's 2020 entry and ajv-formats are CommonJS default exports. Use namespace
// imports + runtime default-unwrap so this module type-checks under any consumer
// tsconfig (no esModuleInterop requirement) while staying runtime-equivalent.
import type { ValidateFunction } from "ajv";
import * as AjvNs from "ajv/dist/2020.js";
import * as AddFormatsNs from "ajv-formats";

const Ajv2020 = ((AjvNs as { default?: unknown }).default ?? AjvNs) as typeof import("ajv/dist/2020.js").default;
const addFormats = ((AddFormatsNs as { default?: unknown }).default ?? AddFormatsNs) as (ajv: unknown, opts?: unknown) => unknown;

type AjvInstance = InstanceType<typeof import("ajv/dist/2020.js").default>;

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
export function buildAjv(): AjvInstance {
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
