const QRCode = require('qrcode');

function normalizeVisibility(visibility) {
  const source = visibility && typeof visibility === 'object' ? visibility : {};
  return {
    legalName: Boolean(source.legalName),
    covenantName: source.covenantName !== false,
    purposeStatement: source.purposeStatement !== false,
    skills: Boolean(source.skills),
    callings: Boolean(source.callings),
    trustLevel: source.trustLevel !== false,
    trustScore: Boolean(source.trustScore),
    milestones: source.milestones !== false,
    biometricPhoto: Boolean(source.biometricPhoto)
  };
}

function buildPublicProfile(profile, visibility) {
  const out = {};

  if (visibility.legalName) {
    const legalName = String(profile?.legalName || profile?.name || '').trim();
    if (legalName) out.legalName = legalName;
  }

  if (visibility.covenantName) {
    const covenantName = String(profile?.preferredCovenantName || profile?.covenantName || '').trim();
    if (covenantName) out.covenantName = covenantName;
  }

  if (visibility.purposeStatement) {
    const purposeStatement = String(profile?.purposeStatement || profile?.purpose || '').trim();
    if (purposeStatement) out.purposeStatement = purposeStatement;
  }

  if (visibility.skills && Array.isArray(profile?.skills) && profile.skills.length) {
    out.skills = profile.skills;
  }

  if (visibility.callings && Array.isArray(profile?.callings) && profile.callings.length) {
    out.callings = profile.callings;
  }

  if (visibility.biometricPhoto && profile?.biometricPhotoUrl) {
    out.biometricPhotoUrl = profile.biometricPhotoUrl;
  }

  return out;
}

function buildNfcPayload(payload) {
  const compact = {
    type: 'LIFEPASS_NFC_V1',
    lifePassId: payload.lifePassId,
    trustLevel: payload.trustLevel || null,
    trustScore: typeof payload.trustScore === 'number' ? payload.trustScore : null,
    issuedAt: payload.issuedAt,
    publicProfile: payload.publicProfile || {}
  };

  return {
    format: 'ndef-text',
    mediaType: 'application/vnd.lifepass.pass+json',
    text: JSON.stringify(compact)
  };
}

async function buildPassPayload(userId, trust, profile = null) {
  const trustLevel = trust && trust.level ? trust.level : 'Bronze';
  const trustScore = trust && typeof trust.score === 'number' ? trust.score : 0;
  const visibility = normalizeVisibility(profile?.visibility);
  const publicProfile = buildPublicProfile(profile || {}, visibility);

  const payload = {
    type: 'LIFEPASS_QR_V2',
    lifePassId: userId,
    issuedAt: new Date().toISOString(),
    publicProfile,
    visibility
  };

  if (visibility.trustLevel) {
    payload.trustLevel = trustLevel;
  }

  if (visibility.trustScore) {
    payload.trustScore = trustScore;
  }

  return payload;
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
  buildNfcPayload,
  buildQrCodeDataUrl
};
