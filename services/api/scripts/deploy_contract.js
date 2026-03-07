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
      optimizer: { enabled: true, runs: 1 },
      viaIR: true,
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } }
    }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: makeImportResolver(filePath) }));
  if (output.errors) {
    const errs = output.errors.filter(e => e.severity === 'error');
    if (errs.length) throw new Error(errs.map(e => e.formattedMessage).join('\n'));
  }
  const contractName = Object.keys(output.contracts[path.basename(filePath)])[0];
  const contract = output.contracts[path.basename(filePath)][contractName];
  return { contractName, abi: contract.abi, bytecode: contract.evm.bytecode.object };
}

function parseBigIntEnv(name, defaultValue) {
  const value = process.env[name];
  if (value == null || value === '') return defaultValue;
  const parsed = BigInt(value);
  if (parsed < 0n) throw new Error(`${name} must be >= 0`);
  return parsed;
}

function parseGweiEnv(name) {
  const value = process.env[name];
  if (value == null || value === '') return null;
  return ethers.parseUnits(value, 'gwei');
}

function parsePolBufferWei() {
  const value = process.env.DEPLOY_BALANCE_BUFFER_POL;
  if (value == null || value === '') return ethers.parseEther('0.005');
  return ethers.parseEther(value);
}

function toEthString(weiValue) {
  return ethers.formatEther(weiValue);
}

function toGweiString(weiValue) {
  return ethers.formatUnits(weiValue, 'gwei');
}

function selectAffordableGasPrice({
  label,
  strategy,
  manualGasPriceWei,
  suggestedGasPriceWei,
  baseFeeWei,
  minGasPriceWei,
  maxGasPriceWei,
  balanceWei,
  totalGasUnits,
  safetyBufferWei
}) {
  const spendableWei = balanceWei > safetyBufferWei ? (balanceWei - safetyBufferWei) : 0n;
  if (spendableWei <= 0n) {
    throw new Error(`${label}: deployer balance is below configured safety buffer`);
  }

  if (totalGasUnits <= 0n) {
    throw new Error(`${label}: total gas units must be > 0`);
  }

  const affordableGasPriceWei = spendableWei / totalGasUnits;
  if (affordableGasPriceWei <= 0n) {
    throw new Error(`${label}: balance cannot cover gas at any positive gas price`);
  }

  let selectedGasPriceWei;
  let reason;

  if (manualGasPriceWei) {
    selectedGasPriceWei = manualGasPriceWei;
    reason = 'manual DEPLOY_GAS_PRICE_GWEI';
  } else if (strategy === 'provider') {
    if (!suggestedGasPriceWei) {
      throw new Error(`${label}: provider did not return gasPrice; cannot use provider strategy`);
    }
    selectedGasPriceWei = suggestedGasPriceWei;
    reason = 'provider suggested gas price';
  } else if (strategy === 'auto') {
    selectedGasPriceWei = suggestedGasPriceWei || affordableGasPriceWei;
    if (selectedGasPriceWei > affordableGasPriceWei) {
      selectedGasPriceWei = affordableGasPriceWei;
      reason = 'auto-capped to affordable gas price';
    } else {
      reason = 'auto-selected provider gas price';
    }
  } else {
    throw new Error(`Unsupported DEPLOY_GAS_STRATEGY: ${strategy}. Use auto or provider.`);
  }

  if (maxGasPriceWei && selectedGasPriceWei > maxGasPriceWei) {
    selectedGasPriceWei = maxGasPriceWei;
    reason = `${reason} (clamped by DEPLOY_MAX_GAS_PRICE_GWEI)`;
  }

  if (minGasPriceWei && selectedGasPriceWei < minGasPriceWei) {
    selectedGasPriceWei = minGasPriceWei;
    reason = `${reason} (raised by DEPLOY_MIN_GAS_PRICE_GWEI)`;
  }

  if (selectedGasPriceWei > affordableGasPriceWei) {
    throw new Error(
      `${label}: selected gas price ${toGweiString(selectedGasPriceWei)} gwei exceeds affordable ${toGweiString(affordableGasPriceWei)} gwei`
    );
  }

  if (baseFeeWei && selectedGasPriceWei < baseFeeWei) {
    throw new Error(
      `${label}: selected gas price ${toGweiString(selectedGasPriceWei)} gwei is below current base fee ${toGweiString(baseFeeWei)} gwei`
    );
  }

  return {
    selectedGasPriceWei,
    affordableGasPriceWei,
    spendableWei,
    reason
  };
}

