const fs = require('fs');
const path = require('path');
const solc = require('solc');
const { ethers } = require('ethers');
const { loadApiEnv } = require('../tools/loadEnv');

loadApiEnv();

function makeImportResolver(baseFilePath) {
  return function findImports(importPath) {
    const candidates = [];

    if (importPath.startsWith('@')) {
      candidates.push(path.join(__dirname, '..', 'node_modules', importPath));
      candidates.push(path.join(__dirname, '..', '..', '..', 'node_modules', importPath));
    } else {
      candidates.push(path.join(path.dirname(baseFilePath), importPath));
      candidates.push(path.join(__dirname, '..', '..', '..', 'contracts', importPath));
    }

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return { contents: fs.readFileSync(candidate, 'utf8') };
      }
    }

    return { error: `File not found: ${importPath}` };
  };
}

async function compileSol(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const input = {
    language: 'Solidity',
    sources: {
      [path.basename(filePath)]: { content: source }
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } }
    }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: makeImportResolver(filePath) }));
  if (output.errors) {
    const errs = output.errors.filter((e) => e.severity === 'error');
    if (errs.length) throw new Error(errs.map((e) => e.formattedMessage).join('\n'));
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
  const contractPath = path.join(__dirname, '..', '..', '..', 'contracts', 'LifePassTrustRegistry.sol');
  const { abi, bytecode, contractName } = await compileSol(contractPath);
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);

  console.log('Compiled', contractName);
  console.log('Deployer:', wallet.address);

  if (process.env.DEPLOY_DRY_RUN === '1') {
    console.log('DEPLOY_DRY_RUN=1 set; skipping on-chain deployment.');
    return { name: contractName, address: null, txHash: null, dryRun: true };
  }

  const contract = await factory.deploy(wallet.address);
  const deployTx = contract.deploymentTransaction();
  await contract.waitForDeployment();

  console.log('Deployed at', contract.target);
  return { name: contractName, address: contract.target, txHash: deployTx ? deployTx.hash : null };
}

if (require.main === module) {
  deploy().then((r) => { console.log('Deploy result', r); process.exit(0); }).catch((err) => { console.error('Deploy failed:', err); process.exit(1); });
}

module.exports = { deploy };
