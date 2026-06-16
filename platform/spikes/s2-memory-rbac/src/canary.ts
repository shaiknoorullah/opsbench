// Default-namespace canary (MEM-002): a boot/CI probe that PROVES the engine's
// DEFAULT_MCP_NAMESPACE / DEFAULT_MCP_USER_ID fallback is unreachable through
// the proxy. Run on boot and in CI. Non-zero exit = isolation hazard present.
//
// The probe attempts every way a blank/default namespace could slip through and
// asserts each is BLOCKED at the proxy before any backend call.

import { InMemoryBackend } from "./backend-inmemory.ts";
import { MemoryRbacProxy, AccessDenied } from "./proxy.ts";
import { NamespaceError, assertCompiled, compileCallerNamespace } from "./namespace.ts";
import type { IdentityClaims } from "./claims.ts";

interface Probe {
  name: string;
  run: () => Promise<void> | void;
  expect: "block";
}

const backend = new InMemoryBackend();
let backendWrites = 0;
const origWrite = backend.write.bind(backend);
backend.write = async (i) => {
  backendWrites++;
  return origWrite(i);
};

const proxy = new MemoryRbacProxy({ backend });

const probes: Probe[] = [
  {
    name: "blank namespace string rejected by assertCompiled",
    expect: "block",
    run: () => {
      assertCompiled("");
    },
  },
  {
    name: "literal 'default' namespace rejected",
    expect: "block",
    run: () => {
      assertCompiled("org/default");
    },
  },
  {
    name: "compileCallerNamespace rejects org='default'",
    expect: "block",
    run: () => {
      compileCallerNamespace({ tenant_id: "t_x", org: "default" } as IdentityClaims);
    },
  },
  {
    name: "compileCallerNamespace rejects blank org",
    expect: "block",
    run: () => {
      compileCallerNamespace({ tenant_id: "t_x", org: "  " } as IdentityClaims);
    },
  },
  {
    name: "write with blank target namespace blocked before backend",
    expect: "block",
    run: async () => {
      const claims: IdentityClaims = { tenant_id: "t_x", org: "acme", dept: ["eng"], team: ["sre"], agent: "inv1" };
      await proxy.write(claims, { text: "x", targetNamespace: "" });
    },
  },
  {
    name: "write with 'default-user'-style default token blocked",
    expect: "block",
    run: async () => {
      const claims: IdentityClaims = { tenant_id: "t_x", org: "acme", dept: ["eng"], team: ["sre"], agent: "inv1" };
      await proxy.write(claims, { text: "x", targetNamespace: "org/default-user" });
    },
  },
];

async function main(): Promise<void> {
  let failures = 0;
  for (const p of probes) {
    let blocked = false;
    try {
      await p.run();
    } catch (e) {
      if (e instanceof NamespaceError || e instanceof AccessDenied) blocked = true;
      else {
        console.error(`CANARY UNEXPECTED ERROR in "${p.name}": ${(e as Error).message}`);
        failures++;
        continue;
      }
    }
    if (blocked) {
      console.log(`PASS  ${p.name}`);
    } else {
      console.error(`FAIL  ${p.name} — was NOT blocked (default-namespace fallback reachable!)`);
      failures++;
    }
  }
  if (backendWrites !== 0) {
    console.error(`FAIL  backend received ${backendWrites} write(s) — a blank/default namespace reached the engine`);
    failures++;
  } else {
    console.log("PASS  backend received 0 writes (no blank/default namespace reached the engine)");
  }

  if (failures > 0) {
    console.error(`\nCANARY FAILED: ${failures} isolation hazard(s). DEFAULT-NAMESPACE fallback is REACHABLE.`);
    process.exit(1);
  }
  console.log("\nCANARY PASSED: DEFAULT-NAMESPACE fallback is provably unreachable through the proxy.");
}

main();
