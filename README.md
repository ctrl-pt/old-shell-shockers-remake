# Shell Shockers · May 2019 preservation

A runnable restoration of the old Shell Shockers client, built from recovered Wayback files and analyzed with [REA](https://github.com/morluto/rea). Includes the original UI, default weapon models, weapon sounds, Babylon 3.3 renderer, old lighting, fourteen maps, M2DZ and SMEGG.

## Run locally

Requires Node.js 22 or newer.

```powershell
npm install
npm start
```

Open **http://localhost:3000** in a desktop browser. Run `npm run build` after changing source files. The checked-in `public/` files are already prepared.

- WASD: move; Space: jump; left mouse: fire; Shift: aim; R: reload; E: switch weapon; Q: grenade; Escape: menu.
- Choose **Create**, select a map, then **PLAY** to make a private room. Use the original invite link to connect another browser to the same running server.
- **Alpha1, Alpha2, Alpha3 and Early Bedrock** restore four removed 2017–2018 layouts alongside the ten May maps. Their original geometry and rotations are preserved; spawn and spatula markers are reconstructed. See [historical map research](docs/HISTORICAL_MAPS.md).
- Browser-local practice includes five labeled bots. Multiplayer hosting has no bots by default; its ten slots are available to people.
- Add `?practice` to run a self-contained practice server inside the browser. This also works on the hosted static version.
- Click PLAY to focus the game controls. In embedded browsers that cannot capture the mouse, move the pointer over the game to look. Escape opens the menu. A normal browser supports the original mouse capture.

## Play with friends (up to 10 players)

Public website: **https://old-shell-shockers-remake.vercel.app**. The [GitHub repository](https://github.com/ctrl-pt/old-shell-shockers-remake) is private. Players do not need a GitHub or Vercel account.

1. On the host PC, double-click **Host Game.bat**. It starts the local server, opens an encrypted tunnel, and opens the public website with this session's server address.
2. Share the session link printed in the hosting window. Everyone who uses that link connects to this PC. The ten-player limit includes the host.
3. For a specific map, choose **Create**, select a map, then use the game's **Invite friends** button. That link carries the exact room and server address.
4. Keep this PC awake and the hosting window running. Use **Stop Hosting.bat** or Ctrl+C in the hosting window when finished.

Hosting uses the bundled Node SSH client and an account-free localhost.run HTTPS relay. No router port forwarding, Windows service, or login for friends is needed. The relay address changes between sessions, so share the new session link each time. The plain public website remains available for browser-local practice while the PC is offline.

The launcher reads `host.config.json` for the public website address. `npm run host` and `npm run host:stop` are equivalent terminal commands. Session keys, relay logs, downloaded tools and Vercel authentication stay in ignored local directories. See [hosting details](docs/HOSTING.md).

## Publish updates

Code is pushed to the private GitHub repository with separate commits for completed changes. As requested, Vercel does not have access to the private GitHub repository. Publish only built browser files:

```powershell
npm run deploy:prepare
npm exec --yes --package vercel@65.12.1 -- vercel deploy --prebuilt --prod --yes
```

The deployment contains only static browser files. The multiplayer simulation continues to run on the host PC, with a maximum of ten human players and no bots by default. `npm start` still runs a loopback development server; set `HOST` explicitly if LAN access is wanted. The archived browser source and artwork served to browsers are necessarily downloadable; repository privacy protects repository access and the non-browser project files.

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
- `npm test`: checks asset integrity, original tuning, all fourteen maps, recovered-map conversion and safe spawning, handshake/readiness, damage/death and invalid input.

The original code and assets retain Blue Wizard Digital's copyright and trademarks. This project does not grant a new license to those materials. REA is MIT-licensed. LegacyShell is credited as an archival asset and protocol research source; its modern gameplay modifications are not imported.
