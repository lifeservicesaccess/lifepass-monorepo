const fs = require('fs');
const path = require('path');
const solc = require('solc');
const { ethers } = require('ethers');

async function compileSol(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const input = {
    language: 'Solidity',
    sources: {
      [path.basename(filePath)]: { content: source }
    },
    settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } } }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  if (output.errors) {
    const errs = output.errors.filter(e => e.severity === 'error');
    if (errs.length) throw new Error(errs.map(e => e.formattedMessage).join('\n'));
  }
  const contractName = Object.keys(output.contracts[path.basename(filePath)])[0];
  const contract = output.contracts[path.basename(filePath)][contractName];
  return { contractName, abi: contract.abi, bytecode: contract.evm.bytecode.object };
}

async function deploy() {
  const RPC_URL = process.env.RPC_URL;
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  if (!RPC_URL || !PRIVATE_KEY) {
    throw new Error('Set RPC_URL and PRIVATE_KEY to deploy');
  }
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  const contractPath = path.join(__dirname, '..', '..', 'contracts', 'LifePassSBT.sol');
  const { abi, bytecode, contractName } = await compileSol(contractPath);
  console.log('Compiled', contractName);
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy();
  console.log('Deploy tx:', contract.deployTransaction.hash);
  await contract.waitForDeployment();
  console.log('Deployed at', contract.target);
  return { name: contractName, address: contract.target, txHash: contract.deployTransaction.hash };
}

if (require.main === module) {
  deploy().then((r) => { console.log('Deploy result', r); process.exit(0); }).catch(err => { console.error('Deploy failed:', err); process.exit(1); });
}

module.exports = { deploy };
