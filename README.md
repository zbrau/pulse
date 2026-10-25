# Pulse — focus and music

Desktop app (Tauri v2) for working with music: tasks, pomodoro, lofi radio and
YouTube Music with synced lyrics, all in a single window. The interface is in
Spanish.

![Pulse](docs/preview.png)

## What it does

- **Tasks** — priority (high/medium/low), tags, pomodoro estimates, drag to
  reorder, and a per-task menu to rename, duplicate or delete. Add tasks with
  shortcuts (`!alta`, `#tag`, `*3`) and every completed pomodoro adds a point to
  the active task (`2/4`).
- **Pomodoro** — focus/break cycles, configurable long break, manual skips,
  chime and notification when a session ends, `space` to start or pause.
- **Lofi radio** — 5 live stations (Lofi, Chillhop, Jazz, Ambient, Lounge).
- **YouTube Music** — search any song, play it with a queue, shuffle, repeat,
  volume and a progress bar with real seeking.
- **Saved playlists** — anything you import stays on your machine and can be
  played, queued, renamed or deleted without pasting the link again.
- **Visualizer and equalizer** — real-time bars driven by the actual spectrum and
  a 5-band EQ with presets (Flat, Bass, Vocal, Rock, Electronic, Night).
- **Artist profiles** — photo, monthly listeners, biography, top songs, albums,
  singles and related artists; everything is browsable and playable.
- **Spotify import** — paste a public playlist link or upload an Exportify CSV:
  Pulse matches each song on YouTube Music and queues it.
