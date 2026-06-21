# Walkthrough: Google Drive Integration, Storage Sync & Streaming

We have successfully completed the integration of Google Drive storage and sync capabilities into Premio. This feature provides a zero-Premiumize-points alternative for profiles synchronization and media streaming by leveraging the user's personal Google Drive storage.

---

## 1. Google OAuth2 Authorization Workflow

To securely interact with Google Drive without managing user passwords, we implemented an OAuth2 authentication flow:
* **OAuth Credentials Storage:** Created `gdrive_credentials.json` on the server to store Google Client ID and Client Secret configured by the user.
* **OAuth Consent and Redirect:** Added a popup authentication flow. Clicking "Connect Google Drive" redirects the user to the Google Consent screen requesting the privacy-preserving `drive.file` scope (which restricts access *only* to files and folders created or opened by Premio).
* **Token Handshake & Storage:** The backend exchanges the authorization code for access and refresh tokens, stores them securely, and transmits a `gdrive-connected` postMessage to automatically close the popup and update frontend connection status.
* **Automated Token Rotation:** Implemented a background helper on the server that automatically refreshes expired access tokens using the refresh token before executing any API call.

---

## 2. Unified Target Folder Structure

Initially, uploads generated separate folders for each movie or show, cluttering the drive. We refactored this to support a single Premio folder:
* **Custom Folder Option:** Added a user-configurable folder name field in the settings (defaulting to `"Premio"`).
* **Single Target Resolution:** When uploading, the backend queries Google Drive to find or create a folder with the specified name. All uploads are then placed directly inside this folder, keeping the user's Google Drive organized.

---

## 3. Resumable Chunked Upload & Auto-Archive Pipeline

To move completed downloads to Google Drive reliably:
* **Chunked Upload Pipeline:** Media files are uploaded in chunks using a resumable upload session on Google Drive. A pipeline monitors upload progress and writes active states to `gdrive_uploads.json` to ensure uploads survive server restarts.
* **Auto-Archive Mode:** When enabled, the frontend automatically initiates an upload for any Usenet item completed by SABnzbd. Once the upload finishes successfully, the local source files are automatically deleted from the hard drive, freeing up local disk space.
* **Progress Guards:** Prevents playing media files that are still uploading, displaying an interactive progress toast message instead.

---

## 4. Google Drive Background Scanning & Playback Restoration

If a completed Usenet file is deleted locally (manually or via Auto-Archive), its playback button in the transfers page or library would normally break. We solved this with background scanning:
* **Folder File Registry:** Added `GET /api/gdrive/files` to fetch all files and folders residing in the target Premio Google Drive folder.
* **Token-Overlap Matching:** Implemented a smart file matcher in the frontend. It compares completed download titles with scanned Google Drive file listings using alphanumeric keyword token intersections.
* **On-the-Fly Restoration:** If a local file is missing but a match exists in Google Drive, the client restores the **Play** button on the transfer card or library card, fetching the file ID and routing playback directly to the Google Drive streaming proxy.

---

## 5. Range-Enabled Google Drive Streaming Proxy

Because web browsers cannot play raw Google Drive API download links directly, we built a server-side proxy:
* **HTTP Range Header Support:** Implemented `GET /api/gdrive/stream` to fetch bytes from Google Drive and stream them with full HTTP Range request headers. This enables instant scrubbing, timeline seeking, and audio track switches directly inside the browser player.
* **Subtitles Integration:** Seamlessly resolves and injects sidecar subtitle tracks from Google Drive.

---

## 6. On-the-Fly Google Drive Transcoding & Codec Fallback

Most browsers do not support codecs like HEVC (H.265) video or AC3 audio, which are common in high-definition `.mkv` files. We extended our transcoding pipeline to Google Drive:
* **Transcoding Proxy Endpoint:** Added `GET /api/gdrive/transcode` which streams media chunks from Google Drive, piping them through a spawning `ffmpeg` process to transcode video to H.264 and audio to AAC on-the-fly.
* **Auto-Detection Fallback:** If the browser video element encounters a decode error on a Google Drive stream, it triggers a warning, notifies the user, and automatically reloads the player using the transcoded stream.
* **Multi-Audio Track Selector:** Integrates an `audio-tracks` query to analyze the source file on Google Drive, list audio streams, and let the user switch audio tracks dynamically while transcoding.

---

## 7. Cloud Sync Migration

To stop utilizing Premiumize cloud storage points for backup and profile syncs:
* **GDrive Sync Hook:** If Google Drive sync is enabled, all profile data (playlists, watchlist, settings, theme, library shelves, continue-watching states) is synced to `profiles_list.json` and sync files on Google Drive instead of Premiumize.
* **Premiumize Fallback Protection:** Refactored frontend sync methods (`syncProfilesToCloud`, `syncProfilesFromCloud`, `syncProfileDataFromCloud`, `syncToCloud`) to lock all transactions to Google Drive once connected, eliminating fallback loops and "Not logged in" warnings in the console. If a sync file is not found, the client automatically initializes remote storage by uploading local states.

---

## 8. Stabilization Guards

* **Safe Relative URL Parsers:** Guarded all `new URL()` constructors across `VideoPlayerModal.jsx` and `App.jsx` with a fallback `window.location.origin` parameter to prevent crashes when resolving relative stream routes.
* **Recursive Stream Guards:** Added an `isGdriveResolved` flag and `torrent` checks in `App.jsx` to prevent infinite loop errors in `startStreaming()`.
* **Play in Premio Player:** Restored library shelf play actions to correctly initialize streaming using `startStreaming()` inside the web player modal rather than opening raw media links in new browser tabs.
