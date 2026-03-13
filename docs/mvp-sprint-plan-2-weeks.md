# 2-Week MVP Sprint Plan (M1-Focused)

## Sprint Window
- Duration: 10 working days (2 weeks)
- Goal: Deliver M1 Identity Onboarding (signup, Bronze initialization, verifier submissions) across API, web, and mobile

## Scope Baseline
In scope:
- API onboarding schema upgrade
- Bronze trust initialization at signup
- Verifier submission API
- Web signup flow upgrade
- Mobile onboarding implementation (replace placeholder)
- Regression tests for onboarding endpoints

Out of scope this sprint:
- Full document review engine
- On-chain mint hardening
- SSO assertions and QR/NFC access

## Codebase Alignment
- API core: `services/api/index.js`
- API storage adapters: `services/api/tools/profileDb.js`, `services/api/tools/trustScoreStore.js`
- Web onboarding UI: `apps/web/pages/signup.js`
- Mobile onboarding UI: `apps/mobile/App.js`
- Test suite: `services/api/tests/`

## Day-by-Day Plan
### Week 1
Day 1:
- Finalize M1 contract for payload schema and validation rules
- Confirm environment defaults (`PORT`, `NEXT_PUBLIC_API_BASE_URL`, local mobile API host)
- Output: implementation notes in `docs/onboarding.md`

Day 2:
- API: ship normalized signup payload handling and legacy alias support
- API: initialize Bronze trust on signup
- Output: endpoint response includes `trust` payload

Day 3:
- API: add verifier submission endpoint and profile linkage
- API: enforce validator constraints for verifier types
- Output: submission count + profile snapshot in response

Day 4:
- Web: update signup form fields for profile DNA
- Web: add verifier submission UI section
- Output: successful onboarding and source submission from `apps/web/pages/signup.js`

Day 5:
- Mobile: replace placeholder app with onboarding form
- Mobile: wire to API endpoint and add submission status states
- Output: emulator-tested signup path

### Week 2
Day 6:
- API tests: add HTTP tests for signup normalization and Bronze assignment
- API tests: add verifier submission tests (201/400/404)
- Output: deterministic green test run in local mode

Day 7:
- Hardening pass: input edge cases, error messaging consistency, response contracts
- Output: cleanup commits and updated docs snippets

Day 8:
- Integration day: test web + mobile against local API with realistic data
- Output: defect list triaged and fixed

Day 9:
- Release prep: update docs and backlog status
- Dry run GitHub issue import for remaining milestones
- Output: sprint demo checklist

Day 10:
- Demo + retrospective
- Decide M2 top 3 priorities for next sprint
- Output: approved M2 kickoff backlog

## Definition of Done
- API endpoints respond with stable response schema and validation errors
- Web and mobile can successfully submit onboarding payloads
- Bronze trust is deterministic at signup
- Verifier submissions are persisted and visible
- Automated tests cover core onboarding happy and failure paths
- Documentation reflects actual payload and endpoint behavior

## Risks and Mitigations
- Risk: Local mobile cannot reach local API due to host mapping.
  Mitigation: Use `10.0.2.2` for Android emulator and document alternatives.

- Risk: Existing clients still send legacy `name`/`purpose` only.
  Mitigation: Maintain alias compatibility in API normalization.

- Risk: Trust default env accidentally set above Bronze range.
  Mitigation: cap onboarding trust initialization to max 49.

## Suggested Sprint Board Columns
- Backlog
- Ready
- In Progress
- In Review
- QA
- Done

## Metrics for This Sprint
- Signup success rate in local testing
- Time to onboard from first load to successful submission
- Verifier submission success/error distribution
- Number of onboarding regressions caught by automated tests
