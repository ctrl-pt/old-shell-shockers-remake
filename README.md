# Shell Shockers · May 2019 preservation

A runnable restoration of the old Shell Shockers client, built from recovered Wayback files and analyzed with [REA](https://github.com/morluto/rea). Includes the original UI, default weapon models, weapon sounds, Babylon 3.3 renderer, old lighting, ten maps, M2DZ and SMEGG.

## Run locally

Requires Node.js 22 or newer.

```powershell
npm install
npm start
```

Open **http://localhost:3000** in a desktop browser. Run `npm run build` after changing source files. The checked-in `public/` files are already prepared.

- WASD: move; Space: jump; left mouse: fire; Shift: aim; R: reload; E: switch weapon; Q: grenade; Escape: menu.
- Choose **Create**, select a map, then **PLAY** to make a private room. Use the original invite link to connect another browser to the same running server.
- Five clearly labeled bots fill empty rooms. Set `$env:BOTS='0'` before `npm start` for human-only games.
- Add `?practice` to run a self-contained practice server inside the browser. This also works on the hosted static version.
- Click PLAY to focus the game controls. In embedded browsers that cannot capture the mouse, move the pointer over the game to look. Escape opens the menu. A normal browser supports the original mouse capture.

## Online hosting

The private hosted Site runs **browser-local practice**, with the original renderer and assets. It does not provide a shared online multiplayer backend.

The included Node server supports shared multiplayer and serves the client from the same origin. Deploy it on a host that supports Node and persistent WebSocket connections. A Dockerfile and `render.yaml` are included; a separate hosting account is required. Configure HTTPS at the hosting provider, use its assigned `PORT`, and verify `/health`. In-memory rooms disappear when the process restarts. Run one server process; this version does not coordinate rooms across replicas.

To connect the hosted client to your deployed server, open **Preservation notes** in the footer and enter its `wss://…/game` address. The browser stores this choice locally. The server URL can also be supplied with `?server=wss%3A%2F%2Fyour-host%2Fgame`. Use the complete query string when sharing a hosted-client room link.

## What is original, and what is reconstructed?

This is a **0.20.1-era reconstruction**, not a verified byte-identical 0.20.1 release. The May 13 archived page still says 0.18.3. The closest complete recovered new-weapons bundle was captured May 19, 2019, at a URL with a May 14 modification query; the associated HTML says 0.20.2. This nearby revision is used rather than silently substituting modern gameplay.

| Component | Provenance |
| --- | --- |
| Browser game, weapon tuning, movement, projectiles, collision, maps, shaders and lighting | Original recovered May client; retained in `archive/client/` |
| Interface markup | Closest recovered May page; retired external scripts removed |
| Weapon/egg/map models and new-weapon audio | Archived original assets |
| Older sound clips and some UI images | Original-era assets preserved by LegacyShell, pinned and hashed |
| Fonts and logo | Period font revisions and original archived logo |
| Multiplayer transport, damage application, room lifecycle, spawning and pickups | Reconstructed server around original shared simulation |
| Bots and browser practice transport | New preservation conveniences, explicitly labeled |
| Online accounts, purchases, advertisements and push notifications | Unavailable; real transactions and external tracking disabled |

The final archived weapon overrides are used: EggK-47 **30**, Dozen Gauge **20 × 8.5**, CSG-1 **105**, RPEGG **140**, SMEGG **23**, M2DZ **170**, and Cluck 9mm **26** maximum base damage. Center-versus-edge shell impact changes actual damage. The old changelog says CSG-1 **102**, and 0.20.2 increased its ammunition; this recovered client has **15/60**. These are documented nearby-patch differences, not proven exact 0.20.1 values.

The original client preserves the angular hit calculation but omits server-side HP changes and explosion checks. The server reconstructs those effects, including a minimum 10% glancing-hit damage from the release note, linear blast falloff, and wall occlusion. Exact historical server damage rounding, explosion falloff, spawn selection, pickup cadence, lag compensation and anti-cheat remain unverified. Gameplay fidelity is strongest for the recovered presentation, weapon configuration, movement and collision routines.

## Research and validation

- `research/assets-manifest.json`: source URLs, archive timestamps, fallback labels and SHA-256 digests for 115 recovered assets. Two unused social-preview photographs are explicitly marked unrecovered.
- `research/protocol.md`: recovered binary packet layouts and readiness sequence.
- `docs/rea-analysis-summary.json`: actual REA 6.8.0 evidence identity and coverage limits. Full retained evidence is available locally in `research/rea-evidence.json`; it is excluded from publishing.
- `docs/PRESERVATION.md`: research decisions and reconstruction limits.
- `scripts/recover-assets.py`: resumable acquisition, validation and provenance recording.
- `npm test`: checks asset integrity, original tuning, all ten maps, handshake/readiness, spawning, damage/death and invalid input.

The original code and assets retain Blue Wizard Digital's copyright and trademarks. This project does not grant a new license to those materials. REA is MIT-licensed. LegacyShell is credited as an archival asset and protocol research source; its modern gameplay modifications are not imported.
