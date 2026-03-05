import unittest

from agents.purpose_guide_agent import PurposeGuide


class MockProfileDB:
    def __init__(self):
        self.called_with = None

    def get_profile(self, user_id):
        self.called_with = user_id
        return {"user_id": user_id, "name": "Test User", "dob": "2000-01-01"}


class MockZKProofTool:
    def __init__(self):
        self.called_with = None

    def generate_over18_proof(self, user_id):
        self.called_with = user_id
        return {"proof": "FAKE_PROOF", "publicSignals": {"is_over_18": 1}}


class MockWalletTool:
    def __init__(self):
        self.called_with = None

    def mint_sbt(self, user_id, proof):
        self.called_with = (user_id, proof)
        return "0xFAKE_TX_HASH"


class PurposeGuideTest(unittest.TestCase):
    def test_handle_mint_flow(self):
        profile_db = MockProfileDB()
        zk_tool = MockZKProofTool()
        wallet = MockWalletTool()

        agent = PurposeGuide(profile_db, zk_tool, wallet)
        result = agent.handle_mint('user-123')

        # Verify return structure
        self.assertIsInstance(result, dict)
        self.assertEqual(result.get('status'), 'submitted')
        self.assertIn('tx_hash', result)

        # Verify mocks were called with expected args
        self.assertEqual(profile_db.called_with, 'user-123')
        self.assertEqual(zk_tool.called_with, 'user-123')
        self.assertEqual(wallet.called_with[0], 'user-123')
        self.assertEqual(wallet.called_with[1]['proof'], 'FAKE_PROOF')


if __name__ == '__main__':
    unittest.main()
