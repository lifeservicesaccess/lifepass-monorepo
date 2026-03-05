# Infrastructure

This directory is intended for infrastructure as code (IaC) configurations, such as Terraform scripts for deploying resources, CI/CD pipelines, and secret management definitions.

This folder contains infrastructure‑as‑code (IaC) definitions and CI/CD pipelines for automating deployment and testing.

## CI/CD Pipeline

Use GitHub Actions to automatically lint, test and deploy the project.  A sample workflow might:

1. Install Node and Solidity toolchains.
2. Run ESLint and Prettier to enforce style.
3. Compile and test the smart contracts using Foundry.
4. Run unit tests for the API and frontend.
5. Build the Next.js app and package the mobile app.
6. Deploy smart contracts to a testnet via Hardhat.
7. Publish Docker images or serverless functions for the API.

A basic workflow file could be placed in `.github/workflows/ci.yml`.  See `docs/ci-cd.md` for more details.
