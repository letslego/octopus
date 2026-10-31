# Example: Weekly standup packet from a Fireflies summary

## Input

Routine task created from Fireflies `meeting.summarized` for meeting id
`abc123`. Requester: company operator. Ask: "Send me notes and follow-ups."

## Application

1. Call `fireflies_get_summary` for `abc123`, then skim the transcript for
   owners of two unclear action items.
2. Write document `meeting-notes` with Summary, Notes, and Follow-ups.
3. Comment on the task with the follow-up table and mark the issue done.

## Output (excerpt)

```markdown
# Meeting notes — Weekly product standup
**When:** 2026-10-28 10:00 America/New_York
**Source:** Fireflies abc123
**Attendees:** Avery (PM), Kai (Eng), Riley (Design)

## Summary
The team locked the onboarding checklist copy and slipped the billing
banner to next week. Kai owns the API fix; Riley will ship the empty state.

## Follow-ups
| Action | Owner | Due | Notes |
| --- | --- | --- | --- |
| Land checkout API retry | Kai | Fri | Blocks banner |
| Empty-state illustration | Riley | Wed | |
| Confirm banner copy with legal | Avery | unassigned | Proposed only |
```
