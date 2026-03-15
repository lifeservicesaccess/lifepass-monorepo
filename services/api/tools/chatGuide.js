const { queryEmbeddings } = require('./vectorStore');
const { getTrustScore } = require('./trustScoreStore');
const milestoneStore = require('./milestoneStore');

function buildRecommendation(queryText) {
  const text = String(queryText || '').toLowerCase();
  if (text.includes('farm') || text.includes('agri')) return 'agri';
  if (text.includes('clinic') || text.includes('health')) return 'health';
  return 'commons';
}

function buildKairosSignals(trust, milestones) {
  const now = Date.now();
  const signals = [];
  const dueSoon = (milestones || []).filter((milestone) => {
    if (!milestone?.dueAt || milestone.status === 'completed') return false;
    const dueTime = Date.parse(milestone.dueAt);
    if (!Number.isFinite(dueTime)) return false;
    return dueTime >= now && dueTime - now <= (7 * 24 * 60 * 60 * 1000);
  });

  if (String(trust?.level || '').toLowerCase() === 'bronze') {
    signals.push('Bronze trust is active: complete endorsements or document checks to unlock more portals.');
  }

  if (dueSoon.length > 0) {
    signals.push(`You have ${dueSoon.length} milestone${dueSoon.length === 1 ? '' : 's'} due within the next 7 days.`);
  }

  const inProgress = (milestones || []).filter((milestone) => milestone.status === 'in_progress').length;
  if (inProgress > 0) {
    signals.push(`There ${inProgress === 1 ? 'is' : 'are'} ${inProgress} milestone${inProgress === 1 ? '' : 's'} already in progress; finish one to build visible momentum.`);
  }

  return signals;
}

function buildChannelLinks(userId, recommendedPortal, purpose) {
  const seedText = `LifePass guide for ${userId}: focus on ${purpose || 'your next purpose step'} and start in ${recommendedPortal}.`;
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(seedText)}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent('https://lifepass.app')}&text=${encodeURIComponent(seedText)}`
  };
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
  const milestones = await milestoneStore.listMilestones(userId);
  const milestoneSummary = milestoneStore.computeSummary(milestones);
  const recommendedPortal = buildRecommendation(message);
  const kairosSignals = buildKairosSignals(trust, milestones);
  const nextMilestone = milestones.find((milestone) => milestone.status !== 'completed') || null;
  const channels = buildChannelLinks(userId, recommendedPortal, profile?.purpose || profile?.purposeStatement);
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
    milestoneSummary,
    nextMilestone,
    kairosSignals,
    channels,
    modelBacked: Boolean(process.env.OPENAI_API_KEY)
  };
}

module.exports = {
  respond
};
