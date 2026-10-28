"""
System 2 Vision & Math Reasoning Engine (Gemini 2.5 Flash + SymPy).

Strict Role Separation:
- Gemini 2.5 Flash (with Pro fallback) handles 100% of handwriting OCR,
  visual reasoning, symbolic verification tool calls, and explanation generation.
- SymPy provides deterministic symbolic execution to eliminate arithmetic
  and algebraic hallucinations.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import re
from typing import Any, AsyncGenerator, Callable, Optional

from google import genai
from google.genai import types as genai_types
from pydantic import BaseModel, Field
import sympy
from sympy.parsing.sympy_parser import (
    convert_xor,
    implicit_multiplication_application,
    parse_expr,
    standard_transformations,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Pydantic Output Schemas (Enforced Structured Output)
# ---------------------------------------------------------------------------


class GraphAction(BaseModel):
    """Instructions for client-side Mafs 2D graphing."""

    should_plot: bool = Field(
        default=False,
        description="Whether this step benefits from an interactive 2D function visual",
    )
    functions: list[str] = Field(
        default_factory=list,
        description="List of mathematical functions to plot, e.g. ['sin(x)', 'x**2 - 4']",
    )
    x_domain: list[float] = Field(
        default_factory=lambda: [-10.0, 10.0],
        description="Plotting domain bounds [min_x, max_x]",
    )
    highlight_points: list[list[float]] = Field(
        default_factory=list,
        description="List of [x, y] coordinates for roots, extrema, or critical intercepts",
    )


class SolutionStep(BaseModel):
    """A single logical mathematical derivation step."""

    step_number: int = Field(
        ...,
        description="1-indexed sequential step number",
    )
    canvas_latex: str = Field(
        ...,
        description=(
            "Clean LaTeX equation to be inscribed onto the notebook line by the Ghost Pen. "
            "Do NOT wrap in dollar signs or display markers."
        ),
    )
    margin_note: str = Field(
        ...,
        description=(
            "Concise 3-6 word handwritten margin pointer, e.g. 'Integrate by parts', "
            "'Apply chain rule', 'Factor quadratic'."
        ),
    )
    tts_speech: str = Field(
        ...,
        description=(
            "Spoken audio explanation in student's selected language with ZERO raw LaTeX symbols. "
            "Write math phonetically, e.g. 'integral from zero to pi of sine x d x' so Gnani Timbre "
            "TTS pronounces it naturally."
        ),
    )
    graph_action: Optional[GraphAction] = Field(
        default=None,
        description="Optional graphing action for visualizing this step",
    )


class TutorSolutionResponse(BaseModel):
    """Complete structured solution returned by the math reasoning engine."""

    detected_problem_latex: str = Field(
        ...,
        description="Full LaTeX representation of the problem statement detected from the images",
    )
    student_mistake_note: Optional[str] = Field(
        default=None,
        description=(
            "Detailed explanation of any sign, arithmetic, or algebraic mistake found in the student's "
            "handwritten work, or null if the handwriting is correct or empty."
        ),
    )
    steps: list[SolutionStep] = Field(
        ...,
        min_length=1,
        description="Ordered sequence of derivation steps from problem to final answer",
    )


# ---------------------------------------------------------------------------
# SymPy Symbolic Verification Tool
# ---------------------------------------------------------------------------

_TRANSFORMATIONS = standard_transformations + (
    implicit_multiplication_application,
    convert_xor,
)


def verify_math_with_sympy(
    operation: str,
    expression: str,
    variable: str = "x",
) -> str:
    """Verify mathematical operations symbolically using SymPy to guarantee zero arithmetic hallucinations.

    Args:
        operation: The mathematical operation:
            - 'solve': Solve equations for the variable (e.g. 'x**2 - 5*x + 6 = 0' or '2*x + 4 = 10').
            - 'integrate': Compute indefinite or definite integral (e.g. 'sin(x)' or 'x**2, (x, 0, 1)').
            - 'diff': Compute derivative with respect to variable (e.g. 'x**3 * exp(x)').
            - 'simplify': Simplify algebraic or trigonometric expression.
            - 'factor': Factor polynomial into irreducible factors.
            - 'limit': Compute limit (e.g. 'sin(x)/x, 0').
            - 'matrix': Perform matrix algebra (e.g. 'det([[1, 2], [3, 4]])' or 'inv([[1, 2], [3, 4]])').
            - 'evalf': High-precision numeric evaluation.
        expression: The mathematical expression in Python/SymPy syntax.
        variable: Primary symbol variable (defaults to 'x').

    Returns:
        JSON string containing the verified result and LaTeX representation.
    """
    logger.info("Executing SymPy verification: op=%s expr=%s var=%s", operation, expression, variable)
    try:
        sym_var = sympy.Symbol(variable)
        op = operation.strip().lower()

        # 1. Equation solving
        if op == "solve":
            if "=" in expression:
                left_str, right_str = expression.split("=", 1)
                left_expr = parse_expr(left_str.strip(), transformations=_TRANSFORMATIONS)
                right_expr = parse_expr(right_str.strip(), transformations=_TRANSFORMATIONS)
                eq = sympy.Eq(left_expr, right_expr)
                res = sympy.solve(eq, sym_var)
            else:
                expr = parse_expr(expression, transformations=_TRANSFORMATIONS)
                res = sympy.solve(expr, sym_var)
            return json.dumps({
                "status": "success",
                "operation": "solve",
                "result": str(res),
                "latex": sympy.latex(res),
            })

        # 2. Integration (indefinite or definite)
        if op == "integrate":
            # Check for definite integral syntax: expr, (x, a, b)
            if "," in expression and "(" in expression:
                try:
                    parsed = parse_expr(f"integrate({expression})", transformations=_TRANSFORMATIONS)
                    res = parsed
                except Exception:
                    expr = parse_expr(expression.split(",")[0], transformations=_TRANSFORMATIONS)
                    res = sympy.integrate(expr, sym_var)
            else:
                expr = parse_expr(expression, transformations=_TRANSFORMATIONS)
                res = sympy.integrate(expr, sym_var)
            return json.dumps({
                "status": "success",
                "operation": "integrate",
                "result": str(res),
                "latex": sympy.latex(res),
            })

        # 3. Differentiation
        if op in {"diff", "derivative"}:
            expr = parse_expr(expression, transformations=_TRANSFORMATIONS)
            res = sympy.diff(expr, sym_var)
            return json.dumps({
                "status": "success",
                "operation": "diff",
                "result": str(res),
                "latex": sympy.latex(res),
            })

        # 4. Simplification
        if op == "simplify":
            expr = parse_expr(expression, transformations=_TRANSFORMATIONS)
            res = sympy.simplify(expr)
            return json.dumps({
                "status": "success",
                "operation": "simplify",
                "result": str(res),
                "latex": sympy.latex(res),
            })

        # 5. Factoring
        if op == "factor":
            expr = parse_expr(expression, transformations=_TRANSFORMATIONS)
            res = sympy.factor(expr)
            return json.dumps({
                "status": "success",
                "operation": "factor",
                "result": str(res),
                "latex": sympy.latex(res),
            })

        # 6. Limits
        if op == "limit":
            if "," in expression:
                expr_str, pt_str = expression.split(",", 1)
                expr = parse_expr(expr_str.strip(), transformations=_TRANSFORMATIONS)
                pt = parse_expr(pt_str.strip(), transformations=_TRANSFORMATIONS)
                res = sympy.limit(expr, sym_var, pt)
            else:
                expr = parse_expr(expression, transformations=_TRANSFORMATIONS)
                res = sympy.limit(expr, sym_var, 0)
            return json.dumps({
                "status": "success",
                "operation": "limit",
                "result": str(res),
                "latex": sympy.latex(res),
            })

        # 7. Matrices
        if op in {"matrix", "matrix_det", "matrix_inv"}:
            # Evaluate matrix expression safely
            mat = sympy.Matrix(eval(expression, {"Matrix": sympy.Matrix, "sympy": sympy}))
            if "det" in op or "det" in expression:
                res = mat.det()
            elif "inv" in op or "inv" in expression:
                res = mat.inv()
            else:
                res = mat.rref()[0]
            return json.dumps({
                "status": "success",
                "operation": "matrix",
                "result": str(res),
                "latex": sympy.latex(res),
            })

        # 8. Numeric evaluation fallback
        expr = parse_expr(expression, transformations=_TRANSFORMATIONS)
        res = expr.evalf()
        return json.dumps({
            "status": "success",
            "operation": op,
            "result": str(res),
            "latex": sympy.latex(res),
        })

    except Exception as exc:
        logger.warning("SymPy evaluation error on '%s': %s", expression, exc)
        return json.dumps({
            "status": "error",
            "expression": expression,
            "error": str(exc),
        })


# ---------------------------------------------------------------------------
# Gemini System Prompt & Reasoning Engine
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are Claire, a patient, brilliant math tutor with superhuman visual perception and symbolic verification rigor.
You are helping a student work through a math problem on their digital notebook.

You are provided with:
1. High-resolution crop of the highlighted target area (the math question or student's handwriting).
2. Full-page snapshot of the student's notebook page (problem statement + handwritten work so far).
3. The student's summon request action (solve, check_mistake, hint, graph, custom).
4. The student's preferred spoken language:
   - "en-IN": Indian English
   - "hi-IN": Hinglish / Hindi
   - "gu-IN": Gujarati

STRICT OPERATIONAL DIRECTIVES:
1. MANDATORY SYMBOLIC VERIFICATION:
   Before providing the final steps, you MUST call `verify_math_with_sympy` to calculate or verify key equations, derivatives, integrals, roots, or algebraic steps. Zero arithmetic hallucinations are permitted.

2. STUDENT MISTAKE DIAGNOSIS:
   Scrutinize the student's handwriting in the images.
   - If you detect a sign error, incorrect arithmetic, misapplied formula, or algebraic mistake, explain clearly in `student_mistake_note` exactly where and how it happened.
   - If the student's work is correct or if no handwriting is present, set `student_mistake_note` to null.

3. STRUCTURED STEP-BY-STEP DERIVATION:
   Break the mathematical derivation into clean, sequential `steps`:
   - `step_number`: Sequential integer starting at 1.
   - `canvas_latex`: Clean, elegant LaTeX code for the mathematical equation to be inscribed onto the notebook line by the Ghost Pen (e.g. "\\int x e^x dx = x e^x - \\int e^x dx"). Do NOT wrap in dollar signs.
   - `margin_note`: Short 3-6 word handwritten pointer for the margin (e.g. "Integration by parts", "Product rule", "Factor numerator").
   - `tts_speech`: Spoken audio explanation for this step in the requested language. CRITICAL: ZERO RAW LATEX SYMBOLS. Spell out all math in plain spoken words (e.g. "integral from zero to pi of sine x d x", "derivative of x squared is two x"). This text is spoken directly by Gnani TTS.
   - `graph_action`: If this step involves a function that would benefit from visualization, provide `should_plot: true`, the mathematical function expressions in Python/SymPy syntax (e.g. ["sin(x)", "cos(x)"]), domain bounds [min_x, max_x], and key highlight coordinates [x, y]. Otherwise set `should_plot: false`.

4. ACTION SPECIFIC BEHAVIOR:
   - "solve": Complete rigorous derivation from beginning to final boxed answer.
   - "check_mistake": Focus heavily on identifying the mistake in `student_mistake_note`, then provide corrected steps.
   - "hint": Provide only 1-2 scaffolding steps that guide the student forward without spoiling the entire answer.
   - "graph": Emphasize `graph_action` with accurate functions, plotting domain, and key points.
   - "custom": Answer the student's specific question while providing corresponding mathematical steps.
"""


