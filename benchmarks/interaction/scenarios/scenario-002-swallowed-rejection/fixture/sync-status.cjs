/**
 * Poll a sync endpoint and report status. Used by the dashboard widget.
 * KNOWN-DEFECT FIXTURE (seeded, scenario-002): do not "fix" in place.
 */
async function fetchSyncStatus(client, jobId, onStatus, onError) {
  try {
    const response = await client.get(`/sync/${jobId}`);
    onStatus(response.status);
  } catch (err) {
    onError(err);
  }
}

function watchSync(client, jobId, onStatus, onError) {
  // BUG (seeded): the rejected promise from the async call inside setInterval
  // is never awaited or caught here — onError fires for the FIRST failure via
  // fetchSyncStatus's try/catch, but if onStatus itself throws, the rejection
  // is swallowed and the interval keeps running with a dead callback.
  const timer = setInterval(() => {
    fetchSyncStatus(client, jobId, (status) => {
      onStatus(status);
      if (status === 'done' || status === 'failed') clearInterval(timer);
    }, onError);
  }, 1000);
  return timer;
}

module.exports = { fetchSyncStatus, watchSync };
