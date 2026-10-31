# Example: Public company 10-K diligence brief

## Input

Issue: "Draft an investment thesis for Example Corp (EXAM). Focus on the latest
10-K and newest 10-Q. Cite accession numbers."

## Application

1. Resolve EXAM on SEC EDGAR and open the latest 10-K and 10-Q with Browser Use.
2. Extract business description, segment revenue, liquidity, and top risk factors.
3. Write document `investment-thesis` and comment with thesis + accession ids.

## Output (excerpt)

```markdown
# Investment thesis — Example Corp (EXAM)
**As of:** 2026-10-28 America/New_York
**Primary filings:** 10-K accession 0001234567-26-000100 (FY2025);
10-Q accession 0001234567-26-000188 (Q2 2026)

## Thesis
EXAM remains a specialty software vendor whose thesis depends on retaining
enterprise net retention above 110% while funding AI feature spend from
operating cash flow.

## Evidence from filings
- Subscription revenue mix and segment split cited from 10-K Item 1 / MD&A.
- Cash and revolving credit capacity cited from 10-Q liquidity note.

## Key risks
- Customer concentration and AI cost inflation called out in Risk Factors.

## Sources
- https://www.sec.gov/... (accession ids above); retrieved 2026-10-28.
```

Disclaimer on the task comment: research memo only — not a buy/sell recommendation.
