function isDurableGovernanceRequired() {
  return process.env.REQUIRE_DURABLE_GOVERNANCE === '1';
}

function handleGovernanceFallback(storeLabel, err) {
  const message = err && err.message ? err.message : String(err || 'Unknown error');
  if (isDurableGovernanceRequired()) {
    const enforced = new Error(`${storeLabel} requires Postgres-backed durable storage when REQUIRE_DURABLE_GOVERNANCE=1: ${message}`);
    enforced.cause = err;
    throw enforced;
  }
  console.warn(`${storeLabel}; falling back to file DB:`, message);
}

module.exports = {
  isDurableGovernanceRequired,
  handleGovernanceFallback
};