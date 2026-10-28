"""
System 1 Gatekeeper Engine — TypeSafe Jev (Zero LLM, Fast Semantic Routing).

Intercepts voice utterances transcribed from Gnani Prisma ASR and determines
sub-50ms routing decisions:
- PAUSE_TUTOR: If student interrupts while AI tutor is currently speaking.
- TRIGGER_GEMINI: If student summons the tutor or asks for help, mistake checks, hints, or plots.
- IGNORE: If student is muttering calculations, thinking aloud, or talking to themselves.
"""

from __future__ import annotations

import asyncio
import inspect
import logging
import os
import re
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from pydantic import BaseModel, Field

load_dotenv()
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# SDK Import & Defensive Fallback Hierarchy
# ---------------------------------------------------------------------------

try:
    from typesafe_sdk import Choice as SDKChoice
    from typesafe_sdk import Noul as SDKNoul
    from typesafe_sdk import TypeSafeClient as SDKTypeSafeClient

    SDK_AVAILABLE = True
except Exception:
    SDKChoice = None
    SDKNoul = None
    SDKTypeSafeClient = None
    SDK_AVAILABLE = False


class NoulResult:
    """Wrapper for Noul probability score."""

    def __init__(self, noul: float):
        self.noul = float(noul)

    def __repr__(self) -> str:
        return f"NoulResult(noul={self.noul:.3f})"


class ChoiceResult:
    """Wrapper for categorical Choice output."""

    def __init__(self, choice: str):
        self.choice = str(choice)

    def __repr__(self) -> str:
        return f"ChoiceResult(choice={self.choice!r})"


class SystemOneResponse:
    """Standardized response structure matching TypeSafe Jev output schema."""

    def __init__(self, answers: Dict[str, Any]):
        self.answers = answers

    def __repr__(self) -> str:
        return f"SystemOneResponse(answers={self.answers})"


class FallbackNoul:
    """Defensive mock for Noul typed question."""

    def __init__(self, prompt: str = "", *args, **kwargs):
        self.prompt = prompt
        self.kwargs = kwargs

    def __repr__(self) -> str:
        return f"FallbackNoul({self.prompt[:40]!r}...)"


class FallbackChoice:
    """Defensive mock for Choice typed question."""

    def __init__(self, criteria: Any = None, options: Any = None, *args, **kwargs):
        self.criteria = criteria if criteria is not None else (options or {})
        self.kwargs = kwargs

    def __repr__(self) -> str:
        return f"FallbackChoice(options={list(self.criteria.keys()) if isinstance(self.criteria, dict) else self.criteria})"


# Use real SDK classes if present; otherwise use fallback definitions
Noul = SDKNoul if SDK_AVAILABLE and SDKNoul is not None else FallbackNoul
Choice = SDKChoice if SDK_AVAILABLE and SDKChoice is not None else FallbackChoice
TypeSafeClient = (
    SDKTypeSafeClient if SDK_AVAILABLE and SDKTypeSafeClient is not None else None
)


# ---------------------------------------------------------------------------
# Decision Schema
# ---------------------------------------------------------------------------


class GatekeeperDecision(BaseModel):
    """
    Sub-50ms routing decision emitted by TypeSafe Jev System 1 Gatekeeper.
    """

    action: str = Field(
        ...,
        description="Routing action: 'PAUSE_TUTOR', 'TRIGGER_GEMINI', or 'IGNORE'",
    )
    mode: Optional[str] = Field(
        default=None,
        description="Requested math mode: 'step_by_step', 'check_mistake', 'give_hint', 'plot_graph', or None",
    )
    confidence: float = Field(
        ...,
        description="Confidence score between 0.0 and 1.0",
    )
    reason: str = Field(
        ...,
        description="Deterministic explanation of why this action was selected",
    )
    engine: str = Field(
        default="typesafe-jev",
        description="Active engine used for this decision ('typesafe-jev' or 'rule-based-fallback')",
    )
    raw_scores: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Raw output scores from the system_one call",
    )


