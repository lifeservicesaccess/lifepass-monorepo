const http = require('http');

const payload = JSON.stringify({ publicSignals: { is_over_18: 1 }, proof: '0x1234' });
const options = {
  hostname: 'localhost',
  port: 3003,
  path: '/proof/verify-onchain',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => (body += chunk));
  res.on('end', () => {
    console.log('status', res.statusCode, body);
  });
});

req.on('error', (err) => console.error('err', err));
req.write(payload);
req.end();