- **Lyrics** — line-by-line synced to the exact second of the song (via
  [lrclib](https://lrclib.net)), or manual search when nothing is playing.
- **Stats** — pomodoros and focus minutes for the day, day streak and the last
  7 days.

All data (tasks, sessions, settings, saved playlists and EQ) lives in the
WebView's `localStorage`: nothing leaves your machine except YouTube Music
searches and lyric lookups on lrclib.

## How the music works

Pulse does not use the official YouTube API: the catalog comes from
**InnerTube** (YouTube Music's internal API) and the audio is resolved locally by
**yt-dlp**.

```
UI (React)  --invoke-->  Rust
                          |- innertube.rs   search + metadata
                          |- ytdlp.rs       audio URL (sidecar, cached)
                          |- lyrics.rs      lrclib (LRC) + parser
                          '- proxy.rs       127.0.0.1:<port> with Range
                                   ^
                          <audio src="http://127.0.0.1:.../stream/<id>">
```

- **Why a proxy**: the WebView `<audio>` element cannot read `googlevideo`
  directly (CORS and the `Range` requests needed for seeking). Rust requests the
  range from Google, forwards it, and if the URL expired (`403/410`) resolves it
  again with yt-dlp without the UI noticing.
- **Why yt-dlp**: InnerTube without a session no longer returns streams
  (PoToken/bot check), so the binary ships bundled as a *sidecar*.
- **Ephemeral port** on `127.0.0.1`: it exposes nothing outside the machine and
  does not collide with other processes.

## Artist profiles

Search returns artists as well as songs. Clicking one, or the artist name under
any song, opens its YouTube Music profile: photo, monthly listeners, subscribers,
biography, top songs, albums, singles and related artists. From there you can
play everything, add tracks to the queue or open an album and play it whole.

## Importing a Spotify playlist

Neither path needs a Spotify account or API:

1. **Public link** — paste `https://open.spotify.com/playlist/...` into the
   import button (the list icon next to the queue). Pulse reads Spotify's public
   *embed* page, which includes up to 100 songs.
2. **File** — export the list with [Exportify](https://exportify.net) and upload
   the `.csv` (or its `.json`). This is the way to import private or long
   playlists.

Each song is searched on YouTube Music and scored by title, artist and duration.
The dialog shows how many were found and which ones were not, and lets you play
them or add them to the queue.

## Saved playlists

With "Save to My playlists" enabled (the default), Pulse keeps the matched songs
— metadata only: title, artist, cover, album and duration — in a local library.
The library button in the player opens **My playlists**: play, add to the queue,
inspect the songs, rename or delete. They are still there after reopening the
app; audio is resolved with yt-dlp on play, just like any search.

Re-importing the same link or file updates the list instead of duplicating it: it
is identified by origin (normalized link or CSV filename), not by title.

## Visualizer and equalizer

The strip at the bottom of the player draws the real spectrum of what is playing.
Clicking it opens the 5-band **equalizer** (60 Hz, 230 Hz, 910 Hz, 3.6 kHz and
14 kHz; +/-12 dB) with quick presets and a response curve. This is real Web Audio:
the `<audio>` element goes through five biquads and an analyser before the output,
so the visualizer and the EQ share the same signal.

Settings are stored on your machine. The EQ only affects YouTube Music; lofi radio
has its own volume control.

## Running it

Requirements: Node 20+, Rust 1.77+ and (on Windows) the WebView2 runtime, which
ships with Windows 11.

```bash
npm install
npm run desktop      # tauri dev
```

To build the installer:

```bash
npm run tauri:build
```

The output is written to:

```
src-tauri/target/release/pulse.exe
src-tauri/target/release/bundle/nsis/Pulse_0.1.0_x64-setup.exe
```

`npm run dev` only starts the web frontend (useful for UI work, without catalog or
audio).

## Tests

```bash
npm run typecheck    # TypeScript in strict mode
npm run build        # production frontend bundle
```

The app was verified end to end in the real window (dev and release): search with
20 results, audio advancing with real seeking, synced lyrics, artist profiles with
albums and playback, and Spotify playlist import by link (50 of 50 matched) and by
CSV (3 of 3). The library was tested by saving, renaming, playing, deleting and
surviving a reload; the visualizer was checked by measuring canvas energy (6x
while playing) and the EQ by confirming the audio graph runs with the applied
gains. The tasks system was covered with an end-to-end run: quick-add parsing,
priority grouping, editor actions, drag and drop, tag filtering, persistence and
the v1-to-v2 migration. The installer was extracted with 7-Zip and launched from
there to confirm it finds the bundled `yt-dlp`.

> `cargo test` does not start on this machine with the GNU + WebView2 toolchain:
> the test binary dies with `STATUS_ENTRYPOINT_NOT_FOUND` (a limitation of the
> combination, not of the code). The `lyrics.rs` tests stay in the repo and
> compile; the app and the installer work normally.

## Settings

The gear in the top bar opens three tabs:

- **Focus** — session durations, break chain, sound on finish.
- **Engine** — real status of InnerTube, yt-dlp and the local proxy.
- **Data** — export the state to JSON, reset stats or wipe everything.

## Structure

```
src/                            frontend
├── App.tsx                     3-column layout
├── components/
│   ├── PomodoroCard.tsx        ring, modes, controls
│   ├── TasksPanel.tsx          task list
│   ├── FreePlayerCard.tsx      search, player and queue
│   ├── ArtistDialog.tsx        artist profile and albums
│   ├── PlaylistImportDialog.tsx Spotify import
│   ├── LibraryDialog.tsx       saved playlists
│   ├── EqualizerDialog.tsx     5-band EQ and presets
│   ├── Visualizer.tsx          animated spectrum (canvas)
│   ├── LyricsCard.tsx          synced lyrics + manual search
│   ├── LofiCard.tsx            radio (<audio> element)
│   ├── WeekStrip.tsx           last 7 days
│   ├── TopBar.tsx              date, daily stats, streak
│   └── SettingsDialog.tsx      focus, engine and data
├── lib/music.ts                invoke bridge: search and streams
├── lib/importTracks.ts         playlist CSV/JSON parser
├── lib/audioGraph.ts           Web Audio graph (EQ + analyser)
├── lib/lyrics.ts               invoke bridge: lyrics
├── lib/tasks.ts                task priorities, ordering and movement
├── lib/taskInput.ts            quick-add parser (!alta #tag *3)
├── lib/storage.ts              one-time storage-key migration
├── store/useStore.ts           persisted state (zustand)
├── store/usePlayerStore.ts     global player (single <audio>)
├── store/useLibrary.ts         playlist library (localStorage)
├── store/useAudioFx.ts         equalizer settings (localStorage)
└── hooks/useTimerEngine.ts     pomodoro engine

src-tauri/                      backend
├── src/innertube.rs            search, artists and albums (WEB_REMIX)
├── src/spotify.rs              playlist import and matching
├── src/ytdlp.rs                audio resolution + cache
├── src/lyrics.rs               lrclib, scoring and LRC parser
├── src/proxy.rs                Range proxy with re-resolution
├── src/lib.rs                  commands and proxy startup
└── binaries/yt-dlp.exe         bundled sidecar
```

## Technical details

- **Drift-free timer**: it stores `endsAt` (epoch) instead of subtracting seconds,
  so time does not drift when the window loses focus. Reopening continues where it
  left off.
- **Single audio source**: playing YouTube Music pauses the radio and vice versa.
- **Single Web Audio graph**: `lib/audioGraph.ts` creates
  `source -> 5 biquads -> analyser -> destination` once. The proxy answers with
  `Access-Control-Allow-Origin: *` and exposes `Content-Range` so the
  `<audio crossOrigin="anonymous">` element does not taint the graph. If Web Audio
  fails, audio still plays through the normal output and the visualizer stays idle.
- **Real equalizer**: 5 biquads (lowshelf + 3 peaking + highshelf) with short ramps
  to avoid clicks when moving a slider; the analyser sits after the filters, so the
  visualizer reflects the equalized sound.
- **Tasks v2 without data loss**: the task store is persisted at `version: 2` and
  the migration fills `priority: 'media'` and `tags: []` for old tasks. The visible
  order derives from the array with a stable sort by priority, so reordering needs
  no extra field and dropping a task in another group changes its priority.
- **Renamed storage, kept data**: the rebrand moved the keys from `sonora-*` to
  `pulse-*`, with a one-time copy that only runs when the new key does not exist
  yet.
- **WebView2 autoplay**: after resolving the stream, playback starts muted and the
  volume is restored on the first `playing` event, because the WebView blocks
  deferred play.
- **Lyrics**: lookup by artist + title + duration on lrclib, score the match and
  prefer the one with LRC. InnerTube is queried in parallel but without a session
  it no longer returns lyrics.
- **Audio resolution**: one yt-dlp call per song; the URL is cached until about one
  minute before its googlevideo `expire`.
- **Spotify without an API**: Pulse reads the HTML of
  `open.spotify.com/embed/playlist/...`, which contains the list in
  `__NEXT_DATA__`. The old `get_access_token` endpoint returns `403`, so it is not
  used.
- **Matching**: every imported song triggers 3 parallel searches and is scored by
  title, artist and duration; below the threshold it retries once with the title
  only. Progress arrives through the `import-progress` event.
- **InnerTube key**: requests use YouTube's public web client key, the same one the
  web player sends; there is no account, OAuth token or personal credential
  involved.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Search returns nothing | No network, or InnerTube changed its format: check the **Engine** tab. |
| "yt-dlp failed" when pressing play | The video has no audio available or changed region. Try another song. |
| Lyrics say "No lyrics available" | lrclib does not have that song. Use manual search. |
| Audio does not start | Another player took over the output device; pause and press play again. |
| Import says "playlist not found" | It is private or no longer exists; export the CSV with Exportify and upload it. |
| Some imported songs are missing | They are not on YouTube Music or have a different title there; search for them manually. |
| The artist profile is empty | YouTube changed the page format: check the **Engine** tab and update Pulse. |

## Roadmap

- Likes and user-created playlists inside Pulse.
- Reorder or remove songs from a saved playlist.
- Retry failed imports by picking the correct match.
- Per-task history and hours-by-project charts.
- Soft due dates (today / tomorrow) and archive with undo.
- Keyboard shortcuts (`n` for a new task, `1/2/3` for timer modes, `p` for
  play/pause).

## License

MIT — see [LICENSE](LICENSE).
