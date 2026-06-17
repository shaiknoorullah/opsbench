#!/usr/bin/env node
// Validates the Opsbench JSON Schemas and checks example instances.
// This is the schemas-package gate (PRD NF: schemas are the source of truth; spec Part 1).
//
// - Registers common.json first (sibling $refs resolve against it by $id).
// - Compiles every schema in json/ (except common.json).
// - For each schema, runs examples/<name>.valid.json (must pass) and
//   examples/<name>.invalid.json (must fail). Missing example files are reported, not fatal.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const jsonDir = join(root, "json");
const examplesDir = join(root, "examples");

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

const load = (p) => JSON.parse(readFileSync(p, "utf8"));

// Register common first so relative $refs (common.json#/...) resolve.
const common = load(join(jsonDir, "common.json"));
ajv.addSchema(common, common.$id);

const schemaFiles = readdirSync(jsonDir)
  .filter((f) => f.endsWith(".json") && f !== "common.json")
  .sort();

let failures = 0;
const compiled = new Map();

for (const file of schemaFiles) {
  const schema = load(join(jsonDir, file));
  try {
    const validate = ajv.compile(schema);
    compiled.set(basename(file, ".json"), validate);
    console.log(`  compiled  ${file}`);
  } catch (err) {
    failures++;
    console.error(`  FAILED to compile ${file}: ${err.message}`);
  }
}

const checkExample = (name, kind, validate) => {
  const path = join(examplesDir, `${name}.${kind}.json`);
  if (!existsSync(path)) {
    console.log(`  (no ${kind} example for ${name})`);
    return;
  }
  const ok = validate(load(path));
  const expected = kind === "valid";
  if (ok === expected) {
    console.log(`  ok        ${name}.${kind}.json`);
  } else {
    failures++;
    console.error(`  MISMATCH  ${name}.${kind}.json expected ${expected ? "PASS" : "FAIL"} but got ${ok ? "PASS" : "FAIL"}`);
    if (validate.errors && !expected === ok) {
      console.error("    " + ajv.errorsText(validate.errors, { separator: "\n    " }));
    }
  }
};

if (existsSync(examplesDir)) {
  console.log("\nexamples:");
  for (const [name, validate] of compiled) {
    checkExample(name, "valid", validate);
    checkExample(name, "invalid", validate);
  }
}

if (failures > 0) {
  console.error(`\n${failures} failure(s).`);
  process.exit(1);
}
console.log(`\nAll ${compiled.size} schemas compiled; all present examples behaved as expected.`);