def _get_genai_client() -> genai.Client:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not configured on the AI engine.")
    return genai.Client(api_key=api_key)


def _prepare_image_part(base64_str: str) -> Optional[genai_types.Part]:
    """Convert a base64 string (with or without data URL prefix) to a GenAI Part."""
    if not base64_str:
        return None
    try:
        clean_b64 = base64_str
        if "," in clean_b64:
            clean_b64 = clean_b64.split(",", 1)[1]
        img_bytes = base64.b64decode(clean_b64)
        return genai_types.Part.from_bytes(data=img_bytes, mime_type="image/png")
    except Exception as exc:
        logger.warning("Failed to decode image part: %s", exc)
        return None


async def solve_math_problem(
    action: str,
    query: str = "",
    cropped_target_base64: str = "",
    full_page_base64: str = "",
    preferred_language: str = "en-IN",
    on_status: Optional[Callable[[str, str], None]] = None,
) -> TutorSolutionResponse:
    """Run System 2 math reasoning with Gemini 2.5 Flash + SymPy verification.

    Args:
        action: 'solve', 'check_mistake', 'hint', 'graph', or 'custom'.
        query: Optional question text from the student.
        cropped_target_base64: High-res crop of target area.
        full_page_base64: Full-page notebook snapshot.
        preferred_language: 'en-IN', 'hi-IN', or 'gu-IN'.
        on_status: Optional callback for status notifications (status, message).

    Returns:
        Validated TutorSolutionResponse object.
    """
    client = _get_genai_client()
    primary_model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    fallback_model = "gemini-2.5-pro"

    # Build multimodal content parts
    contents: list[Any] = []

    target_part = _prepare_image_part(cropped_target_base64)
    if target_part:
        contents.append("Highlighted Target / Question Crop:")
        contents.append(target_part)

    full_page_part = _prepare_image_part(full_page_base64)
    if full_page_part:
        contents.append("Full Notebook Page Context:")
        contents.append(full_page_part)

    user_instruction = (
        f"Student Action: {action}\n"
        f"Student Query: {query or 'None'}\n"
        f"Preferred Spoken Language for tts_speech: {preferred_language}\n\n"
        "Please inspect the handwriting, verify the mathematics using `verify_math_with_sympy`, "
        "and generate the structured step-by-step solution."
    )
    contents.append(user_instruction)

    if on_status:
        on_status("analyzing", "Claire is analyzing the problem and handwriting...")

    # Attempt execution with primary model and fallback
    for model_name in [primary_model, fallback_model]:
        try:
            logger.info("Calling Gemini math reasoning engine with model: %s", model_name)

            # Strategy A: Generate with tools and structured output schema
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=contents,
                    config=genai_types.GenerateContentConfig(
                        system_instruction=SYSTEM_PROMPT,
                        tools=[verify_math_with_sympy],
                        response_mime_type="application/json",
                        response_schema=TutorSolutionResponse,
                        temperature=0.1,
                    ),
                )
                raw_text = response.text
            except Exception as tool_schema_conflict:
                logger.info(
                    "Tools + Schema combined mode raised exception (%s). Switching to two-phase verification.",
                    tool_schema_conflict,
                )
                if on_status:
                    on_status("verifying", "Running symbolic verification via SymPy...")

                # Strategy B: Two-turn verification loop
                # Turn 1: SymPy verification chat
                chat = client.chats.create(
                    model=model_name,
                    config=genai_types.GenerateContentConfig(
                        system_instruction=SYSTEM_PROMPT,
                        tools=[verify_math_with_sympy],
                        temperature=0.1,
                    ),
                )
                turn1_prompt = (
                    f"{user_instruction}\n\n"
                    "First, verify all critical calculations, roots, integrals, or derivatives using verify_math_with_sympy."
                )
                turn1_contents = []
                if target_part:
                    turn1_contents.append(target_part)
                if full_page_part:
                    turn1_contents.append(full_page_part)
                turn1_contents.append(turn1_prompt)

                turn1_resp = chat.send_message(turn1_contents)
                logger.info("Verification turn completed: %s", str(turn1_resp.text)[:200] if turn1_resp.text else "done")

                # Turn 2: Structured JSON response
                turn2_prompt = (
                    "Now output the final solution in strict JSON matching the schema with fields: "
                    "detected_problem_latex, student_mistake_note, and steps (step_number, canvas_latex, margin_note, tts_speech, graph_action)."
                )
                turn2_resp = chat.send_message(
                    turn2_prompt,
                    config=genai_types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=TutorSolutionResponse,
                    ),
                )
                raw_text = turn2_resp.text

            # Parse and validate response
            if raw_text:
                try:
                    return TutorSolutionResponse.model_validate_json(raw_text)
                except Exception:
                    clean_json = raw_text.strip()
                    if clean_json.startswith("```json"):
                        clean_json = clean_json[7:]
                    if clean_json.startswith("```"):
                        clean_json = clean_json[3:]
                    if clean_json.endswith("```"):
                        clean_json = clean_json[:-3]
                    data = json.loads(clean_json.strip())
                    return TutorSolutionResponse.model_validate(data)

        except Exception as exc:
            logger.error("Model %s failed during reasoning: %s", model_name, exc)
            if model_name == fallback_model:
                raise

    raise RuntimeError("Math reasoning engine failed on all models.")

