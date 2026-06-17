// Schema bridge to @opsbench/schemas (the source of truth, spec Part 1 §4).
//
// We consume the REAL committed JSON Schemas from packages/schemas via relative
// path, compiled with this spike's own ajv (local node_modules). We deliberately
// do NOT import packages/schemas/src/index.ts at runtime: that module resolves
// `ajv` relative to its own location, where there is no node_modules, so it
// would fail in a standalone spike. Loading the JSON + compiling here keeps the
// spike self-contained while still validating against the normative schema.
//
// The TypeScript *type* still comes from the schemas package (type-only import,
// erased at runtime), so a drift between our emitter and the contract is a
// compile error.

// ajv ships a CJS-ish ESM default export; under NodeNext the constructor lives
// on `.default`. The `as` casts give us the right call/construct signatures
// without fighting esModuleInterop (tsx resolves the same value at runtime).
import Ajv2020Import, { type ValidateFunction } from "ajv/dist/2020.js";
import addFormatsImport from "ajv-formats";

// ajv/ajv-formats are published as ESM-wrapped CJS: under NodeNext the callable
// values live on `.default`. We bind them through `any` to sidestep the
// namespace-import construct-signature friction in `tsc`; tsx resolves the same
// runtime values. Public API below stays precisely typed (ValidateFunction).
type AnyCtor = { new (opts?: unknown): AjvInstance };
interface AjvInstance {
  addSchema(schema: object, key?: string): AjvInstance;
  getSchema(key: string): ValidateFunction | undefined;
}
const Ajv2020 = ((Ajv2020Import as { default?: unknown }).default ?? Ajv2020Import) as AnyCtor;
const addFormats = ((addFormatsImport as { default?: unknown }).default ??
  addFormatsImport) as (ajv: AjvInstance) => AjvInstance;

import common from "../../../packages/schemas/json/common.json" with { type: "json" };
import autonomyCertificate from "../../../packages/schemas/json/autonomy-certificate.json" with { type: "json" };
import auditRecord from "../../../packages/schemas/json/audit-record.json" with { type: "json" };

// Type-only import (erased at runtime) — keeps the emitter honest against the
// contract. We pull the type from the package's types module directly so a
// typecheck of THIS spike does not depend on the package index's ajv typings.
import type { AutonomyCertificate } from "../../../packages/schemas/src/types.ts";
export type { AutonomyCertificate };

function buildAjv(): AjvInstance {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  // common must be registered first so sibling $refs resolve.
  ajv.addSchema(common as object, (common as { $id: string }).$id);
  ajv.addSchema(autonomyCertificate as object, (autonomyCertificate as { $id: string }).$id);
  ajv.addSchema(auditRecord as object, (auditRecord as { $id: string }).$id);
  return ajv;
}

let _ajv: AjvInstance | null = null;
function ajv(): AjvInstance {
  return (_ajv ??= buildAjv());
}

export function autonomyCertificateValidator(): ValidateFunction {
  const id = (autonomyCertificate as { $id: string }).$id;
  const v = ajv().getSchema(id);
  if (!v) throw new Error("autonomy-certificate schema not registered");
  return v as ValidateFunction;
}

export function auditRecordValidator(): ValidateFunction {
  const id = (auditRecord as { $id: string }).$id;
  const v = ajv().getSchema(id);
  if (!v) throw new Error("audit-record schema not registered");
  return v as ValidateFunction;
}
