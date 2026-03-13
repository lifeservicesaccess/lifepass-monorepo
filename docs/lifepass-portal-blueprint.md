# LifePass Portal Blueprint

## Tagline
One Identity. Infinite Destiny.

## 1. Core Purpose
Create a purpose-based digital identity that verifies who a person is and why they are, not only name/number attributes.

Design goals:
- Trusted
- Portable
- Tamper-resistant
- Master key for access across other portals

## 2. Core Components

### A. Identity Layer
Profile DNA:
- Photo and biometric data (face, fingerprint, optional)
- Legal name and preferred covenant name
- Short user-declared purpose statement
- Core skills and callings

Verification Sources:
- Trusted human verifiers (church, school, co-op)
- Document checks (passport, national ID, utility bills)
- Web of trust (mutual verification)

### B. Blockchain Layer
Soulbound Token (SBT):
- Non-transferable NFT minted to the user's wallet
- Stores LifePass ID plus purpose-linked metadata

On-chain Proofs:
- Time-stamped commitments (for example: covenant agreements)
- Verified actions (for example: project completion, service rendered)

Privacy Controls:
- User-managed visibility of public versus private attributes

### C. AI Companion Layer
Purpose Guide AI Agent:
- Tracks commitments and milestones
- Suggests opportunities aligned with calling
- Flags kairos timings for action

Voice + Chat Interface:
- WhatsApp
- Telegram
- In-app chatbot

### D. Access Layer
Single Sign-On:
- Use LifePass to log into any ZIONSTACK portal

QR/NFC Pass:
- Physical card scan or phone tap for offline verification

Tiered Trust Levels:
- Bronze: self-verified
- Silver: community-verified
- Gold: full-document plus covenant verification

## 3. Example User Journey
1. Sign up:
   - Download app
   - Take selfie
   - Enter basic details
   - Declare purpose
2. Verify:
   - Upload ID
   - Get community verification
   - Mint soulbound token
3. Use:
   - Access opportunities
   - Prove skills without CV
   - Access higher portals without re-registration
4. Grow:
   - Earn badges
   - Increase trust score
   - Expand skills
   - Fulfill purpose milestones

## 4. Launch Strategy
Pilot audience:
- Youth ministries
- Co-ops
- Universities
- Kingdom entrepreneurs

Partnership onboarding:
- Free setup for first 500 leaders
- Leaders onboard their communities

Viral loop:
- User invited by trusted person reaches Silver status after 2 endorsements

## 5. MVP Build Stack
- Frontend: React Native (mobile) plus React/Next.js (web)
- Backend: Node.js plus PostgreSQL
- Blockchain: Polygon or Celo (low gas)
- AI Layer: GPT-powered assistant plus vector database for personal history
- Hosting: AWS or Vercel

## 6. Monorepo Mapping
This section maps the blueprint to current folders in this repository.

- Identity Layer:
  - Mobile onboarding and profile capture in `apps/mobile`
  - Web onboarding fallback and dashboard in `apps/web`
  - Identity profile persistence and verification workflows in `services/api`
- Blockchain Layer:
  - SBT and trust registry contracts in `contracts`
  - Deployment and chain integration scripts in `services/api/scripts`
- AI Companion Layer:
  - Agent logic in `agents`
  - API-level AI orchestration and vector retrieval in `services/api`
- Access Layer:
  - SSO/session and portal routing in `apps/web` and `services/api/portals`
  - Offline verification support (QR/NFC handshake payloads) in `services/api`

## 7. MVP Milestones
M0: Foundation
- Environment and deployment rails validated
- Contract deployment scripts and API health checks stable

M1: Identity Onboarding
- Signup/profile capture in mobile and web
- Initial trust level assignment (Bronze)
- Basic verifier submission endpoints

M2: Verification + Mint
- Document and community verification APIs
- SBT mint flow wired end-to-end
- Trust upgrade to Silver/Gold rules enforced

M3: Purpose Guide
- Purpose milestone tracking in API
- Guide chat integration in web/mobile
- Opportunity suggestion pipeline with vector retrieval

M4: Multi-Portal Access
- LifePass SSO for at least one downstream portal
- QR verification payload support
- Audit trail for access events and on-chain anchors

## 8. Success Metrics
- Activation: user reaches Bronze profile completion within first session
- Verification: percentage of users upgraded to Silver within 14 days
- Utility: percentage of verified users completing at least one purpose milestone per month
- Retention: monthly active verified users
- Ecosystem: number of active partner communities and portal integrations
