# Microsoft Power Platform integration (opt-in)

Northlight remains the source of truth. This integration is an **outbound
notification adapter**, not a publishing or approval authority. Nothing
is automatically connected to a Microsoft tenant.

## Power Automate: review notifications

The adapter is in `src/lib/integrations/power-automate.ts`. It sends only
an event ID, brand ID, article ID, article title and timestamp to an
HTTPS Power Automate HTTP-triggered Logic Apps endpoint. No content body
or credentials are copied into the message. An unset URL disables it.

1. In Power Automate, create a cloud flow with **When an HTTP request is
   received** (availability depends on licensing and your environment).
2. Use a JSON schema with required `eventId`, `eventType`,
   `brandId`, `articleId`, `title`, `occurredAt` string fields.
3. Add an action to post a Teams notification or create a review task.
   Treat this payload as **untrusted notification data**, not as an
   authenticated request to publish an article.
4. Store the signed trigger URL in the **server-only**
   `POWER_AUTOMATE_REVIEW_WEBHOOK_URL` environment variable.
5. Northlight calls `notifyPowerAutomateReview` after a content pipeline
   successfully creates an article. This sends a **review notification**,
   not a publish/approve command. The pipeline stores a completed status
   before sending, so a notification failure is logged without reverting it.
   Durable retry/outbox delivery and deduplication are still needed for
   production; the event ID is the pipeline run ID.
6. Test with a dummy article, check the status, rotate the signed
   trigger URL if exposed, and never commit it or print it in logs.

Host restrictions deliberately allow `*.logic.azure.com` endpoints
only. If your tenant generates a newer trigger domain, review and update
the allowlist before enabling it.

## Power BI

Use dedicated tenant-scoped reporting views or a server-side export
endpoint, not a PostgreSQL connection with a service-role credential.
Suggested metrics: content briefs created, pipeline completion rate,
review backlog, published content count, and average processing cost.
Label demo figures clearly. Apply brand membership authorization on
every export and keep scheduled exports scoped to the requesting tenant.

A tenant-authorized CSV export is now available at
`/api/integrations/power-bi/export?brandId=<brand-uuid>&kind=pipeline` or
`&kind=articles`. Sign in to Northlight and download each CSV, then
import it into Power BI as a local file. Each export is capped at 5,000
most recent rows, prevents CSV formula injection, has no-store headers,
and labels seeded demo brands. This is **not a public refresh endpoint**:
Power BI scheduled refresh will need a separate secure, authorized
integration. A Power BI dataset/workspace has not been provisioned.

## Power Apps

A lightweight internal review queue is viable later, once Northlight
exposes an authenticated, rate-limited, brand-scoped API with roles,
audit records and idempotent approval transitions. Do not connect a
Power App directly to Supabase service-role credentials. Publishing
still goes through the existing verified claim and approval gates.

No Power Apps canvas application has been provisioned by this change.

## Verification

Run `npx vitest run tests/unit/power-automate.test.ts`, then the
repository lint, typecheck, full tests and production build. This
branch adds a tested integration building block, **not** an activated
end-to-end Microsoft integration.
