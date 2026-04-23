# Page Migration Cost Analysis — Slicc migrate-page / migrate-block

Findings from the 2026-04-20 Vegas Summit lab (91 attendees, wknd-adventures.com
canonical target) cross-checked against AWS Bedrock billing. Captures where the
LLM spend actually goes, what's already working, and which levers matter.

---

## TL;DR

- **~$35 per page migration** on the current stack (measured from Vegas lab #1;
  ~$44 from the single-user reference migration with 6 blocks).
- **90% of that cost is Opus scoops** doing block-level migration work. The
  cone (Sonnet) is already cheap at ~$3.50/user.
- Prompt caching is doing heavy lifting — **96.8% hit rate on Opus scoops,
  91.1% on the cone.** Without caching, the same workload would cost
  ~$30K/day instead of ~$4K/day.
- Remaining levers, in priority order: (1) **route simple blocks to Sonnet
  scoops**, (2) **trim scoop input context**, (3) **reduce turn count per
  block**. Realistic target with just (1): **~$20–25/page**.

---

## Measured data

**Vegas lab #1** (2026-04-20, 16:30–18:00 UTC, 91 attendees, wknd-adventures.com
migration workbook):

| Model | Events | Total input tokens | Output | Cache-read % | Est. cost |
|---|---:|---:|---:|---:|---:|
| **Opus 4.6** (scoops) | 29,500 | 1.08B | 7.0M | 96.8% | **~$2,821** |
| **Sonnet 4.6** (cone) | 6,933 | 302M | 1.8M | 91.1% | **~$317** |
| **Total** | 36,433 | 1.38B | 8.8M | 95.8% | **~$3,140** |

**Per-attendee cost: ~$34.50.** Each attendee migrated ~6–7 blocks from
`wknd-adventures.com/basecamp.html`.

**Reference single-page migration** (from earlier internal baseline, 6 blocks,
430 LLM turns, 17.7M input tokens): **~$44.60** using Opus pricing. Same
order of magnitude.

**Cross-check against Bedrock billing:** AWS reported **~$4K total for
2026-04-20** (Opus + Sonnet, full day). The day included Vegas lab #1 plus a
handful of pre-demo drivers doing real customer-brand migrations (RINVOQ,
BlueNile, AbbVie). Our D1-derived estimate is within 20% of the Bedrock bill —
caching is working as measured, not overstated.

---

## Where the cost actually sits

### Opus scoops = 90% of cost

Every block gets its own scoop (sub-agent) running on Opus 4.6. Per Vegas
lab #1:

- **29,500 Opus events** across 91 attendees × ~6 blocks × ~55 turns/block
- **Average 36K input tokens per Opus turn** — big prompt context per step
  (skill + source DOM + brand tokens + accumulated history)
- **Per-turn cost** ≈ $0.10 (cache-heavy: 36K × 97% × $1.50/MTok)

At this rate, a full page migration with 6 Opus scoops at ~55 turns each and
some orchestrator overhead gets to $30–$45 before you're done.

### Sonnet cone = 10% of cost

The cone does orchestration, fan-out to scoops, status reporting, and user
communication. Already on the cheap model (Sonnet 4.6), so this line item
is small — **~$317 total for 91 attendees, ~$3.50/user.**

There's no meaningful cost lever on the cone. Moving it to Haiku would save
pennies per migration and risks quality regressions.

### Cost ≠ event count

The event-count split (29.5K Opus / 6.9K Sonnet ≈ 81/19) **understates** Opus's
share of cost because:

- Opus is priced 5× Sonnet per token
- Opus turns carry slightly less input per turn (36K vs 43K) but far more
  expensive tokens
- Result: 81% of events = 90% of cost

---

## What's already working

- **Prompt caching.** 96.8% cache-read rate on Opus scoops is near ceiling.
  SLICC's `cache_control: ephemeral` markers on skill prompts + per-scoop
  static context are doing exactly what they should.
- **Model routing for the cone.** The cone runs on Sonnet by default — this
  is the first-pass optimization and it's already done. Don't re-propose
  "move orchestrator to Sonnet" reviews; it's not the lever.
- **Parallel scoops.** 6 blocks in parallel completes a full-page migration
  in ~12 minutes wall-clock. Serial Opus would 6× the wall time with no cost
  benefit.

---

## Optimization levers — prioritized

### 1. Route simple blocks to Sonnet scoops (highest impact)

**Est. savings: 25–40% of total cost.**

Many block types don't need Opus-level judgment:

- `footer-links` / `footer`
- `ticker` (horizontal marquee, minimal layout)
- `nav-bar` / `header` (structurally predictable)
- `cta-banner` (boilerplate)

These are pattern-heavy, not visual-judgment-heavy. Running them on Sonnet
would cut the block's cost by ~80%. If half the blocks in a typical page
migrate on Sonnet, per-page cost drops from ~$35 to ~$22–$25.

**How:** `feed_scoop` already accepts a `model` argument. Change the cone's
block-routing logic (or the `migrate-page` skill) to default to Sonnet for
blocks flagged as "structural" / "low visual judgment", and only escalate
to Opus for content-rich blocks (hero, cards, tabs, accordion).

