# Backlog: Transfer History Scaling

## Context

The `transfer_history` table in dapp-core's Postgres DB grows with every transfer event (created, approved, rejected, cancelled). Under heavy usage with many users, this table could reach millions of rows, causing query overhead on paginated reads.

Current mitigations already in place:
- Composite indexes on `(sender, status)`, `(receiver, status)`, `(sender, offset)`, `(receiver, offset)`
- All queries are scoped to a single party (no full-table scans)
- Paginated with `LIMIT`/`OFFSET`

## Scaling Solutions (prioritized)

### 1. Time-based table partitioning (low effort, high impact)

Partition `transfer_history` by month/quarter using Postgres native partitioning. Old partitions can be detached and archived. No application code changes needed — Postgres routes queries to the correct partition automatically.

```sql
-- Example: convert to range-partitioned table by record_time
CREATE TABLE transfer_history (
  ...
) PARTITION BY RANGE (record_time);

CREATE TABLE transfer_history_2026_q1 PARTITION OF transfer_history
  FOR VALUES FROM ('2026-01-01') TO ('2026-04-01');
```

### 2. TTL / archival policy

Move records older than N days (e.g., 90 days) to a `transfer_history_archive` table. The UI shows recent history from the hot table; a separate "full history" endpoint queries the archive if needed.

### 3. Replace DB with on-chain queries

Eliminate the DB sync layer entirely by querying Canton's Ledger API directly:
- `/v2/updates/flat` — offset-based streaming for history
- `/v2/state/active-contracts` — for current pending transfers (LOCKED status)

Trade-offs:
- (+) No DB dependency for transfer data, always authoritative
- (-) Harder to implement filtered pagination (sender, receiver, tokenName)
- (-) Requires streaming + in-memory filtering or cursor-based pagination
- (-) Higher latency per query vs indexed DB reads

## Recommendation

Start with solution #1 (table partitioning) when the table exceeds ~1M rows. It's a Postgres-level change with zero application code impact. Consider #3 only if removing the Postgres dependency becomes a goal.