async function deploy() {
  const RPC_URL = process.env.RPC_URL;
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  if (!RPC_URL || !PRIVATE_KEY) {
    throw new Error('Set RPC_URL and PRIVATE_KEY to deploy');
  }
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  const strategy = (process.env.DEPLOY_GAS_STRATEGY || 'auto').toLowerCase();
  const manualGasPriceWei = parseGweiEnv('DEPLOY_GAS_PRICE_GWEI');
  const minGasPriceWei = parseGweiEnv('DEPLOY_MIN_GAS_PRICE_GWEI');
  const maxGasPriceWei = parseGweiEnv('DEPLOY_MAX_GAS_PRICE_GWEI');
  const initGasReserve = parseBigIntEnv('DEPLOY_INIT_GAS_RESERVE', 250000n);
  const safetyBufferWei = parsePolBufferWei();
  const dryRun = process.env.DEPLOY_DRY_RUN === '1';

  const deployOverrides = {};
  const initOverrides = {};

  const contractPath = path.join(__dirname, '..', '..', '..', 'contracts', 'LifePassSBT.sol');
  const { abi, bytecode, contractName } = await compileSol(contractPath);
  console.log('Compiled', contractName);
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);

  const deployRequest = await factory.getDeployTransaction();
  const estimatedDeployGas = await provider.estimateGas({
    ...deployRequest,
    from: wallet.address
  });

  const feeData = await provider.getFeeData();
  const block = await provider.getBlock('latest');
  const providerGasPriceWei = feeData.gasPrice || feeData.maxFeePerGas;
  const baseFeeWei = block && block.baseFeePerGas ? block.baseFeePerGas : null;
  const currentBalance = await provider.getBalance(wallet.address);

  const deployGasSelection = selectAffordableGasPrice({
    label: 'deploy',
    strategy,
    manualGasPriceWei,
    suggestedGasPriceWei: providerGasPriceWei,
    baseFeeWei,
    minGasPriceWei,
    maxGasPriceWei,
    balanceWei: currentBalance,
    totalGasUnits: estimatedDeployGas + initGasReserve,
    safetyBufferWei
  });

  deployOverrides.gasPrice = deployGasSelection.selectedGasPriceWei;
  const deployCostEstimate = estimatedDeployGas * deployGasSelection.selectedGasPriceWei;

  console.log('Deployer:', wallet.address);
  console.log('Gas strategy:', manualGasPriceWei ? 'manual' : strategy);
  if (providerGasPriceWei) {
    console.log('Provider gas price (gwei):', toGweiString(providerGasPriceWei));
  }
  if (baseFeeWei) {
    console.log('Current base fee (gwei):', toGweiString(baseFeeWei));
  }
  console.log('Balance (wei):', currentBalance.toString());
  console.log('Balance (POL):', toEthString(currentBalance));
  console.log('Safety buffer (POL):', toEthString(safetyBufferWei));
  console.log('Estimated deploy gas:', estimatedDeployGas.toString());
  console.log('Estimated init gas reserve:', initGasReserve.toString());
  console.log('Affordable gas price (gwei):', toGweiString(deployGasSelection.affordableGasPriceWei));
  console.log('Selected gas price (gwei):', toGweiString(deployGasSelection.selectedGasPriceWei));
  console.log('Gas selection reason:', deployGasSelection.reason);
  console.log('Estimated deploy tx cost (wei):', deployCostEstimate.toString());
  console.log('Estimated deploy tx cost (POL):', toEthString(deployCostEstimate));

  if (dryRun) {
    console.log('DEPLOY_DRY_RUN=1 set; skipping on-chain deployment.');
    return {
      name: contractName,
      address: null,
      txHash: null,
      dryRun: true,
      strategy: manualGasPriceWei ? 'manual' : strategy,
      selectedGasPriceWei: deployGasSelection.selectedGasPriceWei.toString()
    };
  }

  const contract = await factory.deploy(deployOverrides);
  const deployTx = contract.deploymentTransaction();
  const deployTxHash = deployTx ? deployTx.hash : null;
  console.log('Deploy tx:', deployTxHash || '<unknown>');
  await contract.waitForDeployment();

  // LifePassSBT is upgradeable and must be initialized after deploy.
  const initializeCallData = contract.interface.encodeFunctionData('initialize', [wallet.address]);
  const estimatedInitGas = await provider.estimateGas({
    from: wallet.address,
    to: contract.target,
    data: initializeCallData
  });
  const balanceBeforeInit = await provider.getBalance(wallet.address);
  const initFeeData = await provider.getFeeData();
  const initBlock = await provider.getBlock('latest');
  const initProviderGasPriceWei = initFeeData.gasPrice || initFeeData.maxFeePerGas;
  const initBaseFeeWei = initBlock && initBlock.baseFeePerGas ? initBlock.baseFeePerGas : null;

  const initGasSelection = selectAffordableGasPrice({
    label: 'initialize',
    strategy,
    manualGasPriceWei,
    suggestedGasPriceWei: initProviderGasPriceWei,
    baseFeeWei: initBaseFeeWei,
    minGasPriceWei,
    maxGasPriceWei,
    balanceWei: balanceBeforeInit,
    totalGasUnits: estimatedInitGas,
    safetyBufferWei
  });

  initOverrides.gasPrice = initGasSelection.selectedGasPriceWei;
  const initCostEstimate = estimatedInitGas * initGasSelection.selectedGasPriceWei;
  console.log('Estimated init gas:', estimatedInitGas.toString());
  console.log('Selected init gas price (gwei):', toGweiString(initGasSelection.selectedGasPriceWei));
  console.log('Init gas selection reason:', initGasSelection.reason);
  console.log('Estimated init tx cost (POL):', toEthString(initCostEstimate));

  const initTx = await contract.initialize(wallet.address, initOverrides);
  await initTx.wait();

  console.log('Deployed at', contract.target);
  return { name: contractName, address: contract.target, txHash: deployTxHash };
}

if (require.main === module) {
  deploy().then((r) => { console.log('Deploy result', r); process.exit(0); }).catch(err => { console.error('Deploy failed:', err); process.exit(1); });
}

module.exports = { deploy };
