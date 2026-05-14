# @aura/shared

Shared TypeScript types used across `apps/api`, `apps/sms`, and `apps/web`.

## Planned exports

- `User`, `Contact`, `Routine`, `EventLog` — DB row shapes.
- `RelationshipType` — `"inner_circle" | "friend" | "acquaintance" | "other"`.
- `FrequencyType` — `"daily" | "weekly" | "custom"`.
- `DailySuggestion` — `{ date, contacts_to_nudge[], routines_to_nudge[] }`.
- `ToneMode` — `"neutral" | "millennial" | "gen_z"`.

## Status

🚧 Phase 1 — populated alongside the backend.
