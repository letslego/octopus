---
name: Investment Research
description: Optional research desk for company and industry investment theses, including SEC EDGAR 10-K and 10-Q analysis with browser or Browser Use access.
schema: agentcompanies/v1
slug: investment-research
category: research
key: paperclipai/optional/research/investment-research
manager: agents/research-analyst/AGENTS.md
includes:
  - projects/investment-research/PROJECT.md
defaultInstall: false
recommendedForCompanyTypes:
  - finance
  - venture
  - consulting
  - software
tags:
  - research
  - investment
  - thesis
  - sec
  - edgar
  - browser
requiredSkills:
  - paperclipai/optional/research/investment-thesis
  - paperclipai/optional/browser/agent-browser
  - paperclipai/bundled/paperclip-operations/task-planning
---

# Investment Research

Install this optional single-analyst desk when the company needs reusable
investment-thesis and diligence capacity: company or industry research, SEC
10-K/10-Q reading, and cited memos.

Installing the template does not enable Browser Use Cloud or brokerage access.
Grant browser / Browser Use tools for filing analysis. This desk does not place
trades and does not provide personalized investment advice.

## Contents

- `ResearchAnalyst` — owns thesis memos and filing analysis.
- `investment-research` project — rolling diligence backlog.
- `weekly-research-review` routine — triage open theses and stale filing coverage.

## Skill rationale

- `investment-thesis` — framing, EDGAR procedure, synthesis, and delivery.
- `agent-browser` — supervised browser verification and interactive filing viewers when Browser Use is unavailable.
- `task-planning` — splits multi-issuer or multi-segment asks into child issues.

## Migration notes

Derived from the hire template in
`skills/paperclip-create-agent/references/agents/researchanalyst.md`. Adapter type
is omitted for install-time selection. Trust level remains `markdown_only`.
