# AI Operations Assistant

## Implementation plan

1. Mount a reusable dashboard chat panel on every authenticated web dashboard page.
2. Add a dedicated `/ai-assistant` page for longer operational conversations and report drafting.
3. Route all AI requests through the authenticated backend at `/api/v1/ai`.
4. Query verified live records before calling the LLM.
5. Retrieve SOP, post-order, policy, and training document chunks from RAG storage only for static knowledge questions.
6. Send only role-scoped structured data to NVIDIA NIM Chat Completions.
7. Audit requests, sensitive questions, generated report drafts, and knowledge ingestion.

## Database updates

The backend initializer creates these additive tables:

- `aiAuditLogs`: user, role, question, intent, sources, sensitive flag, status, and error.
- `aiRateLimits`: per-user usage counters by minute/day window.
- `aiGeneratedReports`: saved AI report drafts generated from verified data.
- `aiClientEmails`: draft/approval status for client update emails.
- `aiKnowledgeDocuments`: uploaded SOP/post-order/policy/training document metadata.
- `aiKnowledgeChunks`: chunk text plus optional NVIDIA embedding vectors.

## Backend functions

- `POST /api/v1/ai/chat`: classifies the question, fetches scoped live data, retrieves document chunks, calls NVIDIA, audits the action, and saves report drafts when relevant.
- `GET /api/v1/ai/reports`: lists saved AI report drafts visible to the current user.
- `POST /api/v1/ai/knowledge`: ingests static knowledge documents and stores searchable chunks.
- `GET /api/v1/ai/architecture`: returns provider, table, and capability metadata.

The current repository does not include a source `convex/schema.ts`; the active dashboard API is the existing authenticated backend. If the Convex source schema is restored, mirror these tables and split `/ai/chat` into Convex internal queries/mutations plus one public action that calls NVIDIA.

## Prompt template

System prompt requirements:

- Speak like a professional control-room assistant.
- Answer only from verified JSON data and retrieved document context.
- Never invent patrol scans, clock times, guard details, incidents, GPS data, sites, clients, or policies.
- State clearly when data is missing.
- Respect the caller role and omit sensitive contact details unless included in scoped data.
- Mention timestamps, site names, checkpoint names, geofence status, and unresolved risks when available.
- Format report answers with clear operational sections and verified totals.

## Report templates

Supported report intents:

- Daily Activity Report
- Patrol Summary Report
- Clock-In / Clock-Out Report
- Attendance Report
- Incident Report
- Emergency Report
- Maintenance Report
- Pass-On Log Report
- Weekly Report
- Monthly Report
- Client Summary Report

Each generated report draft stores its type, title, content, source summary, author, status, and timestamp in `aiGeneratedReports`.

## RAG architecture

Static documents are uploaded through `POST /api/v1/ai/knowledge`, chunked into roughly 1,600-character blocks, embedded with `NVIDIA_EMBEDDING_MODEL` when `NVIDIA_API_KEY` is configured, and stored in `aiKnowledgeChunks`.

Retrieval first applies role scope:

- Admin: all documents.
- Main account: assigned client documents and site documents under that client.
- Supervisor/guard: assigned site documents and documents they uploaded.

Then retrieval ranks chunks by vector similarity when embeddings exist, with keyword overlap as a fallback.

Live operational data never comes from RAG. It is loaded from structured tables only.

## NVIDIA integration

Environment variables:

- `NVIDIA_API_KEY`
- `NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1`
- `NVIDIA_CHAT_MODEL=openai/gpt-oss-120b`
- `NVIDIA_EMBEDDING_MODEL=nvidia/nv-embedqa-e5-v5`

The frontend never receives or stores the NVIDIA key.

## Security and permissions

- All routes require JWT auth.
- Existing role scopes are reused for scans, shifts, incidents, pass-on logs, handovers, checkpoints, clients, and sites.
- Contact details are only included when the logged-in role is allowed to see them.
- AI usage is rate-limited per user.
- Sensitive questions and generated reports are audit logged.
- Client email support is stored as draft/approval-first data; sending should remain approval-gated unless an explicit auto-send setting is added.

## Testing checklist

- Ask: “Who is currently on duty?” as admin, supervisor, client account, and guard.
- Ask: “Has this guard clocked in today?” for allowed and disallowed guards.
- Ask for missed patrols and verify no out-of-scope sites appear.
- Ask for a pass-on log summary.
- Ask for a daily activity report and confirm a draft appears in `aiGeneratedReports`.
- Ask for phone/email as a guard and confirm only own allowed data is shown.
- Remove `NVIDIA_API_KEY` and confirm the fallback message appears.
- Upload a sample SOP and ask a policy question.

## Production-readiness checklist

- Set `NVIDIA_API_KEY` in backend environment only.
- Confirm `JWT_SECRET` is strong and present.
- Confirm `AI_RATE_LIMIT_PER_MINUTE` and `AI_RATE_LIMIT_PER_DAY` match expected usage.
- Back up the database before enabling report/email automation.
- Add admin UI for knowledge ingestion, report approval, and client email approval.
- Monitor `aiAuditLogs` for failed provider calls and sensitive access patterns.
- If Convex source tables are restored, port the AI tables/functions into Convex and keep the NVIDIA action server-side.
