// Wallet tool: prefer real ethers-based minting when configured, otherwise simulate
const { ethers } = require('ethers');

async function mintSbt(userId, proof, opts = {}) {
  const RPC_URL = process.env.RPC_URL;
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  const SBT_CONTRACT_ADDRESS = process.env.SBT_CONTRACT_ADDRESS;

  if (RPC_URL && PRIVATE_KEY && SBT_CONTRACT_ADDRESS) {
    try {
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
      // Minimal ABI matching the contract mint signature
      const abi = [
        'function mint(address to, uint256 tokenId, tuple(string purpose,uint8 trustScore,string verificationLevel,string didUri) meta) external'
      ];
      const contract = new ethers.Contract(SBT_CONTRACT_ADDRESS, abi, wallet);
      const to = opts.to || wallet.address;
      const tokenId = opts.tokenId || Math.floor(Date.now() / 1000);
      const metadata = opts.metadata || { purpose: 'AutoMint', trustScore: 0, verificationLevel: 'Unknown', didUri: '' };
      const tx = await contract.mint(to, tokenId, metadata);
      await tx.wait();
      return tx.hash;
    } catch (err) {
      console.error('wallet.mintSbt error (ethers):', err);
      // fallthrough to simulated
    }
  }

  // Fallback simulated tx hash
  return `0xSIMULATED_TX_${userId}_${Date.now()}`;
}

module.exports = { mintSbt };
