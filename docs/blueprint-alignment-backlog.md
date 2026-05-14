# Blueprint Alignment Backlog

This document translates the current repository state into a blueprint-first execution order based on [docs/lifepass-portal-blueprint.md](docs/lifepass-portal-blueprint.md).

The rule is simple: do not prioritize repo drift over milestone order. New work should close the highest-priority blueprint gaps first.

## Milestone Status

| Milestone | Blueprint goal | Current repo state | Status |
| --- | --- | --- | --- |
| M0 Foundation | Stable env, deploy rails, health checks | Strong local/testnet tooling and startup gating are present | Partial |
| M1 Identity Onboarding | Profile DNA capture and Bronze onboarding | Signup, verifier submission, dashboard, and trust init exist | Partial |
| M2 Verification + Mint | Verified users mint end-to-end on-chain | Strict local testnet path now passes end to end, but hosted deployment parity is still incomplete | Partial |
| M3 Purpose Guide | Milestones, guidance, and opportunity alignment | Milestones and guide chat exist, but retrieval and recommendation depth are still shallow | Partial |
| M4 Multi-Portal Access | SSO, QR, audit trail, portal access | Implemented ahead of sequence, but still more infrastructure than mature downstream integrations | Partial |

## Execution Order

1. Close M2 operationally.
2. Close remaining M1 identity-capture gaps.
3. Complete M3 product depth.
4. Resume M4 rollout only after M2 and M3 are materially closed.

## P0 Now

### M2-OPS-001 Fund active signer and verify live mint affordability

Problem:
The live mint path is blocked by signer balance, even though the code path is present.

Primary files:
- [docs/FUNDING.md](docs/FUNDING.md)
- [services/api/scripts/deploy_contract.js](services/api/scripts/deploy_contract.js)
- [scripts/testnet-smoke.ps1](scripts/testnet-smoke.ps1)

Missing deliverable:
- A funded active signer with enough POL to complete deploy or mint transactions without simulated fallback.

Acceptance criteria:
- Current active signer balance is confirmed sufficient for strict Amoy mint transactions.
- `npm run deploy:sbt:dry` succeeds with no affordability failure.
- Strict smoke no longer requires `-AllowSimulatedMint`.

### M2-OPS-002 Prove strict testnet smoke end to end

Problem:
The repo proves local correctness, but not yet operational closure on the real chain path.

Primary files:
- [scripts/testnet-readiness.ps1](scripts/testnet-readiness.ps1)
- [scripts/testnet-smoke.ps1](scripts/testnet-smoke.ps1)
- [services/api/index.js](services/api/index.js)

Missing deliverable:
- A documented green run of strict `testnet` readiness and smoke against real testnet configuration.

Acceptance criteria:
- `powershell -ExecutionPolicy Bypass -File .\scripts\testnet-readiness.ps1 -Mode testnet` returns ready.
- `powershell -ExecutionPolicy Bypass -File .\scripts\testnet-smoke.ps1 -Mode testnet` passes without simulated mint.
- `/sbt/mint` is confirmed non-simulated in strict testnet mode.

### M2-OPS-003 Verify hosted deployment parity

Problem:
Local `.env.local` is near production shape, but hosted configuration must be proven separately.

Primary files:
- [render.yaml](render.yaml)
- [railway.json](railway.json)
- [docs/deployment-env-checklist.md](docs/deployment-env-checklist.md)
- [scripts/check-render-health.ps1](scripts/check-render-health.ps1)

Missing deliverables:
- Hosted secret parity after key rotation.
- Confirmed production health with durable governance checks.
- Equivalent deployment contract documented for Railway if Railway remains a supported target.

Acceptance criteria:
- Render health passes with no critical findings.
- Rotated signer and required auth secrets are confirmed in hosted env.
- If Railway is supported, its required env contract is documented to the same standard as Render.

Current audit status as of 2026-03-20:
- local strict testnet smoke is passing
- Render is reachable and basic mint env looks healthy
- Render is still missing the current governance-hardening health schema and durable governance verification
- see [docs/render-hosted-audit-2026-03-20.md](docs/render-hosted-audit-2026-03-20.md)

Current follow-up as of 2026-05-14:
- hosted Render API now returns HTTP `503` with `x-render-routing: suspend`
- M2-OPS-003 and M2-OPS-004 are blocked until the Render service/account is restored
- after restoration, rerun `scripts/check-render-health.ps1` and verify `Durable governance storage` is present and `PASS`

### M2-OPS-004 Align production governance with production expectations

Problem:
Production expects durable governance, but local success still permits file fallback.

Primary files:
- [services/api/.env.local](services/api/.env.local)
- [render.yaml](render.yaml)
- [services/api/tools/governanceMode.js](services/api/tools/governanceMode.js)
- [services/api/tests/startupVerifierGate.test.js](services/api/tests/startupVerifierGate.test.js)

Missing deliverable:
- A verified production deployment where governance persistence is backed by Postgres and health reports it as PASS.

Acceptance criteria:
- Hosted API reports durable governance storage as PASS.
- No production deployment depends on insecure file fallback.
- Governance tables are migrated and healthy.

## P1 Next

### M1-UX-001 Add biometric and media capture flow to web onboarding surfaces

Problem:
The API supports media upload intents and profile media storage, but web UI does not expose that workflow.

