# SABnzbd + EasyUseNet Integration — Design Plan

**Goal:** Add an optional, self-hosted Usenet path that **bypasses Premiumize entirely**:
search indexers (existing) → send the NZB to the user's own **SABnzbd** → SABnzbd
downloads via their Usenet provider (**EasyUseNet**) → Premio streams the finished
file. The Premiumize Usenet path (`transfer/create`, "double points") stays exactly
as-is; this is a parallel **engine the user can choose**.

## Scope (v1)

- **In:** SABnzbd settings (URL + key), send-NZB-to-SABnzbd action on Usenet results,
  a SABnzbd download manager (progress), and range-based streaming of the completed
  file in the existing player.
- **Topology:** SABnzbd and Premio's Node backend run on the **same machine / LAN**
  (shared filesystem) — confirmed with the user. This is a local/self-hosted feature.
- **Playback:** serve the file with HTTP Range; plays in-browser for MP4/H.264, and
  reuses the existing **"Open in VLC / copy link"** handoff for MKV/HEVC/x265. **No
  transcoding** in v1.
- **Out (later phases):** FFmpeg transcoding for always-in-browser playback;
  streaming *while* downloading; remote/non-shared SABnzbd; auto-add to Library.

> **Separation of secrets:** EasyUseNet is configured **inside SABnzbd** (as a Usenet
> server), never in Premio. Premio only ever holds the SABnzbd URL + API key. So this
> path is independent of Premiumize *and* keeps the provider creds out of Premio.

## Flow

```
[Indexer search]  ->  NZB (nzbUrl / imported .nzb)        (EXISTING)
        |
        v   user picks "Download via SABnzbd"
[POST /api/sab/add] -> SABnzbd mode=addurl|addfile        (NEW)
        |
        v   SABnzbd downloads from EasyUseNet + par2/unrar
[GET /api/sab/status] -> poll queue + history (progress)  (NEW)
        |
        v   on Completed: history.storage = file path
[Play] -> player src = /api/sab/stream?nzoId=...          (NEW)
[GET /api/sab/stream] -> fs.createReadStream + 206 Range  (NEW)
        |
        v
  in-browser (MP4/H264)  OR  Open in VLC (MKV/HEVC)        (REUSE)
```

## Reuse (already in the codebase)

- **Indexer search + NZB parsing** — nzbgeek/ninjacentral already work; results carry `nzbUrl`. Imported NZBs are cached (`importedNzbsCache`) and served at `/api/imported-nzb/:id`.
- **BYOK header plumbing** — `fetchWithCredentials` (App.jsx ~260) injects `X-*` headers; server has `resolvePremiumizeKey(req)` etc. Mirror with `X-Sabnzbd-Url` / `X-Sabnzbd-Key`.
- **Local-service precedent** — Premio already calls user-configured **Jackett** on localhost directly (the public-URL SSRF guard is only for *external* user-supplied URLs). SABnzbd is the same trusted-local pattern.
- **Range streaming template** — `/api/stream-archive-file` (server.js ~2181) + `Range` is already in the CORS allowlist (server.js line 68). The video player already sends Range and has VLC/copy-link buttons.
- **Download-manager UI** — mirror the existing Transfers panel.

## New configuration (BYOK, like Jackett)

Frontend settings (in `useSettingsState` + the Settings panel):
- `userSabUrl` → `X-Sabnzbd-Url` (e.g. `http://localhost:8080`)
- `userSabKey` → `X-Sabnzbd-Key` (SABnzbd API key)
- `userSabCategory` (optional) → SABnzbd category to file these under (e.g. `premio`)

Add the two headers to `fetchWithCredentials`; add `resolveSab(req)` on the server
(header first, `.env` `SABNZBD_URL`/`SABNZBD_API_KEY` only when `ALLOW_ENV_KEYS=true`,
matching the existing key model). Add `X-Sabnzbd-Url`/`X-Sabnzbd-Key` to the CORS
`allowedHeaders` list (server.js line 69).

Settings copy should note: *"Configure EasyUseNet as a server inside SABnzbd; Premio
only needs SABnzbd's URL + API key."*

## New backend routes (server.js)

All call SABnzbd's HTTP API (`{sabUrl}/api?...&apikey=KEY&output=json`).

