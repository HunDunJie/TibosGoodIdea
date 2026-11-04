/* Read only Codex's named quota queries for the current signed-in identity. */
(function (factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.__cqbQuotaCache = api;
})(function () {
  'use strict';
  function read(client) {
    if (typeof client?.getQueryData !== 'function') return undefined;
    const account = client.getQueryData(['vscode', 'account-info']);
    if (!account?.accountId) return undefined;
    let queryKey = ['rate-limit-status'], raw, state;
    if (typeof account.userId === 'string' && account.userId) {
      const scopedKey = ['rate-limit-status', account.userId, account.accountId];
      raw = client.getQueryData(scopedKey);
      state = client.getQueryState?.(scopedKey);
      // A pending or empty scoped query must never fall back to an old identity's data.
      if (raw !== undefined || state !== undefined) queryKey = scopedKey;
    }
    if (queryKey.length === 1) {
      raw = client.getQueryData(queryKey);
      state = client.getQueryState?.(queryKey);
    }
    const matches = raw?.account_id === account.accountId &&
      (!account.userId || raw?.user_id == null || raw.user_id === account.userId);
    return {client, accountId:account.accountId, queryKey, raw:matches ? raw : null, updatedAt:state?.dataUpdatedAt ?? 0};
  }
  return {read};
});
