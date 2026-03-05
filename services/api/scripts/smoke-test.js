const http = require('http');

function post(path, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
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
    console.log('-> POST /proof/submit');
    let r = await post('/proof/submit', { publicSignals: { is_over_18: 1 } });
    console.log(r.statusCode, r.body);

    console.log('\n-> POST /sbt/mint');
    r = await post('/sbt/mint', {
      to: '0x0000000000000000000000000000000000000001',
      tokenId: 1,
      metadata: { purpose: 'Test', trustScore: 0, verificationLevel: 'Silver', didUri: '' },
    });
    console.log(r.statusCode, r.body);
  } catch (err) {
    console.error('Error during smoke test:', err.message || err);
    process.exit(1);
  }
})();
