const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

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

async function main() {
  const apiDir = path.resolve(__dirname, '..');
  const repoRoot = path.resolve(apiDir, '..', '..');
  const zkDir = path.join(repoRoot, 'zk');
  const buildDir = path.join(zkDir, 'build');
  const circuitPath = path.join(zkDir, 'over18.circom');

  const circomCmd =
    resolveNodeCli(apiDir, 'circom2', 'cli.js', 'local-node:circom2/cli.js')
    || resolveCommand(apiDir, ['circom2', 'circom'], ['circom2', 'circom']);

  const snarkjsCmd =
    resolveNodeCli(apiDir, 'snarkjs', 'cli.js', 'local-node:snarkjs/cli.js')
    || resolveCommand(apiDir, ['snarkjs'], ['snarkjs']);

  console.log(`Using circom command source: ${circomCmd.source}`);
  console.log(`Using snarkjs command source: ${snarkjsCmd.source}`);

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
    path.join(buildDir, 'pot14_0000.ptau'),
    path.join(buildDir, 'pot14_0001.ptau'),
    path.join(buildDir, 'pot14_final.ptau'),
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

  runCommand(
    snarkjsCmd,
    ['powersoftau', 'new', 'bn128', '14', path.join(buildDir, 'pot14_0000.ptau')],
    repoRoot,
    'Create initial PTAU'
  );

  runCommand(
    snarkjsCmd,
    [
      'powersoftau',
      'contribute',
      path.join(buildDir, 'pot14_0000.ptau'),
      path.join(buildDir, 'pot14_0001.ptau'),
      '--name=lifepass-local',
      '-e=lifepass-deterministic-ptau-seed-v1',
    ],
    repoRoot,
    'Contribute deterministic PTAU'
  );

  runCommand(
    snarkjsCmd,
    [
      'powersoftau',
      'prepare',
      'phase2',
      path.join(buildDir, 'pot14_0001.ptau'),
      path.join(buildDir, 'pot14_final.ptau'),
    ],
    repoRoot,
    'Prepare PTAU phase2'
  );

  runCommand(
    snarkjsCmd,
    [
      'groth16',
      'setup',
      path.join(zkDir, 'over18.r1cs'),
      path.join(buildDir, 'pot14_final.ptau'),
      path.join(zkDir, 'over18_0000.zkey'),
    ],
    repoRoot,
    'Groth16 setup'
  );

  runCommand(
    snarkjsCmd,
    [
      'zkey',
      'contribute',
      path.join(zkDir, 'over18_0000.zkey'),
      path.join(zkDir, 'over18.zkey'),
      '--name=lifepass-zkey',
      '-e=lifepass-deterministic-zkey-seed-v1',
    ],
    repoRoot,
    'Contribute deterministic zkey'
  );

  runCommand(
    snarkjsCmd,
    [
      'zkey',
      'export',
      'verificationkey',
      path.join(zkDir, 'over18.zkey'),
      path.join(zkDir, 'over18.vkey'),
    ],
    repoRoot,
    'Export verification key'
  );

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
