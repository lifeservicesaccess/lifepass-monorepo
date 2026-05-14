function waitForChildExit(child, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    if (!child || child.exitCode !== null) {
      resolve();
      return;
    }

    const timeout = setTimeout(() => {
      reject(new Error('timeout waiting for child process exit'));
    }, timeoutMs);

    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function stopChildProcess(child, timeoutMs = 5000) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await waitForChildExit(child, timeoutMs);
}

module.exports = {
  stopChildProcess,
  waitForChildExit
};