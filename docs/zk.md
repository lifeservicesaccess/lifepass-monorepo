# Zero‑Knowledge Proofs

This guide describes the over‑18 zero‑knowledge circuit and how to generate and verify proofs using Circom and snarkjs.

## Circuit Overview

The `over18.circom` circuit proves that a user’s age, calculated as `current_year - birth_year`, is at least 18 without revealing the actual birth year.  Inputs:

| Signal       | Visibility | Description                                   |
|--------------|-----------|-----------------------------------------------|
| `birth_year` | private    | User’s birth year as an integer (e.g., 2000). |
| `current_year` | public  | The current year (e.g., 2026).                 |
| `is_over_18` | public    | Outputs 1 if `current_year - birth_year ≥ 18`. |

Internally, the circuit computes `age = current_year - birth_year` and uses a comparator to set `is_over_18` to `1` if `age` is at least 18 and `0` otherwise.

## Setup

Install Circom and snarkjs:

```bash
npm install -g circom
npm install -g snarkjs
```

Compile the circuit and generate a proving/verifying key:

```bash
circom zk/over18.circom --r1cs --wasm --sym -o zk/build
snarkjs groth16 setup zk/build/over18.r1cs powersOfTau28_hez_final_10.ptau zk/build/over18.zkey
snarkjs zkey export verificationkey zk/build/over18.zkey zk/build/over18.vkey
```

Generate a proof:

```bash
# Prepare input.json with values for birth_year and current_year
snarkjs groth16 prove zk/build/over18.zkey zk/build/over18.wasm input.json proof.json public.json
```

Verify the proof:

```bash
snarkjs groth16 verify zk/build/over18.vkey public.json proof.json
```

## Integration

The backend API accepts `proof` and `publicSignals` and should forward them to an on‑chain verifier contract or verify off‑chain using snarkjs.  The `publicSignals` object must include an `is_over_18` field equal to `1` for a successful mint.