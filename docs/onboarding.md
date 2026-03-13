# Onboarding and Trust Score Flow

## Overview

The onboarding flow collects user identity metadata and verification documents, then gates minting until manual/agent verification is approved.

## API Endpoints

- `POST /onboarding/signup`
  - Input: `userId`, `legalName` (or legacy `name`), `preferredCovenantName` (or `covenantName`), `purposeStatement` (or legacy `purpose`), `skills[]`/`coreSkills[]`, `callings[]`, `verificationDocs[]`, optional `biometricPhotoRef`, optional `biometricPhotoUrl`
  - Output: profile with `verificationStatus: pending` plus `trust` payload initialized to Bronze
- `POST /onboarding/upload-url`
  - Input: `userId`, `fileName`, optional `contentType`, optional `mediaType`
  - Output: upload intent + persisted media reference
- `GET /onboarding/media/:userId`
  - Output: uploaded/reference media entries
- `POST /onboarding/verify` (API key protected)
  - Input: `userId`, `status` (`pending|approved|rejected`), optional `reviewerId`, optional `reviewerNote`
  - Output: updated profile and trust score
- `POST /onboarding/verifier-submission`
  - Input: `userId`, `verifierName`, `verifierType` (`church|school|co-op|employer|leader|other`), optional `relationship`, optional `endorsement`
  - Output: stored submission, submission count, and updated profile
- `POST /verifications/add` (API key protected)
  - Input: `userId`, `kind` (`endorsement|document|mutual`), optional `status`, optional verifier/document metadata
  - Output: verification event + recalculated trust/status
- `POST /verifications/revoke` (API key protected)
  - Input: `userId`, `verificationId`, optional `reason`, optional `reviewerId`
  - Output: revoked event + recalculated trust/status
- `GET /verifications/:userId`
  - Output: verification event list + summary counts for endorsements/docs/mutual links
- `GET /users/:userId/dashboard`
  - Output: profile + trust score record

## Trust Score

Trust score is stored in `services/data/trust-scores.json` in local mode and exposed via:

- `GET /trust/:userId`
- `POST /trust/:userId/update` (API key protected)

Levels:

- `0-49`: Bronze
- `50-79`: Silver
- `80-100`: Gold

Sprint 1 trust criteria:

- Approved endorsements increase trust (capped)
- Approved document checks increase trust (capped)
- Mutual verifications increase trust (capped)
- Any rejected document check caps trust and status as rejected/pending per policy

## Mint Gating

`POST /flow/mint` now rejects profiles where `verificationStatus` is not `approved`.

Verification transitions are constrained:

- `pending -> approved|rejected` is allowed
- `approved -> pending|rejected` is rejected
- `rejected -> pending|approved` is rejected

`POST /flow/mint` now enforces idempotency by user/profile. Once a mint is submitted, a second call returns `409`.

`POST /sbt/mint` can link mint results back to profile and initialize trust score when `userId` is supplied.