Primary files:
- [services/api/index.js](services/api/index.js#L1207)
- [apps/web/pages/signup.js](apps/web/pages/signup.js)
- [apps/web/pages/dashboard.js](apps/web/pages/dashboard.js)

Missing deliverables:
- Upload-intent driven biometric photo flow in web onboarding.
- Display of uploaded profile media state in dashboard or onboarding confirmation.

Acceptance criteria:
- Web can request `/onboarding/upload-url` and persist returned media reference on the profile.
- Web surfaces the current biometric media state to the user.
- Visibility settings remain consistent with uploaded biometric media.

### M1-UX-002 Add biometric and media capture flow to mobile onboarding

Problem:
The mobile app exposes onboarding, milestones, and guide chat, but not the biometric upload path described by the blueprint.

Primary files:
- [services/api/index.js](services/api/index.js#L1207)
- [apps/mobile/App.js](apps/mobile/App.js)
- [apps/mobile/README.md](apps/mobile/README.md)

Missing deliverables:
- Mobile upload-intent flow for biometric or profile photo capture.
- Display of uploaded media state in the journey view.

Acceptance criteria:
- Mobile can request upload intent and persist biometric reference on profile.
- Mobile journey view displays uploaded biometric media status.
- Mobile onboarding docs no longer imply a gap between API and UI capabilities.

## P1 After M2

### M3-CORE-001 Replace heuristic portal recommendation with opportunity-aware ranking

Problem:
The Purpose Guide currently maps user input to a portal with keyword heuristics.

Primary files:
- [services/api/tools/chatGuide.js](services/api/tools/chatGuide.js)
- [services/api/tools/vectorStore.js](services/api/tools/vectorStore.js)
- [docs/ai-guide.md](docs/ai-guide.md)

Missing deliverables:
- Opportunity objects or recommendation records.
- Ranking based on purpose, trust, milestones, and retrieved context.
- Explanation of why a portal or opportunity is recommended.

Acceptance criteria:
- `/ai/chat` returns structured recommendation reasoning, not only a portal label.
- Recommendations use profile, trust, milestones, and retrieved opportunity context.
- Tests cover at least agri, health, and commons recommendation paths with grounded inputs.

### M3-CORE-002 Upgrade retrieval from deterministic stub to meaningful guide context

Problem:
The current embedding layer is deterministic and suitable for scaffolding, not for blueprint-grade opportunity alignment.

Primary files:
- [services/api/tools/vectorStore.js](services/api/tools/vectorStore.js)
- [services/api/index.js](services/api/index.js#L2250)
- [docs/ai-guide.md](docs/ai-guide.md)

Missing deliverables:
- Better semantic retrieval over user history, milestones, and opportunity records.
- A clear storage contract for guide context beyond local demo vectors.

Acceptance criteria:
- Guide retrieval returns meaningful matches from real stored context.
- Data model supports user history and opportunity records separately.
- Fallback behavior remains deterministic when richer retrieval is unavailable.

### M3-CORE-003 Add stateful guide memory and follow-up planning

Problem:
The guide endpoint is stateless and cannot coach across multiple turns or commitments.

Primary files:
- [services/api/index.js](services/api/index.js#L2283)
- [services/api/tools/chatGuide.js](services/api/tools/chatGuide.js)
- [apps/web/components/GuideChat.js](apps/web/components/GuideChat.js)
- [apps/mobile/App.js](apps/mobile/App.js#L257)

Missing deliverables:
- Conversation thread or session model.
- Stored guide actions or next-step plans.
- Follow-up prompts based on prior commitments.

Acceptance criteria:
- Guide can continue a prior conversation or plan thread.
- A saved next-step or guide action can be revisited in later interactions.
- Web and mobile both surface the same guide state model.

### M3-CORE-004 Move channel support beyond share links

Problem:
Current channel support is link generation, not real companion-layer integration.

Primary files:
- [services/api/tools/chatGuide.js](services/api/tools/chatGuide.js#L38)
- [apps/web/components/GuideChat.js](apps/web/components/GuideChat.js#L84)
- [docs/lifepass-portal-blueprint.md](docs/lifepass-portal-blueprint.md)

Missing deliverables:
- Real in-app conversation continuity.
- External bot integration plan for WhatsApp or Telegram.

Acceptance criteria:
- In-app guide state is durable.
- External channel integration path is documented and implemented for at least one channel, or explicitly deferred with a clear boundary.

## P2 Later

### M4-PROD-001 Mature downstream portal modules beyond stubs

Problem:
Portal governance and access control are ahead of milestone order, but downstream portal experiences are still thin.

Primary files:
- [docs/multi-portal.md](docs/multi-portal.md)
- [services/api/portals/router.js](services/api/portals/router.js)
- [services/api/portals/agri.js](services/api/portals/agri.js)
- [services/api/portals/health.js](services/api/portals/health.js)

Missing deliverables:
- Stronger per-portal eligibility logic.
- Real workflow depth for at least one downstream portal.
- Cross-portal selective disclosure model.

Acceptance criteria:
- At least one downstream portal exposes a full workflow beyond status and access gates.
- Portal recommendation output maps to a meaningful workflow.
- Access audit remains intact across the deeper integration.

## Immediate Recommendation

The next implementation sequence should be:

1. Close M2-OPS-003 and M2-OPS-004 on Render so hosted parity matches the now-passing local strict testnet path.
2. Implement M1-UX-001 and M1-UX-002 so the identity layer matches the blueprint's capture model.
3. Start M3-CORE-001 and M3-CORE-002 before expanding M4 further.

## Notes

- The API suite is green locally, and strict local testnet smoke now passes end to end.
- Hosted Render parity is still the remaining M2 blocker because the deployed health schema is stale and durable governance cannot yet be verified.
- The repository is ahead of the blueprint in governance and portal control features; those should be treated as support work until M2 and M3 are closed.
