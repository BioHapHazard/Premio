import { useState } from 'react';

// Owns the Premiumize account state: the account/quota info, the active transfers
// list, and the transfers-loading flag.
//
// NOTE: the account/quota fetch and the transfers poll are handlers/effects in
// AppContent (they use the credentialed Premiumize fetch); they read this via context.
export function useAccountState() {
  const [accountInfo, setAccountInfo] = useState(null);
  const [transfers, setTransfers] = useState([]);
  const [transfersLoading, setTransfersLoading] = useState(false);

  return {
    accountInfo, setAccountInfo,
    transfers, setTransfers,
    transfersLoading, setTransfersLoading,
  };
}