**Follow-up question:** which specific blocks actually benefit from Opus?
A small A/B run on one page — Opus vs Sonnet per block — would produce a
data-backed routing table.

### 2. Trim scoop input context

**Est. savings: 15–25%.**

Average 36K input tokens per Opus turn is large for agentic work. Sources:

- Full skill file (migrate-block SKILL.md) — static, always in cache
- Source page DOM — often 10K+ tokens
- Brand tokens / styles.css — a few KB
- Accumulated conversation history

Cache-read is cheap ($1.50/MTok Opus) but the volume adds up: 1.08B ×
$1.50/MTok = $1,620 on cache reads alone for Vegas lab #1. Halving the
cached context per turn cuts that to $810.

**How:**
- Scoop skills pack too much upfront. Defer loading source HTML and brand
  tokens until a tool call actually needs them.
- Prune conversation history after each major step (screenshot comparison,
  file write). The agent's context should shrink between phases, not grow.
- Consider a "scoop refresh" pattern where the agent drops intermediate
  reasoning after a milestone.

### 3. Reduce turn count per block

**Est. savings: 10–20%.**

At ~55 turns per block scoop, there's room. Sources of turn inflation:

- Iterative CSS refinement loops ("still not matching, try again") —
  10+ turns per block common
- Tool-call retries on browser/playwright failures
- Re-reading the skill when the agent gets confused

**How:**
- Tighter initial prompts (more explicit "what to do first, second, third")
- Better screenshot comparison heuristics — stop iterating earlier when
  visual diff is below threshold
- Explicit "stop after N refinement rounds" guard in the skill

This lever is the hardest to measure because turn count varies heavily by
block complexity. A 2–3 turn reduction per scoop yields meaningful savings
at scale.

### 4. Cross-user source caching (speculative)

**Est. savings: uncertain.**

When multiple users migrate the same site (which happened repeatedly in
the Vegas labs — 55 distinct custom URLs, but 2+ users on Kay Jewelers,
wknd-adventures, AstraZeneca), the source-page extraction work is
duplicated. Caching source HTML / screenshots / design tokens at a shared
layer could save material LLM work.

**Why it's hard:** requires shared storage, auth model for cross-user
cache, and cache-invalidation on source-site changes. Probably not worth
it until the product hits much higher volume.

---

## Unit economics at scale

| Migration volume | Current (~$35/page) | With lever 1 (~$22/page) | With levers 1+2 (~$16/page) |
|---|---:|---:|---:|
| 10 pages (small demo) | $350 | $220 | $160 |
| 100 pages (pilot) | $3,500 | $2,200 | $1,600 |
| 1,000 pages (customer site) | $35,000 | $22,000 | $16,000 |
| 10,000 pages (enterprise migration) | $350,000 | $220,000 | $160,000 |

The per-page figure scales linearly. At enterprise volume, small per-page
optimizations compound quickly.

For comparison, a developer migrating one EDS page by hand takes ~2–4
hours at $100–150/hour = $200–600. Slicc at $35 is already 5–15× cheaper
than human labor; at $15 it's 15–40×.

---

## Data sources / how to reproduce

- **Monitoring database:** `llm-monitoring-usage` D1 on Paolo's Cloudflare
  account (`2760892a9c26d2a6fd962120dfda1496`). Queue consumer in
  `llm-monitoring-worker` writes per-turn events with per-model token
  counts.
- **Classification view:** `current_session_classifications` groups events
  into sessions (91 lab attendees × 6 blocks × ~55 turns/block in Vegas
  lab #1).
- **Bedrock billing reports:** AWS console for the account running the
  Adobe LLM Proxy.
- **Reference baseline:** the pre-conference single-page migration of
  wknd-adventures.com (17.7M tokens, 430 turns, 6 blocks) was logged and
  is available in D1 by filtering on the pre-conference timestamp range.

### Sample SQL: per-model tokens for a given time window

```sql
SELECT model,
       count(*) AS events,
       sum(input_tokens + cache_read_tokens + cache_write_tokens) AS input,
       sum(output_tokens) AS output,
       round(100.0 * sum(cache_read_tokens)
             / NULLIF(sum(input_tokens + cache_read_tokens + cache_write_tokens), 0), 1)
         AS cache_read_pct
FROM usage_events
WHERE created_at >= '<start>' AND created_at < '<end>'
GROUP BY model;
```

---

## Open questions for the skills team

1. Which blocks *actually* regress when run on Sonnet? Need an A/B
   comparison on a representative page (WKND or similar).
2. What's the minimum viable context for a scoop turn? Current ~36K feels
   high for the work being done.
3. Can refinement loops be hard-capped at N rounds without hurting
   quality on visually complex blocks (hero, carousel, accordion)?
4. Is there appetite for a "fast mode" (all-Sonnet) vs "precision mode"
   (Opus for visual-heavy blocks) skill variant that customers can pick
   based on budget tolerance?

---

## Change log

- 2026-04-23: initial analysis based on Vegas Summit lab #1 data
  (2026-04-20) and cross-checked against AWS Bedrock billing.
