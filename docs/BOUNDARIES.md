# Boundaries

Layer boundaries and contracts. Edit to reflect your architecture.

## Layer Model

| Layer | Rule | Description |
|-------|------|-------------|
| L1 Strategy | Never skip | Product goals, constraints |
| L2 Protocol | Never change without ADR | Schema contracts, interfaces |
| L3 Engineering | Freedom within bounds | Implementation, no contract changes |

## Boundary Rules

1. L1 decisions flow down to L2/L3
2. L2 changes require ADR approval
3. L3 changes must not break L2 contracts
4. Cross-layer changes need explicit tracking

## Stable vs. Changeful

| Stable (rarely change) | Changeful (frequently change) |
|------------------------|------------------------------|
| L2 Protocol Schema | L3 Implementation |
| ADR decisions | L3 Engineering files |
| BOUNDARIES.md | Project config |