# ---------------------------------------------------------------------------
# Rule-Based Semantic Heuristics (Offline / Local Dev Fallback)
# ---------------------------------------------------------------------------

_INTERRUPTION_PATTERNS = re.compile(
    r"\b(wait|wait\s+wait|hold\s+on|hold\s+up|pause|stop|shut\s+up|quiet|"
    r"hang\s+on|one\s+second|give\s+me\s+a\s+sec(ond)?|slow\s+down|too\s+fast|"
    r"repeat\s+that|what\s+did\s+you\s+(just\s+)?say|back\s+up)\b",
    re.IGNORECASE,
)

_CALLING_TUTOR_KEYWORDS = re.compile(
    r"\b(claire|tutor|help|can\s+you|could\s+you|please|how\s+do|how\s+to|"
    r"what\s+is|what\s+do|why\s+did|where\s+did|explain|show\s+me|"
    r"stuck|confused|don\'?t\s+understand|don\'?t\s+get|is\s+this|am\s+i|"
    r"did\s+i|mistake|wrong|correct|right|hint|clue|graph|plot)\b",
    re.IGNORECASE,
)

_CALCULATION_MUTTERING_PATTERNS = re.compile(
    r"^(\s*(\d+|plus|minus|times|divided\s+by|equals|carry|over|zero|one|two|three|"
    r"four|five|six|seven|eight|nine|ten|x|y|squared|cubed|\+|-|\*|/|=|\^|\.)\s*)+$",
    re.IGNORECASE,
)

_MODE_GRAPH_PATTERNS = re.compile(
    r"\b(graph|plot|visualize|draw|curve|parabola|sketch|axis|axes)\b",
    re.IGNORECASE,
)

_MODE_MISTAKE_PATTERNS = re.compile(
    r"\b(mistake|error|wrong|correct|is\s+this\s+right|did\s+i\s+mess\s+up|"
    r"check\s+my|check\s+this|where\s+did\s+i\s+go\s+wrong|did\s+i\s+get\s+it)\b",
    re.IGNORECASE,
)

_MODE_HINT_PATTERNS = re.compile(
    r"\b(hint|clue|nudge|tip|pointer|nudge\s+me|small\s+hint|stuck)\b",
    re.IGNORECASE,
)


def _rule_based_system_one(
    state: Dict[str, Any], questions: Dict[str, Any]
) -> SystemOneResponse:
    """
    Deterministic rule-based fallback when TYPESAFE_API_KEY is not set
    or typesafe_sdk library is not installed.
    """
    utterance = str(state.get("utterance", "")).strip()
    is_student_writing = bool(state.get("is_student_writing", False))
    is_tutor_currently_explaining = bool(
        state.get("is_tutor_currently_explaining", False)
    )

    clean_text = utterance.lower()

    # 1. Evaluate is_interrupting_tutor
    is_interrupting = False
    interrupt_score = 0.05
    if is_tutor_currently_explaining:
        if _INTERRUPTION_PATTERNS.search(clean_text):
            interrupt_score = 0.94
            is_interrupting = True
        elif len(clean_text.split()) <= 4 and any(
            w in clean_text for w in ["wait", "stop", "hold", "what", "no"]
        ):
            interrupt_score = 0.85
            is_interrupting = True
        else:
            interrupt_score = 0.20
    else:
        interrupt_score = 0.02

    # 2. Evaluate is_calling_tutor
    calling_score = 0.10
    if not utterance:
        calling_score = 0.00
    elif _CALCULATION_MUTTERING_PATTERNS.match(clean_text):
        # Pure calculation numbers or arithmetic muttering
        calling_score = 0.08 if is_student_writing else 0.18
    elif _INTERRUPTION_PATTERNS.search(clean_text) and is_tutor_currently_explaining:
        # Interruption is handled as tutor summon / pause
        calling_score = 0.88
    elif _CALLING_TUTOR_KEYWORDS.search(clean_text) or "?" in utterance:
        # Clear question or summon keyword
        calling_score = 0.92
        # Slight dampening if student is actively writing simple arithmetic
        if is_student_writing and len(clean_text.split()) < 3 and not ("claire" in clean_text or "help" in clean_text):
            calling_score = 0.45
    else:
        # Ambiguous utterance: check length and structure
        words = clean_text.split()
        if len(words) >= 5 and any(w in clean_text for w in ["how", "what", "why", "can", "if"]):
            calling_score = 0.78
        else:
            calling_score = 0.25

    # 3. Evaluate requested_mode
    if _MODE_GRAPH_PATTERNS.search(clean_text):
        selected_mode = "plot_graph"
    elif _MODE_MISTAKE_PATTERNS.search(clean_text):
        selected_mode = "check_mistake"
    elif _MODE_HINT_PATTERNS.search(clean_text):
        selected_mode = "give_hint"
    else:
        selected_mode = "step_by_step"

    answers = {
        "is_calling_tutor": NoulResult(noul=round(calling_score, 3)),
        "is_interrupting_tutor": NoulResult(noul=round(interrupt_score, 3)),
        "requested_mode": ChoiceResult(choice=selected_mode),
    }

    return SystemOneResponse(answers=answers)


