import { useState } from 'react';

// Owns the Cloud Storage Manager state: the current folder's contents, the folder
// id/name + breadcrumb trail, loading/error flags, the inline rename target
// (id/name/type), the file-list filter, and the cloud-playlist build status.
//
// NOTE: folder navigation, rename/delete/save actions, and playlist building are
// handlers in AppContent (they use the credentialed Premiumize fetch); they read
// this state via context.
export function useCloudState() {
  const [cloudContents, setCloudContents] = useState([]);
  const [cloudFolderId, setCloudFolderId] = useState(null);
  const [cloudFolderName, setCloudFolderName] = useState('Root Folder');
  const [cloudBreadcrumbs, setCloudBreadcrumbs] = useState([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudError, setCloudError] = useState(null);
  const [cloudRenameId, setCloudRenameId] = useState(null);
  const [cloudRenameName, setCloudRenameName] = useState('');
  const [cloudRenameType, setCloudRenameType] = useState('folder');
  const [cloudFilter, setCloudFilter] = useState('');
  const [cloudPlaylistLoading, setCloudPlaylistLoading] = useState(false);
  const [cloudPlaylistStatus, setCloudPlaylistStatus] = useState('');

  return {
    cloudContents, setCloudContents,
    cloudFolderId, setCloudFolderId,
    cloudFolderName, setCloudFolderName,
    cloudBreadcrumbs, setCloudBreadcrumbs,
    cloudLoading, setCloudLoading,
    cloudError, setCloudError,
    cloudRenameId, setCloudRenameId,
    cloudRenameName, setCloudRenameName,
    cloudRenameType, setCloudRenameType,
    cloudFilter, setCloudFilter,
    cloudPlaylistLoading, setCloudPlaylistLoading,
    cloudPlaylistStatus, setCloudPlaylistStatus,
  };
}
