# Back-bug: P01a stale data flagging deferred

Discovered: 2026-05-02 (P01a M1 planning — see audit recommendation)
Owner of fix: Phase 9 dashboard, or a dedicated mini-migration before P9.

The audit recommended tagging 138 stale `redesign_status='failed'` rooms with
`internal_test_data_pre_v1` for analytics filtering. The implementation requires
a `tags jsonb` column on `rooms`, which P01a did not add (out of demolition
scope; demolition only drops, doesn't add).

**Owner of fix:** Phase 9 dashboard or a dedicated mini-migration.
**Suggested fix:**
```sql
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS tags jsonb DEFAULT '{}'::jsonb;
UPDATE rooms SET tags = jsonb_set(coalesce(tags, '{}'::jsonb), '{internal_test_data_pre_v1}', 'true'::jsonb)
  WHERE redesign_status = 'failed' AND created_at < '2026-05-01'::timestamptz;
```
**Blast radius:** zero (additive column; tagging is informational).
**Repro:** any analytics query filtering rooms by status currently can't
distinguish pre-V1 test data from real failures.

---

Verifier note (P01a session 1, 2026-05-02): self-heal added the standard
`Discovered:` + `Owner of fix:` header lines so this back-bug matches the
metadata pattern of the other three P01a back-bugs. No body content changed.
