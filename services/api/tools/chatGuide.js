const { queryEmbeddings } = require('./vectorStore');
const { getTrustScore } = require('./trustScoreStore');

function buildRecommendation(queryText) {
  const text = String(queryText || '').toLowerCase();
  if (text.includes('farm') || text.includes('agri')) return 'agri';
  if (text.includes('clinic') || text.includes('health')) return 'health';
  return 'commons';
}

async function buildModelReply({ userId, message, profile, trust, related, recommendedPortal }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const context = {
    userId,
    purpose: profile?.purpose || profile?.purposeStatement || null,
    trustLevel: trust?.level || null,
    trustScore: trust?.score || null,
    related: related.map((item) => ({
      id: item.id,
      score: item.score,
      text: item.text
    })),
    recommendedPortal
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      messages: [
        {
          role: 'system',
          content: 'You are the LifePass Purpose Guide. Give concise, practical guidance aligned to the user\'s purpose and current trust level. Suggest one next action and one portal recommendation.'
        },
        {
          role: 'user',
          content: JSON.stringify({ message, context })
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${errorText}`);
  }

  const payload = await response.json();
  const text = payload?.choices?.[0]?.message?.content;
  return text ? String(text).trim() : null;
}

async function respond({ userId, message, profile }) {
  const trust = await getTrustScore(userId);
  const related = await queryEmbeddings(message || '', 3);
  const recommendedPortal = buildRecommendation(message);
  let text = null;

  try {
    text = await buildModelReply({ userId, message, profile, trust, related, recommendedPortal });
  } catch (err) {
    console.warn('AI model reply failed; using fallback template:', err.message || err);
  }

  if (!text) {
    text = `Hi ${profile?.name || userId}, based on your purpose (${profile?.purpose || 'not set'}) and trust level (${trust.level}), I recommend starting in the ${recommendedPortal} portal.`;
  }

  return {
    text,
    recommendedPortal,
    trust,
    related,
    modelBacked: Boolean(process.env.OPENAI_API_KEY)
  };
}

module.exports = {
  respond
};
