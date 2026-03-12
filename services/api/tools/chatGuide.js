const { queryEmbeddings } = require('./vectorStore');
const { getTrustScore } = require('./trustScoreStore');

function buildRecommendation(queryText) {
  const text = String(queryText || '').toLowerCase();
  if (text.includes('farm') || text.includes('agri')) return 'agri';
  if (text.includes('clinic') || text.includes('health')) return 'health';
  return 'commons';
}

async function respond({ userId, message, profile }) {
  const trust = await getTrustScore(userId);
  const related = await queryEmbeddings(message || '', 3);
  const recommendedPortal = buildRecommendation(message);

  // Stubbed AI response template; replace with model call when OPENAI_API_KEY is configured.
  return {
    text: `Hi ${profile?.name || userId}, based on your purpose (${profile?.purpose || 'not set'}) and trust level (${trust.level}), I recommend starting in the ${recommendedPortal} portal.`,
    recommendedPortal,
    trust,
    related
  };
}

module.exports = {
  respond
};
