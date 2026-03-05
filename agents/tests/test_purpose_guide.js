const assert = require('assert');
const PurposeGuide = require('../purpose_guide_agent');

class MockProfileDB {
  constructor() { this.calledWith = null; }
  getProfile(userId) { this.calledWith = userId; return { user_id: userId, name: 'Test User', dob: '2000-01-01' }; }
}

class MockZKProofTool {
  constructor() { this.calledWith = null; }
  generateOver18Proof(userId) { this.calledWith = userId; return { proof: 'FAKE_PROOF', publicSignals: { is_over_18: 1 } }; }
}

class MockWalletTool {
  constructor() { this.calledWith = null; }
  mintSbt(userId, proof) { this.calledWith = [userId, proof]; return '0xFAKE_TX_HASH'; }
}

(function runTests(){
  const profileDb = new MockProfileDB();
  const zkTool = new MockZKProofTool();
  const wallet = new MockWalletTool();

  const agent = new PurposeGuide(profileDb, zkTool, wallet);
  agent.handleMint('user-123').then(result => {
    try {
      assert.strictEqual(result.status, 'submitted');
      assert.ok(result.tx_hash);

      assert.strictEqual(profileDb.calledWith, 'user-123');
      assert.strictEqual(zkTool.calledWith, 'user-123');
      assert.strictEqual(wallet.calledWith[0], 'user-123');
      assert.strictEqual(wallet.calledWith[1].proof, 'FAKE_PROOF');

      console.log('PurposeGuide JS tests passed');
      process.exit(0);
    } catch (err) {
      console.error('Test failed:', err.message);
      process.exit(2);
    }
  }).catch(err => { console.error('Test run error:', err); process.exit(3); });
})();
