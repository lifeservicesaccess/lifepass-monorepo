const crypto = require('crypto');

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return '';
  return String(process.argv[index + 1] || '').trim();
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const proposalId = readArg('--proposal-id');
const action = readArg('--action');
const payloadHash = readArg('--payload-hash');
const secret = readArg('--secret');
const json = readArg('--json');

if (!proposalId || !action || !payloadHash || !secret) {
  fail([
    'Usage: npm run sign:approval -- --proposal-id <id> --action <action> --payload-hash <hash> --secret <shared-secret>',
    'Example: npm run sign:approval -- --proposal-id proposal-123 --action policy_matrix_update --payload-hash abc123 --secret approver-secret'
  ].join('\n'));
}

const message = `${proposalId}:${action}:${payloadHash}`;
const signature = crypto.createHmac('sha256', secret).update(message).digest('hex');

if (json === '1' || json.toLowerCase() === 'true') {
  process.stdout.write(`${JSON.stringify({ proposalId, action, payloadHash, message, signature }, null, 2)}\n`);
} else {
  process.stdout.write(`${signature}\n`);
}