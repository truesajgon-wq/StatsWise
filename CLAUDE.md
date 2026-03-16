# StatsWise (BetWise) — Project Guide

## What This App Is

StatsWise is a **data-driven football betting analytics platform**. It transforms historical match data into clear, actionable betting insights. It is NOT a tipster service or a gambling ad — it is a structured intelligence tool that helps users make smarter decisions.

## Core Philosophy

- **Never guess or speculate.** Every prediction, insight, or recommendation must be grounded in historical patterns, statistical hit rates, averages, and trend consistency.
- **Value-first thinking.** The app focuses on statistically supported outcomes, not obvious ones. Identify edges where historical data strongly supports a bet that isn't immediately obvious.
- **Data transparency.** Users should always see the reasoning: hit rates, sample sizes, form runs, and confidence levels. No black boxes.
- **Mobile-first design.** Short, scannable content. Bullet points over paragraphs. Users decide in seconds.

## Stat Markets the App Covers

The app thinks in **betting-style stat markets**:

| Market | Scope | Examples |
|--------|-------|---------|
| Goals | Team / Match | Over 2.5 goals, Team over 1.5 |
| BTTS | Match | Both teams to score Yes/No |
| Corners | Team / Match | Over 9.5 corners, Team over 4.5 |
| Cards | Team / Match | Over 3.5 cards, Team over 1.5 |
| Shots | Team | Team over 3.5 shots on target |
| Fouls | Team / Match | Team over 9.5 fouls |
| First/Second Half Goals | Match | Over 0.5 FH goals |

Alt lines must be **bookie-realistic** — don't use lines bookmakers wouldn't offer (e.g., over 1.5 shots on target is too low).

## Analysis Framework

When building any analysis feature, follow these three perspectives:

1. **Football Analyst** — Team form (L5/L10/L15), home vs away splits, H2H history, tactical matchups, motivation context
2. **Data Scientist** — Hit rates with sample sizes, confidence levels (High/Medium/Low), probability grounded in historical data, never fabricated
3. **Smart Bettor** — Value identification, risk categorization, hidden edges from asymmetric team behaviors or overlooked trends

## Confidence & Value System

- **HIGH confidence** — Strong alignment across form, H2H, and venue splits
- **MEDIUM confidence** — Partial alignment or moderate consistency
- **LOW confidence** — Conflicting signals or sparse data

Value ratings compare combined probability against statistical baselines:
- **Exceptional** — Significantly above baseline for the leg count
- **Great / Good / Fair / Low** — Decreasing tiers

Always show the user WHY something is rated a certain way.

## Match Style Detection

Features should detect and tag match styles when relevant:
- **High Tempo** — High shots, high goals expectation
- **Physical** — High fouls, high cards expectation
- **Wide Play** — High corners expectation
- **Balanced** — No dominant pattern

Style tags influence predictions (e.g., a physical match boosts cards/fouls legs).

## Data Flow Principles

- Historical data comes from the backend database or API-Football — never invented
- Form weighting: L5 (high weight) > L10 (medium) > L15 (low)
- Predictions blend model rate (opponent-aware, form-adjusted) with honest rate (raw historical hit rate)
- Empty API responses are never cached — they should be retried on next load
- `withStats: true` is required for any view that needs corners, cards, shots, or fouls data

## UI/UX Principles

- Dark theme, orange (#f97316) accent color
- Card-based layouts with `var(--sw-surface-0)` backgrounds and `var(--sw-border)` borders
- Stat pills/badges for quick scanning
- Bar charts for hit rates and stat values — always aligned
- Confidence and value badges use color coding (green = good, amber = medium, red = caution)
- All features must work on mobile (min 320px width)

## Tech Stack

- React 18 + Vite + TailwindCSS + Supabase, no TypeScript
- Entry: src/main.jsx
- Backend: Node.js (backend/server.js), data from API-Football or local SQLite DB
- State: React hooks + in-memory Map cache (session lifetime, no TTL)
- Auth: Supabase via AuthContext with Bearer token

## Key Architecture

- Pages: HomePage, MatchDetails, SGPPage, PlayerStatsPage, LamakiPage, CorrectScorePage, StatPredictionPage, + auth/legal pages
- Prediction engine: src/utils/predictionModel.js (evaluateFixturePrediction)
- SGP engine: src/data/sgpEngine.js (blended model+honest scoring, correlation groups)
- Stats config: src/data/statsConfig.js (STATS_ORDER, extractStatValue)
- Data hooks: src/data/hooks.js (useFixturesByDate, useMatchHistory, useEnrichedFixtures)
- API layer: src/data/api.js (fetchTeamHistory, fetchMatchDetails, fetchH2H)
