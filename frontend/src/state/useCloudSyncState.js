import { useState } from 'react';

// Owns the cloud-sync status: whether a sync is currently in flight and the
// last-synced timestamp.
//
// NOTE: the sync engine itself (syncFromCloud, the autosave effect, autoSaveDataRef)
// stays in AppContent — it reads/writes nearly every domain. It reads this status
// via context.
export function useCloudSyncState() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);

  return { isSyncing, setIsSyncing, lastSynced, setLastSynced };
}
