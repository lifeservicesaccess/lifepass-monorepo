# Onboarding and Trust Score Flow

## Overview

The onboarding flow collects user identity metadata and verification documents, then gates minting until manual/agent verification is approved.

## API Endpoints

- `POST /onboarding/signup`
  - Input: `userId`, `name`, `purpose`, `skills[]`, `verificationDocs[]`
  - Output: profile with `verificationStatus: pending`
- `POST /onboarding/verify` (API key protected)
  - Input: `userId`, `status` (`pending|approved|rejected`)
  - Output: updated profile and trust score
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

## Mint Gating

`POST /flow/mint` now rejects profiles where `verificationStatus` is not `approved`.

`POST /sbt/mint` can link mint results back to profile and initialize trust score when `userId` is supplied.
