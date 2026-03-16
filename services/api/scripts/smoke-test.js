const http = require('http');
const { loadApiEnv } = require('../tools/loadEnv');

loadApiEnv();

const apiKey = process.env.API_KEY || '';

function post(path, data, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const options = {
      hostname: 'localhost',
      port: 3003,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...extraHeaders,
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    });

    req.on('error', (err) => reject(err));
    req.write(payload);
    req.end();
  });
}

(async () => {
  try {
    const tokenId = Math.floor(Date.now() / 1000);
    const birthYear = new Date().getFullYear() - 25;

    console.log('-> POST /proof/generate');
    let r = await post('/proof/generate', { birthYear });
    console.log(r.statusCode, r.body);

    if (r.statusCode !== 200) {
      throw new Error('proof generation failed');
    }

    const generated = JSON.parse(r.body || '{}');
    if (!generated.proof || !generated.publicSignals) {
      throw new Error('proof generation returned incomplete payload');
    }

    console.log('-> POST /proof/submit');
    r = await post('/proof/submit', {
      proof: generated.proof,
      publicSignals: generated.publicSignals,
    });
    console.log(r.statusCode, r.body);
    if (r.statusCode !== 200) {
      throw new Error('proof submit failed');
    }

    console.log('\n-> POST /sbt/mint');
    const mintHeaders = apiKey ? { 'x-api-key': apiKey } : {};
    r = await post('/sbt/mint', {
      to: '0x0000000000000000000000000000000000000001',
      tokenId,
      metadata: { purpose: 'Test', trustScore: 0, verificationLevel: 'Silver', didUri: '' },
    }, mintHeaders);
    console.log(r.statusCode, r.body);
  } catch (err) {
    console.error('Error during smoke test:', err.message || err);
    process.exit(1);
  }
})();
