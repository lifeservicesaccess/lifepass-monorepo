const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

function loadApiEnv() {
  const cwd = process.cwd();
  const envLocalPath = path.join(cwd, '.env.local');
  const envPath = path.join(cwd, '.env');

  // Load base env first, then .env.local. Do not override existing process env values
  // so test/CI/runtime-injected vars (for example PORT, API_KEY) keep precedence.
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
  if (fs.existsSync(envLocalPath)) {
    dotenv.config({ path: envLocalPath });
  }
}

module.exports = { loadApiEnv };
