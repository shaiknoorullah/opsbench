// Single import seam onto the canonical, platform-owned schema package.
// The spike consumes the SAME source of truth as the services (spec Part 1):
// types + JSON Schemas + the Ajv validator factory live in packages/schemas.
//
// Per the spike brief, import via the relative tsx path.
export {
  validator,
  buildAjv,
  schemas,
  type EscalationLadder,
  type EscalationRung,
  type Surface,
  type UserId,
  type Sha256,
} from "../../../packages/schemas/src/index.ts";