1. **`POST /api/sab/add`** — body `{ nzbUrl }` or `{ importId }`.
   - With a URL: `mode=addurl&name=<urlencoded nzbUrl>&cat=<cat>` → `{ nzo_ids: [...] }`.
   - With an imported NZB: `mode=addfile` (multipart `nzbfile`) using the cached buffer.
   - Returns the `nzo_id` so the UI can track it.
2. **`GET /api/sab/status`** — proxies `mode=queue` + `mode=history` (or `mode=queue` then `mode=history` merged). Normalize to `{ active:[{nzoId,name,percent,mbLeft,eta,status}], done:[{nzoId,name,status,storage,bytes}] }`. Frontend polls this (like Transfers).
3. **`GET /api/sab/stream?nzoId=...`** (or `?path=...`) — the streaming route:
   - Resolve the completed file: look up `nzoId` in SABnzbd history → `storage` (the completed folder/file path). If it's a folder, pick the largest video file inside.
   - **Security:** validate the resolved path is **absolute, exists, and lives under an allowed media root** (the SABnzbd complete dir — read once via SABnzbd `mode=get_config` or a configured `userSabCompleteDir`). Reject anything else (path-traversal guard, same spirit as the existing zip-slip checks).
   - Stream with **HTTP Range**: `fs.statSync` for size, parse `Range`, respond `206` + `Content-Range` + `Accept-Ranges: bytes`, `fs.createReadStream(path, {start,end})`. Set `Content-Type` from extension. (Copy the shape of `/api/stream-archive-file`.)

## Frontend

- **Settings:** add the SABnzbd URL/key (+ optional category) fields to `SettingsPanel`.
- **Engine choice:** on Usenet search results, add a **"Download via SABnzbd"** action next to the existing "Add to Premiumize." Optionally a default-engine toggle in Settings ("Usenet handler: Premiumize | SABnzbd"). Label the SABnzbd path as **no Premiumize points** (your own provider) vs. the Premiumize path's "double points."
- **Download manager:** a small SABnzbd panel (mirror Transfers) polling `/api/sab/status` — shows queue progress and completed items with a **Play** button.
- **Playback:** Play opens the existing video player with `src = /api/sab/stream?nzoId=...`. MP4/H.264 plays in-browser; for MKV/HEVC the existing **Open in VLC / copy stream link** buttons work against the same URL (LAN). New state lives in a `useSabnzbd` hook → the provider (consistent with the Phase-2 architecture).

## Security checklist

- SABnzbd key sent as header; never logged; `.env` fallback only under `ALLOW_ENV_KEYS`.
- SABnzbd is trusted local (like Jackett) → direct calls, **not** routed through the public-URL SSRF guard.
- `/api/sab/stream` MUST enforce the path-allowlist (file under the SABnzbd complete root only) — this is the one route that touches the filesystem from a request param.
- Respect the existing adult/privacy filtering when listing/serving.

## Implementation order (each step independently testable)

1. **Config + connectivity:** settings fields + headers + `resolveSab` + a `GET /api/sab/test` (proxies SABnzbd `mode=version`/`queue`) → "SABnzbd connected" check in Settings.
2. **Add NZB:** `POST /api/sab/add` + the "Download via SABnzbd" action → verify the item appears in SABnzbd's queue.
3. **Status/progress:** `GET /api/sab/status` + the download-manager panel polling it.
4. **Stream:** `GET /api/sab/stream` with Range + path guard → Play a completed MP4 in-browser; verify VLC handoff for MKV.
5. **Polish:** engine default toggle, points labeling, error states (failed download, repair failure), continue-watching integration.

## Open questions / assumptions

- **Complete-dir discovery:** prefer reading it from SABnzbd (`mode=get_config` → `misc.complete_dir`) so the user doesn't enter the path twice; fall back to an optional `userSabCompleteDir` setting. (Decide in step 4.)
- **Folder vs single file:** completed releases are often a folder — v1 picks the largest video file; multi-file packs (seasons) could later list episodes like the Premiumize player does.
- **Auth on SABnzbd:** assumes API-key auth (default). If the user fronts SABnzbd with basic-auth/HTTPS, the URL/headers handle it; note in docs.
