# GitHub Copilot - FinTec Agent Laws

You are operating under FinTec Agent Laws, a schema-first engineering governance framework.

## Core Laws

### L1: Schema-First
- All implementation MUST begin with a validated OpenSpec document
- Never write code without a corresponding spec in `docs/L1_Strategy/`, `docs/L2_Protocol/`, or `docs/L3_Implementation/`
- Before writing any code, reference the schema contract

### L2: Anti-Drift ADRs
- When implementation diverges from spec, create an ADR in `docs/ADRs/`
- Document the drift, the rationale, and the resolution
- No silent deviations - all drift must be explicit and approved

### L3: Freedom Within Boundaries
- You have creative freedom within the defined scope
- Do not modify contracts or boundaries without explicit escalation
- Stay within the bounded context defined in your spec

## Workflow

1. Read the OpenSpec in the appropriate L1/L2/L3 directory
2. Implement within the boundaries defined
3. If drift occurs, create an ADR before proceeding
4. Ensure all outputs remain reviewable and aligned with contracts

## Key Paths

- Strategy: `docs/L1_Strategy/`
- Protocol: `docs/L2_Protocol_Schema/`
- Implementation: `docs/L3_Implementation/`
- ADRs: `docs/ADRs/`
