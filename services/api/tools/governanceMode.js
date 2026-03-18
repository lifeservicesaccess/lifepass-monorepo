function isProductionRuntime() {
  return process.env.NODE_ENV === 'production';
}

function isGovernanceFallbackExplicitlyAllowed() {
  return process.env.ALLOW_INSECURE_FILE_GOVERNANCE === '1';
}

function isDurableGovernanceRequired() {
  if (process.env.REQUIRE_DURABLE_GOVERNANCE === '1') return true;
  if (process.env.REQUIRE_DURABLE_GOVERNANCE === '0') return false;
  return isProductionRuntime() && !isGovernanceFallbackExplicitlyAllowed();
}

function describeGovernanceMode() {
  const production = isProductionRuntime();
  const durableRequired = isDurableGovernanceRequired();
  const explicitSetting = process.env.REQUIRE_DURABLE_GOVERNANCE;

  if (durableRequired) {
    if (explicitSetting === '1') {
      return 'REQUIRE_DURABLE_GOVERNANCE=1; Postgres-backed governance is mandatory';
    }
    if (production) {
      return 'production default; Postgres-backed governance is mandatory unless ALLOW_INSECURE_FILE_GOVERNANCE=1';
    }
  }

  if (explicitSetting === '0') {
    return production
      ? 'REQUIRE_DURABLE_GOVERNANCE=0; file fallback remains enabled even in production'
      : 'REQUIRE_DURABLE_GOVERNANCE=0; file fallback remains enabled';
  }

  if (production && isGovernanceFallbackExplicitlyAllowed()) {
    return 'ALLOW_INSECURE_FILE_GOVERNANCE=1; file fallback remains enabled in production';
  }

  return 'non-production default; file fallback remains enabled';
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
  describeGovernanceMode,
  isGovernanceFallbackExplicitlyAllowed,
  isDurableGovernanceRequired,
  isProductionRuntime,
  handleGovernanceFallback
};