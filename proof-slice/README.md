# PromptPilot Circuit Breaker — Production Safety Proof Slice

## Risk addressed
A failing model provider can consume request capacity and spread failures; the breaker prevents repeated calls while the dependency is unhealthy.

## Chosen control
A circuit breaker in `circuitBreaker.js` tracks failures, opens at the configured ratio and minimum volume, then allows one half-open recovery probe.

## How to run / test
Run `node --test proof-slice/circuitBreaker.test.js` with Node.js 18+. Expected: all six tests pass.

## Evidence
Automated tests cover minimum-volume gating, threshold trips, short-circuiting without calling the dependency, successful recovery, failed-probe reopening, concurrent probe exclusion, and transition order.

## Observability note
Inspect `metrics.breaker_open_total`, `metrics.short_circuited_total`, `metrics.success_total`, and `metrics.failure_total`; `onStateChange(state)` emits each state transition.

## Trade-off
The breaker temporarily rejects provider calls during outages, so replies use a fallback rather than potentially fresher model output.

## Remaining risk
This in-memory breaker is per process, not distributed; it does not cap provider latency by itself or guarantee that fallback content is appropriate for every ticket.

## How this production control protects my Modules 1–3 design
It protects the support-reply path from a single external model dependency becoming a cascading failure, preserving the service's safe fallback path.
