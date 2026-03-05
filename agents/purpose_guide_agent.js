class PurposeGuide {
  constructor(profileDb, zkProofTool, walletTool, policies = {}) {
    this.profileDb = profileDb;
    this.zkProofTool = zkProofTool;
    this.walletTool = walletTool;
    this.policies = Object.assign({ pii_handling: 'zk-first' }, policies);
  }

  async handleMint(userId, mintOpts = {}) {
    // Fetch profile (may contain PII)
    const profile = await this.profileDb.getProfile(userId);

    // PII handling: prefer ZK proof instead of sending raw PII
    const proof = await this.zkProofTool.generateOver18Proof(userId, profile);
    const verified = await this.zkProofTool.verifyProof(proof);
    if (!verified) {
      return { status: 'failed', error: 'Proof verification failed' };
    }

    // Mint via wallet tool (may be a simulated flow)
    const txHash = await this.walletTool.mintSbt(userId, proof, mintOpts);
    return {
      status: 'submitted',
      tx_hash: txHash,
      message: 'Mint request processed by PurposeGuide (JS)'
    };
  }
}

module.exports = PurposeGuide;
