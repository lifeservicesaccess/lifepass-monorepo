const QRCode = require('qrcode');

async function buildPassPayload(userId, trust) {
  const trustLevel = trust && trust.level ? trust.level : 'Bronze';
  const trustScore = trust && typeof trust.score === 'number' ? trust.score : 0;

  return {
    type: 'LIFEPASS_QR_V1',
    lifePassId: userId,
    trustLevel,
    trustScore,
    issuedAt: new Date().toISOString()
  };
}

async function buildQrCodeDataUrl(payload) {
  const text = JSON.stringify(payload);
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320
  });
}

module.exports = {
  buildPassPayload,
  buildQrCodeDataUrl
};
