# QA & Testing

Quality assurance is critical to ensuring that the LifePass system operates securely, reliably and as intended.  This document outlines the testing strategy and tools used to validate each component.

## Smart Contracts

Smart contracts are tested using Foundry.  The test in `contracts/test/LifePassSBT.t.sol` verifies that:

- Only authorised verifiers can mint new tokens.
- Tokens cannot be transferred once minted (soulbound behaviour).
- Revocation and metadata updates require the appropriate roles.

Additional tests should cover edge cases such as pausing, upgrades and access control revocations.

## Zero‑Knowledge Circuits

Circuits should be unit tested using snarkjs with known input/output pairs.  Ensure that invalid inputs fail verification and that the circuit size and constraint counts remain within acceptable limits.

## API

API endpoints can be tested with a framework like Jest or Supertest.  Tests should mock the blockchain provider and verify response status codes, error handling and JSON schemas.

Current integration tests use Node's built-in test runner (`node --test`) and now cover:

- onboarding identity extensions (`preferredCovenantName`, biometric photo refs)
- upload intent + media reference persistence
- verification add/revoke workflow
- trust-level recalculation side effects

## Frontend

Use Playwright or Cypress for end‑to‑end tests that simulate user interactions with the web interface.  Scenarios include submitting a proof, minting a token, handling errors and displaying transaction confirmations.

## Agents

Agent workflows should include prompt‑response evaluations, tool‑call accuracy checks and latency budgets.  Red‑team evaluations help ensure that the agents handle adversarial inputs gracefully.

## Continuous Integration

Integrate all tests into the CI pipeline (e.g., GitHub Actions) to automatically run on pull requests.  Configure quality gates such as code coverage thresholds, linting and static analysis (slither, solhint) to prevent regressions.

CI now also runs `npm run check:schema` in `services/api` to ensure Sprint 1 SQL migration artifacts are present before API tests execute.