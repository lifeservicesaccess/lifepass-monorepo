const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { readBinFile } = require('@iden3/binfileutils');
const { readR1csHeader } = require('r1csfile');

function fail(message, detail) {
  console.error(`SNARK build failed: ${message}`);
  if (detail) {
    console.error(detail);
  }
  process.exit(1);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function removeIfExists(targetPath) {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

function assertFileExists(filePath, label) {
  if (!fs.existsSync(filePath)) {
    fail(`${label} not found at ${filePath}`);
  }
  const st = fs.statSync(filePath);
  if (!st.isFile()) {
    fail(`${label} is not a file at ${filePath}`);
  }
}

function resolveBin(apiDir, baseName) {
  const ext = process.platform === 'win32' ? '.cmd' : '';
  return path.join(apiDir, 'node_modules', '.bin', `${baseName}${ext}`);
}

function resolveNodeCli(apiDir, packageName, cliFileName, sourceLabel) {
  const cliPath = path.join(apiDir, 'node_modules', packageName, cliFileName);
  if (!fs.existsSync(cliPath)) {
    return null;
  }

  return {
    command: process.execPath,
    shell: false,
    preArgs: [cliPath],
    source: sourceLabel,
  };
}

function quoteForCmd(value) {
  const str = String(value);
  if (str.length === 0) {
    return '""';
  }
  if (/\s|"/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function resolveCommand(apiDir, localBaseNames, fallbackNames) {
  for (const baseName of localBaseNames) {
    const localPath = resolveBin(apiDir, baseName);
    if (fs.existsSync(localPath)) {
      const ext = path.extname(localPath).toLowerCase();
      if (ext === '.cmd' || ext === '.bat') {
        return {
          command: 'cmd.exe',
          shell: false,
          preArgs: ['/d', '/s', '/c'],
          cmdWrapperPath: localPath,
          source: `local:${baseName}`,
        };
      }

      return { command: localPath, shell: false, preArgs: [], source: `local:${baseName}` };
    }
  }

  if (fallbackNames.length === 0) {
    fail('No executable candidates provided for command resolution');
  }

  return { command: fallbackNames[0], shell: true, preArgs: [], source: `path:${fallbackNames[0]}` };
}

function runCommand(commandSpec, args, cwd, stepName) {
  const fullArgs = commandSpec.cmdWrapperPath
    ? [
      ...(commandSpec.preArgs || []),
      [quoteForCmd(commandSpec.cmdWrapperPath), ...args.map(quoteForCmd)].join(' '),
    ]
    : [...(commandSpec.preArgs || []), ...args];

  const proc = spawnSync(commandSpec.command, fullArgs, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: commandSpec.shell,
  });

  if (proc.error) {
    fail(
      `${stepName}: process spawn error`,
      [
        `Command source: ${commandSpec.source}`,
        `Command: ${commandSpec.command} ${fullArgs.join(' ')}`,
        String(proc.error),
        'Install dependencies in services/api (`npm install`) and ensure CLI tools are available in PATH if using global binaries.'
      ].join('\n')
    );
  }

  if (proc.status !== 0) {
    fail(
      `${stepName}: command exited with code ${proc.status}`,
      [
        `Command source: ${commandSpec.source}`,
        `Command: ${commandSpec.command} ${fullArgs.join(' ')}`,
        proc.stdout ? `STDOUT:\n${proc.stdout.trim()}` : '',
        proc.stderr ? `STDERR:\n${proc.stderr.trim()}` : '',
      ].filter(Boolean).join('\n\n')
    );
  }
}

function toPosixRelative(fromDir, targetPath) {
  const rel = path.relative(fromDir, targetPath);
  return rel.split(path.sep).join('/');
}

async function readCompiledR1csHeader(r1csPath) {
  const { fd, sections } = await readBinFile(r1csPath, 'r1cs', 1, 1 << 22, 1 << 24);
  try {
    return await readR1csHeader(fd, sections, false);
  } finally {
    await fd.close();
  }
}

function computeMinimumPtauPower(r1csHeader) {
  const requiredDomainSize = r1csHeader.nConstraints + r1csHeader.nPubInputs + r1csHeader.nOutputs + 1;
  let power = 0;
  let domainSize = 1;

  while (domainSize < requiredDomainSize) {
    domainSize *= 2;
    power += 1;
  }

  // Keep a small floor so local builds remain stable even for trivial circuits.
  return Math.max(4, power);
}

function resolvePtauPower(minimumPtauPower) {
  const overrideRaw = process.env.SNARK_PTAU_POWER;
  if (!overrideRaw || String(overrideRaw).trim() === '') {
    return minimumPtauPower;
  }

  const parsed = Number.parseInt(String(overrideRaw).trim(), 10);
  if (!Number.isInteger(parsed) || parsed < minimumPtauPower) {
    fail(
      `SNARK_PTAU_POWER must be an integer >= ${minimumPtauPower}`,
      `Received: ${overrideRaw}`
    );
  }

  return parsed;
}

async function runCircomCompileDirect({ repoRoot, circuitPath, includePath, outputDir }) {
  let circom2;
  try {
    circom2 = require('circom2');
  } catch (err) {
    fail('Compile circuit with circom2: cannot load circom2 module', String(err));
  }

  const args = [
    toPosixRelative(repoRoot, circuitPath),
    '--r1cs',
    '--wasm',
    '--sym',
    '-l',
    toPosixRelative(repoRoot, includePath),
    '-o',
    toPosixRelative(repoRoot, outputDir),
  ];

  const preopens = {};
  let cwdCursor = repoRoot;
  while (true) {
    const seg = path.relative(repoRoot, cwdCursor) || '.';
    const segPosix = seg.split(path.sep).join('/');
    preopens[segPosix] = segPosix;
    const parent = path.dirname(cwdCursor);
    if (parent === cwdCursor) {
      break;
    }
    cwdCursor = parent;
  }

  const oldCwd = process.cwd();
  let runnerExitCode = null;
  let runnerSignal = null;
  try {
    process.chdir(repoRoot);
    const runner = new circom2.CircomRunner({
      args,
      env: process.env,
      preopens,
      bindings: {
        ...circom2.bindings,
        fs,
        exit(code) {
          runnerExitCode = Number(code) || 0;
          throw new Error(`CIRCOM_RUNNER_EXIT_${runnerExitCode}`);
        },
        kill(signal) {
          runnerSignal = String(signal || 'UNKNOWN');
          throw new Error(`CIRCOM_RUNNER_SIGNAL_${runnerSignal}`);
        },
      },
    });

    const wasmBytes = fs.readFileSync(require.resolve('circom2/circom.wasm'));
    await runner.execute(wasmBytes);
  } catch (err) {
    const message = err && err.message ? err.message : String(err);

    if (message === `CIRCOM_RUNNER_EXIT_${runnerExitCode}`) {
      if (runnerExitCode === 0) {
        return;
      }

      fail(
        `Compile circuit with circom2: direct runner exited with code ${runnerExitCode}`,
        [
          'Command source: local-node:circom2/direct-runner',
          `Args: ${args.join(' ')}`,
        ].join('\n')
      );
    }

    if (runnerSignal && message === `CIRCOM_RUNNER_SIGNAL_${runnerSignal}`) {
      fail(
        `Compile circuit with circom2: direct runner killed by signal ${runnerSignal}`,
        [
          'Command source: local-node:circom2/direct-runner',
          `Args: ${args.join(' ')}`,
        ].join('\n')
      );
    }

    fail(
      'Compile circuit with circom2: direct runner failed',
      [
        'Command source: local-node:circom2/direct-runner',
        `Args: ${args.join(' ')}`,
        err && err.stack ? err.stack : String(err),
      ].join('\n')
    );
  } finally {
    process.chdir(oldCwd);
  }
}

async function runSnarkjsDirect(stepName, action) {
  try {
    await action();
  } catch (err) {
    fail(stepName, err && err.stack ? err.stack : String(err));
  }
}

async function main() {
  const apiDir = path.resolve(__dirname, '..');
  const repoRoot = path.resolve(apiDir, '..', '..');
  const zkDir = path.join(repoRoot, 'zk');
  const buildDir = path.join(zkDir, 'build');
  const circuitPath = path.join(zkDir, 'over18.circom');
  const ptauPaths = {
    initial: path.join(buildDir, 'ptau_0000.ptau'),
    contributed: path.join(buildDir, 'ptau_0001.ptau'),
    final: path.join(buildDir, 'ptau_final.ptau'),
  };

  const circomCmd =
    resolveNodeCli(apiDir, 'circom2', 'cli.js', 'local-node:circom2/cli.js')
    || resolveCommand(apiDir, ['circom2', 'circom'], ['circom2', 'circom']);
  let snarkjs;
  try {
    snarkjs = require('snarkjs');
  } catch (err) {
    fail('Cannot load snarkjs module', String(err));
  }

  console.log(`Using circom command source: ${circomCmd.source}`);
  console.log('Using snarkjs command source: local-node:snarkjs/module-api');

  const requiredLibDir = path.join(apiDir, 'node_modules', 'circomlib');
  if (!fs.existsSync(requiredLibDir)) {
    fail(
      `Missing circomlib at ${requiredLibDir}`,
      'Run `npm install` in services/api first.'
    );
  }

  if (!fs.existsSync(circuitPath)) {
    fail(`Circuit file missing at ${circuitPath}`);
  }

  ensureDir(buildDir);

  const compiledWasmFromCircom = path.join(zkDir, 'over18_js', 'over18.wasm');
  const canonicalWasmPath = path.join(zkDir, 'over18.wasm');

  const generatedTargets = [
    path.join(zkDir, 'over18.r1cs'),
    path.join(zkDir, 'over18.sym'),
    path.join(zkDir, 'over18_0000.zkey'),
    path.join(zkDir, 'over18.zkey'),
    path.join(zkDir, 'over18.vkey'),
    path.join(zkDir, 'over18_js'),
    ptauPaths.initial,
    ptauPaths.contributed,
    ptauPaths.final,
  ];

  generatedTargets.forEach(removeIfExists);

  if (circomCmd.source.startsWith('local-node:circom2')) {
    console.log('Using direct circom2 runner path for compile step.');
    await runCircomCompileDirect({
      repoRoot,
      circuitPath,
      includePath: path.join(apiDir, 'node_modules'),
      outputDir: zkDir,
    });
  } else {
    runCommand(
      circomCmd,
      [
        circuitPath,
        '--r1cs',
        '--wasm',
        '--sym',
        '-l',
        path.join(apiDir, 'node_modules'),
        '-o',
        zkDir,
      ],
      repoRoot,
      'Compile circuit with circom2'
    );
  }

  assertFileExists(path.join(zkDir, 'over18.r1cs'), 'Compiled R1CS');
  const resolvedCompiledWasmPath = fs.existsSync(compiledWasmFromCircom)
    ? compiledWasmFromCircom
    : canonicalWasmPath;
  assertFileExists(resolvedCompiledWasmPath, 'Compiled WASM');
  assertFileExists(path.join(zkDir, 'over18.sym'), 'Compiled SYM');

  // circom emits wasm under over18_js; keep a stable root-level wasm path for API env usage.
  if (resolvedCompiledWasmPath !== canonicalWasmPath) {
    fs.copyFileSync(resolvedCompiledWasmPath, canonicalWasmPath);
  }
  assertFileExists(canonicalWasmPath, 'Canonical WASM');

  const r1csHeader = await readCompiledR1csHeader(path.join(zkDir, 'over18.r1cs'));
  const minimumPtauPower = computeMinimumPtauPower(r1csHeader);
  const ptauPower = resolvePtauPower(minimumPtauPower);

  console.log(
    `Using PTAU power ${ptauPower} (minimum required ${minimumPtauPower}) for ${r1csHeader.nConstraints} constraints.`
  );

  const bn128 = await snarkjs.curves.getCurveFromName('bn128');
  try {
    await runSnarkjsDirect('Create initial PTAU', async () => {
      await snarkjs.powersOfTau.newAccumulator(
        bn128,
        ptauPower,
        ptauPaths.initial,
        console
      );
    });

    await runSnarkjsDirect('Contribute deterministic PTAU', async () => {
      await snarkjs.powersOfTau.contribute(
        ptauPaths.initial,
        ptauPaths.contributed,
        'lifepass-local',
        'lifepass-deterministic-ptau-seed-v1',
        console
      );
    });

    await runSnarkjsDirect('Prepare PTAU phase2', async () => {
      await snarkjs.powersOfTau.preparePhase2(
        ptauPaths.contributed,
        ptauPaths.final,
        console
      );
    });

    await runSnarkjsDirect('Groth16 setup', async () => {
      await snarkjs.zKey.newZKey(
        path.join(zkDir, 'over18.r1cs'),
        ptauPaths.final,
        path.join(zkDir, 'over18_0000.zkey'),
        console
      );
    });

    await runSnarkjsDirect('Contribute deterministic zkey', async () => {
      await snarkjs.zKey.contribute(
        path.join(zkDir, 'over18_0000.zkey'),
        path.join(zkDir, 'over18.zkey'),
        'lifepass-zkey',
        'lifepass-deterministic-zkey-seed-v1',
        console
      );
    });

    await runSnarkjsDirect('Export verification key', async () => {
      const verificationKey = await snarkjs.zKey.exportVerificationKey(
        path.join(zkDir, 'over18.zkey'),
        console
      );
      fs.writeFileSync(path.join(zkDir, 'over18.vkey'), `${JSON.stringify(verificationKey, null, 2)}\n`);
    });
  } finally {
    if (bn128 && typeof bn128.terminate === 'function') {
      await bn128.terminate();
    }
  }

  assertFileExists(path.join(zkDir, 'over18.zkey'), 'Final zkey');
  assertFileExists(path.join(zkDir, 'over18.vkey'), 'Verification key');

  console.log('SNARK artifact build complete.');
  console.log(`WASM: ${canonicalWasmPath}`);
  console.log(`ZKEY: ${path.join(zkDir, 'over18.zkey')}`);
  console.log(`VKEY: ${path.join(zkDir, 'over18.vkey')}`);
}

main().catch((err) => {
  fail('Unexpected failure in SNARK build script', err && err.stack ? err.stack : String(err));
});