# ---------------------------------------------------------------------------
# Client Singleton Manager
# ---------------------------------------------------------------------------

_client_instance: Optional[Any] = None


def get_typesafe_client() -> Optional[Any]:
    """
    Initializes or returns cached TypeSafeClient if TYPESAFE_API_KEY is present
    and typesafe-sdk is installed.
    """
    global _client_instance
    api_key = os.getenv("TYPESAFE_API_KEY", "").strip()
    if not api_key:
        return None

    if _client_instance is None and SDK_AVAILABLE and TypeSafeClient is not None:
        try:
            _client_instance = TypeSafeClient(api_key=api_key)
            logger.info("Initialized TypeSafeClient for Jev System 1 Gatekeeper.")
        except Exception as exc:
            logger.warning(
                "Failed to initialize TypeSafeClient despite TYPESAFE_API_KEY present: %s",
                exc,
            )
            _client_instance = None

    return _client_instance


def _build_questions() -> Dict[str, Any]:
    """
    Constructs the three parallel questions for TypeSafe Jev System 1:
    - is_calling_tutor
    - is_interrupting_tutor
    - requested_mode
    """
    # 1. is_calling_tutor (Noul)
    try:
        q_calling = Noul(
            prompt=(
                "The student is asking a question, expressing confusion, or asking for help (true) "
                "vs. muttering numbers aloud while calculating or reading the question to themselves (false)."
            )
        )
    except TypeError:
        q_calling = Noul(
            "The student is asking a question, expressing confusion, or asking for help (true) "
            "vs. muttering numbers aloud while calculating or reading the question to themselves (false)."
        )

    # 2. is_interrupting_tutor (Noul)
    try:
        q_interrupt = Noul(
            prompt=(
                "The student is telling the tutor to wait, stop, or explain the current step "
                "while is_tutor_currently_explaining is true."
            )
        )
    except TypeError:
        q_interrupt = Noul(
            "The student is telling the tutor to wait, stop, or explain the current step "
            "while is_tutor_currently_explaining is true."
        )

    # 3. requested_mode (Choice)
    criteria_dict = {
        "step_by_step": "Student asks to solve, break down, or show next step",
        "check_mistake": "Student asks if they made an error, got it right, or where they went wrong",
        "give_hint": "Student asks for a clue, hint, or nudge",
        "plot_graph": "Student asks to visualize, plot, or graph the equation",
    }
    try:
        q_mode = Choice(criteria=criteria_dict)
    except TypeError:
        try:
            q_mode = Choice(options=criteria_dict)
        except TypeError:
            q_mode = Choice(criteria_dict)

    return {
        "is_calling_tutor": q_calling,
        "is_interrupting_tutor": q_interrupt,
        "requested_mode": q_mode,
    }


# ---------------------------------------------------------------------------
# Public Gatekeeper Evaluation API
# ---------------------------------------------------------------------------


