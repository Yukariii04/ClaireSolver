"""
System 1 Gatekeeper Engine — Laya (Zero LLM, Fast Semantic Routing).

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
    """Standardized response structure matching Laya output schema."""

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
    Sub-50ms routing decision emitted by Laya System 1 Gatekeeper.
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
        default="laya",
        description="Active engine used for this decision ('laya' or 'rule-based-fallback')",
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
    r"\b(claire|hey\s+claire|help|how\s+do\s+i|can\s+you|explain|why|"
    r"what\s+is|show\s+me|check|is\s+this\s+right|am\s+i\s+right|"
    r"hint|stuck|don'?t\s+understand|plot|graph|solve|confused|"
    r"madad|batao|samajh|kaise|karo|dikhao)\b",
    re.IGNORECASE,
)

_MUTTERING_PATTERNS = re.compile(
    r"^(\s*(\d+(\.\d+)?|[+\-*/^=xyz]|plus|minus|times|equals|carry|square|root|then|so|okay|hm+)\s*)+$",
    re.IGNORECASE,
)

_MODE_HINT_PATTERNS = re.compile(
    r"\b(hint|clue|nudge|guide|where\s+to\s+start|direction|ishara)\b",
    re.IGNORECASE,
)

_MODE_CHECK_PATTERNS = re.compile(
    r"\b(check|mistake|error|did\s+i|is\s+this\s+(right|correct|wrong)|wrong|sahi\s+hai|galti)\b",
    re.IGNORECASE,
)

_MODE_PLOT_PATTERNS = re.compile(
    r"\b(plot|graph|draw\s+function|visualize|curve|chart|chitra)\b",
    re.IGNORECASE,
)


def _rule_based_system_one(state: Dict[str, Any], questions: Dict[str, Any]) -> SystemOneResponse:
    """
    Zero-latency heuristic evaluator that matches Laya's semantic classification.
    Used when running offline or when Laya is in local mock mode.
    """
    utterance = str(state.get("utterance", "")).strip().lower()
    is_ai_speaking = bool(state.get("is_tutor_currently_explaining", False))

    if not utterance:
        return SystemOneResponse(
            answers={
                "is_interrupting_tutor": NoulResult(0.0),
                "is_calling_tutor": NoulResult(0.0),
                "requested_mode": ChoiceResult("step_by_step"),
            }
        )

    # 1. Evaluate interruption
    is_interruption = False
    interrupt_score = 0.05
    if is_ai_speaking:
        if _INTERRUPTION_PATTERNS.search(utterance):
            is_interruption = True
            interrupt_score = 0.95
        elif len(utterance.split()) <= 4 and any(
            w in utterance for w in ["no", "wait", "what", "stop", "hold"]
        ):
            is_interruption = True
            interrupt_score = 0.85

    # 2. Evaluate calling tutor vs muttering
    calling_score = 0.10
    if not is_interruption:
        if _MUTTERING_PATTERNS.match(utterance):
            calling_score = 0.15
        elif _CALLING_TUTOR_KEYWORDS.search(utterance):
            calling_score = 0.92
        elif "?" in utterance or utterance.startswith(
            ("why", "how", "what", "can", "is", "where")
        ):
            calling_score = 0.85
        elif len(utterance.split()) >= 3 and not _MUTTERING_PATTERNS.match(utterance):
            calling_score = 0.45
        else:
            calling_score = 0.20

    # 3. Evaluate requested mode
    selected_mode = "step_by_step"
    if _MODE_PLOT_PATTERNS.search(utterance):
        selected_mode = "plot_graph"
    elif _MODE_CHECK_PATTERNS.search(utterance):
        selected_mode = "check_mistake"
    elif _MODE_HINT_PATTERNS.search(utterance):
        selected_mode = "give_hint"

    return SystemOneResponse(
        answers={
            "is_interrupting_tutor": NoulResult(interrupt_score),
            "is_calling_tutor": NoulResult(calling_score),
            "requested_mode": ChoiceResult(selected_mode),
        }
    )


# ---------------------------------------------------------------------------
# Client Manager
# ---------------------------------------------------------------------------

_client_instance: Optional[Any] = None


def get_laya_client() -> Optional[Any]:
    """
    Initializes or returns cached client for Laya (Open-Source Local Server) or TypeSafe.
    Supports:
    - LAYA_BASE_URL (default: "http://localhost:8001/v1")
    - TYPESAFE_API_KEY
    """
    global _client_instance
    laya_url = os.getenv("LAYA_BASE_URL", "").strip()
    api_key = os.getenv("TYPESAFE_API_KEY", "").strip()

    if not laya_url and not api_key:
        return None

    if _client_instance is None and SDK_AVAILABLE and TypeSafeClient is not None:
        try:
            if laya_url:
                _client_instance = TypeSafeClient(
                    base_url=laya_url,
                    api_key=api_key or "local-laya",
                )
                logger.info("Initialized Laya System 1 Gatekeeper targeting %s", laya_url)
            else:
                _client_instance = TypeSafeClient(api_key=api_key)
                logger.info("Initialized TypeSafeClient for Laya System 1 Gatekeeper.")
        except Exception as exc:
            logger.warning(
                "Failed to initialize Laya/TypeSafe Client: %s",
                exc,
            )
            _client_instance = None

    return _client_instance


def _build_questions() -> Dict[str, Any]:
    """
    Constructs the three parallel questions for Laya System 1:
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
    except Exception:
        q_calling = FallbackNoul(prompt="is_calling_tutor")

    # 2. is_interrupting_tutor (Noul)
    try:
        q_interrupt = Noul(
            prompt=(
                "The student is telling the AI tutor to wait, pause, stop, or slow down (true) "
                "vs. continuing a normal thought or asking a follow-up question (false)."
            )
        )
    except Exception:
        q_interrupt = FallbackNoul(prompt="is_interrupting_tutor")

    # 3. requested_mode (Choice)
    mode_options = {
        "step_by_step": (
            "The student wants the next derivation step or a full step-by-step walkthrough."
        ),
        "check_mistake": (
            "The student is asking if their work/writing is correct, or where their mistake is."
        ),
        "give_hint": (
            "The student explicitly asked for a hint, clue, or gentle push rather than the direct answer."
        ),
        "plot_graph": (
            "The student wants to visualize, plot, or graph the curve or function."
        ),
    }

    try:
        q_mode = Choice(criteria=mode_options)
    except Exception:
        q_mode = FallbackChoice(options=mode_options)

    return {
        "is_calling_tutor": q_calling,
        "is_interrupting_tutor": q_interrupt,
        "requested_mode": q_mode,
    }


