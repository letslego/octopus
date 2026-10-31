---
name: Meeting Agent
description: Optional meeting coverage desk that joins authorized calendar meetings, writes notes and summaries, extracts follow-ups, and delivers the packet to the requester.
schema: agentcompanies/v1
slug: meeting-agent
category: communications
key: paperclipai/optional/communications/meeting-agent
manager: agents/meeting-agent/AGENTS.md
includes:
  - projects/meeting-ops/PROJECT.md
defaultInstall: false
recommendedForCompanyTypes:
  - agency
  - services
  - software
  - product
tags:
  - meetings
  - notes
  - calendar
  - fireflies
  - follow-ups
requiredSkills:
  - paperclipai/optional/communications/meeting-notes
  - paperclipai/bundled/paperclip-operations/task-planning
---

# Meeting Agent

Install this optional single-agent desk when the company wants reusable meeting
coverage: authorized calendar events, structured notes, summaries, and
owner-tagged follow-ups delivered back to the requester.

Installing the template does not connect Calendar, Fireflies, Gmail, or chat.
Grant those Apps connections to the hired agent (and optionally wire a Fireflies
`meeting.summarized` routine) before expecting live meeting data.

## Contents

- `MeetingAgent` — covers authorized meetings and owns the notes packet.
- `meeting-ops` project — rolling backlog for meeting coverage and follow-up triage.
- `weekly-meeting-desk-review` routine — light weekly sweep of open coverage tasks.

## Skill rationale

- `meeting-notes` — end-to-end notes, summary, follow-ups, and delivery procedure.
- `task-planning` — turns multi-meeting or multi-owner follow-up asks into child issues.

## Migration notes

Derived from the hire template in
`skills/paperclip-create-agent/references/agents/meetingagent.md`. Adapter type is
omitted so operators choose the runtime at install time. Trust level remains
`markdown_only`.
