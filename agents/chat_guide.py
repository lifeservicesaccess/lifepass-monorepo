"""LifePass onboarding chat guide agent.

This module is intentionally lightweight. It can be plugged into LangChain
later by replacing the `generate_reply` method internals.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List


@dataclass
class UserContext:
    user_id: str
    purpose: str
    skills: List[str]
    trust_score: int


class ChatGuideAgent:
    """Rule-based guide that can be replaced by LLM orchestration later."""

    def recommend_portal(self, question: str) -> str:
        q = (question or '').lower()
        if 'farm' in q or 'agri' in q:
            return 'agri'
        if 'clinic' in q or 'health' in q:
            return 'health'
        return 'commons'

    def generate_reply(self, question: str, ctx: UserContext) -> Dict[str, object]:
        portal = self.recommend_portal(question)
        level = 'Gold' if ctx.trust_score >= 80 else 'Silver' if ctx.trust_score >= 50 else 'Bronze'
        msg = (
            f"Hi {ctx.user_id}, based on your purpose '{ctx.purpose}' and trust level {level}, "
            f"start with the {portal} portal."
        )
        return {
            'message': msg,
            'portal': portal,
            'trust_score': ctx.trust_score,
            'skills': ctx.skills,
        }


def handle_chat(question: str, user_profile: Dict[str, object], trust_score: int) -> Dict[str, object]:
    agent = ChatGuideAgent()
    context = UserContext(
        user_id=str(user_profile.get('userId') or user_profile.get('id') or 'user'),
        purpose=str(user_profile.get('purpose') or 'general guidance'),
        skills=list(user_profile.get('skills') or []),
        trust_score=int(trust_score),
    )
    return agent.generate_reply(question, context)