# ---------------------------------------------------------------------------
# Public Evaluation Entry Point
# ---------------------------------------------------------------------------


async def evaluate_utterance(
    transcript: str,
    is_ai_speaking: bool = False,
    is_pen_moving: bool = False,
) -> GatekeeperDecision:
    """
    Evaluates a transcribed utterance using Laya System 1.

    Args:
        transcript: Final or intermediate transcribed text from Prisma ASR.
        is_ai_speaking: True if TTS audio is currently actively playing.
        is_pen_moving: True if student is actively drawing or writing on canvas.

    Returns:
        GatekeeperDecision with action in ('PAUSE_TUTOR', 'TRIGGER_GEMINI', 'IGNORE').
    """
    clean_transcript = transcript.strip() if transcript else ""

    if not clean_transcript:
        return GatekeeperDecision(
            action="IGNORE",
            mode=None,
            confidence=1.0,
            reason="Empty audio transcript",
            engine="laya",
            raw_scores=None,
        )

    state = {
        "utterance": clean_transcript,
        "is_student_writing": bool(is_pen_moving),
        "is_tutor_currently_explaining": bool(is_ai_speaking),
    }

    questions = _build_questions()

    client = get_laya_client()
    response: Optional[Any] = None
    engine_used = "laya"

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
                "Laya client.system_one raised an exception; falling back to rule engine: %s",
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