async def evaluate_utterance(
    transcript: str,
    is_pen_moving: bool = False,
    is_ai_speaking: bool = False,
) -> GatekeeperDecision:
    """
    Evaluates a transcribed utterance using TypeSafe Jev System 1 (with rule-based fallback).

    Parameters:
    - transcript: String transcription from Gnani Prisma ASR.
    - is_pen_moving: True if student's stylus/finger is actively stroking the notebook canvas.
    - is_ai_speaking: True if the TTS or AI tutor explanation is actively playing.

    Returns:
    - GatekeeperDecision with action ('PAUSE_TUTOR' | 'TRIGGER_GEMINI' | 'IGNORE'),
      confidence, mode, and reason.
    """
    clean_transcript = (transcript or "").strip()

    # Fast short-circuit on empty voice segments
    if not clean_transcript:
        return GatekeeperDecision(
            action="IGNORE",
            mode=None,
            confidence=1.0,
            reason="Student is thinking aloud or muttering calculations",
            engine="fast-rule",
            raw_scores={"empty": True},
        )

    state = {
        "utterance": clean_transcript,
        "is_student_writing": bool(is_pen_moving),
        "is_tutor_currently_explaining": bool(is_ai_speaking),
    }

    questions = _build_questions()

    client = get_typesafe_client()
    response: Optional[Any] = None
    engine_used = "typesafe-jev"

    if client is not None:
        try:
            if hasattr(client, "system_one"):
                res_candidate = client.system_one(state=state, questions=questions)
                if inspect.isawaitable(res_candidate):
                    response = await res_candidate
                else:
                    response = res_candidate
            elif hasattr(client, "asystem_one"):
                response = await client.asystem_one(state=state, questions=questions)
        except Exception as exc:
            logger.warning(
                "TypeSafe client.system_one raised an exception; falling back to rule engine: %s",
                exc,
            )
            response = None

    if response is None or not hasattr(response, "answers"):
        response = _rule_based_system_one(state=state, questions=questions)
        engine_used = "rule-based-fallback"

    answers = response.answers

    # Extract score representations safely
    interrupt_ans = answers.get("is_interrupting_tutor")
    calling_ans = answers.get("is_calling_tutor")
    mode_ans = answers.get("requested_mode")

    interrupt_noul = (
        float(getattr(interrupt_ans, "noul", 0.0))
        if interrupt_ans is not None
        else 0.0
    )
    calling_noul = (
        float(getattr(calling_ans, "noul", 0.0))
        if calling_ans is not None
        else 0.0
    )
    selected_mode = (
        str(getattr(mode_ans, "choice", "step_by_step"))
        if mode_ans is not None
        else "step_by_step"
    )

    raw_scores = {
        "is_interrupting_tutor": interrupt_noul,
        "is_calling_tutor": calling_noul,
        "requested_mode": selected_mode,
    }

    # -----------------------------------------------------------------------
    # Routing Policy (Strictly Enforced)
    # -----------------------------------------------------------------------
    # 1. If tutor is speaking and interruption score >= 0.70
    if is_ai_speaking and interrupt_noul >= 0.70:
        return GatekeeperDecision(
            action="PAUSE_TUTOR",
            mode=None,
            confidence=round(interrupt_noul, 3),
            reason="Student interrupted active explanation",
            engine=engine_used,
            raw_scores=raw_scores,
        )

    # 2. Else if student is calling the tutor with score >= 0.75
    elif calling_noul >= 0.75:
        return GatekeeperDecision(
            action="TRIGGER_GEMINI",
            mode=selected_mode,
            confidence=round(calling_noul, 3),
            reason="Student summoned tutor",
            engine=engine_used,
            raw_scores=raw_scores,
        )

    # 3. Else (noul < 0.75): ignore muttering / internal thoughts
    else:
        ignore_confidence = round(max(1.0 - calling_noul, 0.75), 3)
        return GatekeeperDecision(
            action="IGNORE",
            mode=None,
            confidence=ignore_confidence,
            reason="Student is thinking aloud or muttering calculations",
            engine=engine_used,
            raw_scores=raw_scores,
        )
