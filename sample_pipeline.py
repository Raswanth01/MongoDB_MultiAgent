"""
sample_pipeline.py - 5-step demo pipeline for the Time-Travel Debugger.

THE PLANTED BUG
    Step 3 (EnricherAgent) returns the price as a formatted string
    ("$19.99 USD") instead of a number. Step 4 (ValidatorAgent) does tax math
    on it and crashes. Steps 1-3 "pass", so the real culprit is upstream of
    the crash - exactly what the debugger is meant to trace.

HOW TO FIX IT (two ways, both used in the demo)
    A) State fix  : edit step 3's saved state  price "$19.99 USD" -> 19.99,
                    then replay from step 4.
    B) Prompt fix : edit STEP3_PROMPT below so it asks for a numeric price,
                    then replay from step 3 (its code/prompt hash changed).

NOTE: no real LLM is called. fake_llm_call() simulates one with fixed token
and latency numbers so the demo is fast, free and repeatable.

Run standalone (no proxy needed):
    python sample_pipeline.py
"""
import os
import re
import sys
import time

# --------------------------------------------------------------------------
# Proxy hookup. When our proxy exists, `from our_tool import proxy` works and
# @proxy.checkpoint does the MongoDB snapshotting. Until then we use a tiny
# local stand-in that just prints each step, so this file runs on its own.
# --------------------------------------------------------------------------
try:
    from our_tool import proxy
except ImportError:
    proxy = None

# Shrink the simulated waiting time (0.1 = 10% of the stated latency).
DELAY_SCALE = float(os.getenv("PIPELINE_DELAY_SCALE", "0.1"))

# Usage of the step currently running. The proxy (or the fallback below)
# reads this after each step to record tokens_used / latency_ms.
usage = {"tokens": 0, "latency_ms": 0}


def fake_llm_call(prompt, tokens, latency_ms, respond):
    """Stand-in for a paid LLM/API call. Costs `tokens`, takes `latency_ms`."""
    time.sleep(latency_ms / 1000 * DELAY_SCALE)
    usage["tokens"] += tokens
    usage["latency_ms"] += latency_ms
    return respond(prompt)


def _local_checkpoint(step_number, agent_name):
    """Fallback for @checkpoint: runs the step and prints a status line."""
    def wrap(fn):
        def inner(state):
            usage.update(tokens=0, latency_ms=0)
            try:
                out = fn(dict(state))
            except Exception as exc:
                print(f"  Step {step_number}  {agent_name:<15} FAILED  "
                      f"{type(exc).__name__}: {exc}")
                raise
            print(f"  Step {step_number}  {agent_name:<15} PASSED  "
                  f"{usage['tokens']:>5} tokens  {usage['latency_ms']:>5} ms")
            return out
        inner.step_number = step_number
        inner.agent_name = agent_name
        inner.__name__ = fn.__name__
        return inner
    return wrap


checkpoint = proxy.checkpoint if proxy else _local_checkpoint

# --------------------------------------------------------------------------
# Prompts. Editing a prompt changes that step's hash, so a replay re-runs it.
# --------------------------------------------------------------------------
STEP3_PROMPT = "Extract the product name and price from the parsed record."
# Fixed version (uncomment to apply the prompt fix):
# STEP3_PROMPT = ("Extract the product name and price from the parsed record. "
#                 "Output price as a numeric float, without currency symbols.")

DEFAULT_TASK = "Scrape Pro Plan pricing and calculate 18% GST"
GST_RATE = 0.18

PAGE_HTML = (
    "<div class='plan'><h2>Pro Plan</h2>"
    "<span class='price'>$19.99 USD</span></div>"
)


# --------------------------------------------------------------------------
# The 5 steps
# --------------------------------------------------------------------------
@checkpoint(step_number=1, agent_name="ScraperAgent")
def step_1_scraper(state):
    """Fetch the raw pricing page."""
    state["html"] = fake_llm_call(
        state["task"], tokens=1500, latency_ms=2100, respond=lambda p: PAGE_HTML
    )
    return state


@checkpoint(step_number=2, agent_name="ParserAgent")
def step_2_parser(state):
    """Pull the product name and raw price text out of the HTML."""
    def parse(_prompt):
        name = re.search(r"<h2>(.*?)</h2>", state["html"]).group(1)
        price = re.search(r"class='price'>(.*?)<", state["html"]).group(1)
        return {"product": name, "raw_price": price}

    state.update(
        fake_llm_call("Parse the product record.", tokens=1200,
                      latency_ms=1800, respond=parse)
    )
    return state


@checkpoint(step_number=3, agent_name="EnricherAgent")
def step_3_enricher(state):
    """Normalise the price. THE BUG LIVES HERE (see module docstring)."""
    def model(prompt):
        # A real model follows its prompt. Without "numeric" in the prompt it
        # copies the price text as-is (a string); with it, it returns a float.
        if "numeric" in prompt.lower():
            return float(re.sub(r"[^0-9.]", "", state["raw_price"]))
        return state["raw_price"]

    state["price"] = fake_llm_call(
        STEP3_PROMPT, tokens=900, latency_ms=1400, respond=model
    )
    return state


@checkpoint(step_number=4, agent_name="ValidatorAgent")
def step_4_validator(state):
    """Validate the price and compute GST. CRASHES if price is a string."""
    price = state["price"]
    if not isinstance(price, (int, float)):
        raise TypeError(
            f"expected numeric price, got {type(price).__name__} {price!r}"
        )
    state["tax"] = round(price * GST_RATE, 2)
    state["total"] = round(price + state["tax"], 2)
    fake_llm_call("Validate totals.", tokens=800, latency_ms=900,
                  respond=lambda p: None)
    return state


@checkpoint(step_number=5, agent_name="FormatterAgent")
def step_5_formatter(state):
    """Produce the final invoice line."""
    state["invoice"] = (
        f"{state['product']}: {state['price']:.2f} + GST {state['tax']:.2f} "
        f"= {state['total']:.2f}"
    )
    fake_llm_call("Format invoice.", tokens=600, latency_ms=700,
                  respond=lambda p: None)
    return state


STEPS = [step_1_scraper, step_2_parser, step_3_enricher,
         step_4_validator, step_5_formatter]


# --------------------------------------------------------------------------
# Runner
# --------------------------------------------------------------------------
def run_pipeline(task=DEFAULT_TASK, state=None, start_step=1):
    """Run steps start_step..5 in order and return the final state.

    start_step=1  -> normal run from scratch (state is built from `task`).
    start_step>1  -> resume: `state` must be the saved state coming out of
                     step (start_step - 1). The proxy supplies this on replay
                     (cached steps are skipped inside @checkpoint).
    """
    if start_step == 1:
        state = {"task": task}
    elif state is None:
        raise ValueError("start_step > 1 needs the saved state from step "
                         f"{start_step - 1}")

    for step in STEPS[start_step - 1:]:
        state = step(state)
    return state


if __name__ == "__main__":
    print(f"Task: {DEFAULT_TASK}\n")
    try:
        final = run_pipeline()
        print(f"\nDONE -> {final['invoice']}")
    except Exception:
        print("\nPipeline stopped at the failing step.")
        sys.exit(1)