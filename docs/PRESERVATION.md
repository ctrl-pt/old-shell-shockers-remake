# Preservation record

## Primary evidence

- REA upstream: https://github.com/morluto/rea — package version 6.8.0 was actually executed against the recovered client. Its static graph is evidence of source structure, not a claim that runtime behavior is proved. The bundled Babylon code caused the default semantic-node retention limit to be reached; those limits remain in the retained summary.
- Original client: https://web.archive.org/web/20190519200727id_/https://shellshock.io/src/shellshock.min.js?1557886744
- Original client SHA-256: `4721a0eb11762ff8d7bd949cfd6f18c79ae596499f65f07c1ba4ea286dadad11`.
- Closest recovered interface: https://web.archive.org/web/20190519200726id_/https://shellshock.io/
- Earlier page: https://web.archive.org/web/20190513135103id_/https://shellshock.io/ — identifies as 0.18.3, so it cannot establish an exact 0.20.1 build.
- Asset fallback: https://github.com/onlypuppy7/LegacyShell/tree/a7cbb8dff2685dd024573dd36242d26640ebbcef — only period assets are reused, not the February weapon balance or later gameplay extensions.

## Implementation boundaries

The browser executable is preserved unchanged in `archive/`. `scripts/prepare-client.mjs` verifies its hash before generating a working copy with a small closure bridge, WebGL 1 compatibility options, and removal of the embedded analytics insertion. A separate compatibility script disconnects retired commercial services. The old lighting, global-illumination worker, materials, map construction and animations continue to run from the recovered executable.

The Node server extracts the original shared code before browser UI bootstrap, replaces actor construction with `null`, and runs each room in a separate JavaScript context. The browser practice server uses the same extracted routines and reconstructed room code. The original binary protocol connects both versions to the archived client. Neither implementation talks to the live Shell Shockers game servers.

The compatibility input controller focuses the canvas after spawning and handles controls even when an embedded browser denies Pointer Lock. It calls the original player movement, jump and weapon methods. Browser-local practice accepts queued movement packets without the network server's rate filter, so timer throttling does not discard movement. Regression tests measure original player position, jump height and view rotation rather than only checking weapon animations.

Reconstructed server behavior is deliberately visible in `shared/room.mjs`. Its damage hook fills code removed from the shipped browser build. Blast falloff, occlusion, room selection, spawn preference, pickup placement and timers are reasonable preservation choices, not recovered backend source. Bots are optional new functionality, and their names identify them.

## Known differences and remaining verification

- Exact 0.20.1 bundle not established; nearest complete original May bundle used.
- CSG-1 is 105 damage and 15/60 ammunition in this artifact. Changelog102 and pre-0.20.2 ammo differ.
- Real online account authentication, purchases, promotions and external social integrations are not recreated.
- The static hosted Site runs isolated browser practice. Shared multiplayer requires the included Node service on a WebSocket-capable host.
- No modern head-to-head comparison with an operating May 2019 backend is possible from the available evidence. Frame-perfect animation timing, latency behavior and exact server damage/physics integration remain unproved.
- Old JavaScript uses some implicit temporary variables. The browser practice artifact runs as a classic script to preserve those semantics; the Node server isolates them per room.

## Re-run REA

Use a Node version supported by REA's package manifest. From a trusted tools directory, run:

```text
npx -y rea-agents@6.8.0 analyze-javascript-application "ABSOLUTE_PROJECT_PATH/archive/client" --detail summary --evidence_output "ABSOLUTE_PROJECT_PATH/research/new-rea-evidence.json" --format json
```

The destination must be new. On restricted Windows hosts, point `TEMP` and `TMP` at a writable project-local directory before invoking REA. The original first analysis failed on system temporary-file permissions; a corrected run completed and retained 51.6 MB of evidence. No native decompiler or registration change was needed.
