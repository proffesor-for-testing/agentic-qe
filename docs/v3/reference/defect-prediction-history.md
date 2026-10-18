# Defect prediction history

The public defect prediction handler and the domain predictor retain the latest
32 usable runs per predictor namespace in the project memory database. This is a
bounded history policy, rather than a seven-day log of every invocation. The
existing seven-day expiry still applies.

Runs keep immutable UUID keys. Retention orders the observed records by analysis
timestamp and a deterministic identifier tie-breaker. The worker still reports
an ambiguous newest timestamp as unmeasured; retaining multiple tied runs does
not establish which happened last. A uniquely newer run restores measured
reporting. Static code-risk estimates remain estimates, not calibrated defect
probabilities.

Legacy databases may contain more than 1,000 records. The worker inspects all
candidates instead of treating an unordered, capped search result as current.
The next successful producer call removes unusable records and excess history
from its own predictor prefix; unrelated namespaces and other memory keys are
untouched. Legacy inspection can therefore be more expensive until retention
has run. Normal sequential production retains at most 32 records.

Pruning deletes only immutable keys from its observed snapshot. Concurrent runs
outside that snapshot survive; simultaneous writers can temporarily exceed the
limit until the next cleanup. Storage failures propagate to the producer instead
of reporting recorded success. A partial cleanup can leave extra history, but
the worker's latest-run selection does not depend on the old 1,000-record cap.
