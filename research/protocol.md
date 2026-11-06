# Recovered May 2019 Shell Shockers wire protocol

Primary artifact: `agent/shellshock-20190519-1557886744.min.js`, retrieved without Wayback rewriting from <https://web.archive.org/web/20190519200727id_/https://shellshock.io/src/shellshock.min.js?1557886744>. The asset modification query dates to May 14, 2019. The archive inventory does **not** prove this bundle is exactly release 0.20.1; its containing May 19 HTML identifies 0.20.2, while its JavaScript has the earlier modification query. May 22 and May 28 variants are also retained. Do not call the rebuilt server an original recovered backend: the browser bundle omits important server-only effects.

`agent/protocol-cases.json` contains the exact original client receive cases, with source offsets. `agent/original-functions.json` inventories function and method ranges. `agent/headless-variables.json` contains exact declarator source text for the constants, catalog, collision system, maps, and binary codec. Offsets in those JSON files were produced using Babel on the original bytes decoded as UTF-8; Python universal-newline offsets can differ.

## Primitive encodings

One WebSocket binary frame can contain several consecutive commands. There is no outer length per command; the receiver reads each command's known fields until no bytes remain. Multi-byte integers are little endian.

| Notation | Encoding |
| --- | --- |
| u8 | unsigned byte |
| u16 | unsigned 16-bit little endian |
| u32 | unsigned 32-bit little endian |
| f | signed 16-bit integer divided by 300; writer truncates `300 * value` through bitwise operations |
| yaw | unsigned u16 divided by 10000 |
| pitch | unsigned u16 divided by 10000, minus PI; writer encodes `(pitch + PI) * 10000` |
| str | u8 UTF-16 code-unit count followed by that many u16 code units; not UTF-8 |

## Join sequence

1. A connection may be opened only to ping the region. `[16]` must receive `[16]` without requiring a player join.
2. The actual joining browser sends `joinGame` 15 and the fields below.
3. Server returns `gameJoined` 0 as a separate frame. The client switches away from its lobby receive handler and loads models/builds the map asynchronously.
4. After the map is ready, the browser installs the gameplay receive handler and sends `[18]` (`clientReady`), immediately followed by `[16]` (`ping`).
5. Only after client readiness should the server send `addPlayer` for the local player and existing peers, item state, and then `[18]`. The final `[18]` opens the game's play menu and starts rendering.
6. Clicking PLAY sends `[19]` (`requestRespawn`). Respond with `respawn` for that player after checking the countdown. The client does not send spawn coordinates.

### Client joinGame: 15

`u8 command=15, u8 uuid, u8 joinType, u8 gameType, u8 mapId, u16 gameId, u16 gameKey, u8 classIdx, u8 primary8, u8 secondary8, u8 colorIdx, u8 hat8, u8 stamp8, str username`.

Optional logged-in suffix: `u32 session, str firebaseId`. Guest join has no suffix. Join types are 21 public, 22 private, 23 create private. Game modes are 0 FFA, 1 Teams, 2 Captula the Spatula. Classes are 0 Soldier, 1 Scrambler, 2 Free Ranger, 3 Eggsploder, 4 Whipper, 5 Crackshot. Default weapons use 8-bit item index zero; the catalog maps these back to global item IDs 3100, 3600, 3400, 3800, 4000, 4200, and secondary 3000.

### Server gameJoined: 0

15 bytes including command:

`u8 command=0, u8 meId, u8 myTeam, u8 gameType, u16 gameId, u16 gameKey, u8 mapIdx, u8 playerLimit, u8 isGameOwner, u16 blueScore, u16 redScore`.

The map itself is embedded in the client `minMaps` array. `mapIdx` must match that exact array. Team 0 is FFA, 1 blue, 2 red.

### Server addPlayer: 1

58 bytes plus twice the name's UTF-16 code-unit length:

`u8 command=1, u8 id, u16 uniqueId, str name, u8 classIdx, u8 team, u8 primary8, u8 secondary8, u8 shellColor, u8 hat8, u8 stamp8, f x, f y, f z, f dx, f dy, f dz, yaw yaw, pitch pitch, u32 score, u16 kills, u16 deaths, u16 streak, u32 totalKills, u32 totalDeaths, u16 bestGameStreak, u16 bestOverallStreak, u8 shield, u8 hp, u8 playing, u8 weaponIdx, u8 controlKeys, u16 randomSeed, u8 upgradeProductId`.

The local player's `addPlayer` must precede hit/respawn/ready messages that expect `me` to exist. Empty hats/stamps encode zero. Use actual catalog items when constructing the headless Player; the constructor calls `instantiateNew` on both weapons.

## Client to server commands

| Code | Name | Payload after command |
| --- | --- | --- |
| 3 | chat | str text |
| 6 | sync | u8 nextStateIdx, u8 shotsQueued, then exactly 3 control states: u8 controlKeys, yaw, pitch |
| 7 | jump | none |
| 14 | swapWeapon | u8 slot (0 primary, 1 pistol) |
| 16 | ping | none |
| 18 | clientReady | none |
| 19 | requestRespawn | none |
| 20 | throwGrenade | f throwPower (clamped 0..1 by client) |
| 25 | switchTeam | none |
| 27 | changeCharacter | u8 classIdx, u8 primary8, u8 secondary8, u8 color, u8 hat8, u8 stamp8 |
| 30 | pause | none |
| 33 | reload | none |

Client sync is always 18 bytes including command. It contains no position. It sends the preceding three frames of input; `nextStateIdx` is the state after those frames, modulo 256. `FramesBetweenSyncs=3`; logic runs at 30 Hz, so nominal sync frequency is 10 Hz. The control bitmask declaration is retained in `headless-variables.json`. Firing requests are the `shotsQueued` count inside sync; command 49 is server to client only in the original browser.

## Server to client gameplay commands

| Code | Name | Payload after command | Total bytes |
| --- | --- | --- | --- |
| 2 | removePlayer | u8 id | 2 |
| 3 | chat | u8 playerId, str text | 3+2N |
| 6 | sync | u8 playerId, u8 stateIdx, f x, f y, f z, u8 climbing; then 3*(u8 keys, yaw, pitch) | 25 |
| 7 | jump | u8 id | 2 |
| 8 | die | u8 killedId, u8 killerId, u8 respawnSeconds | 4 |
| 9 | hitThem | u8 playerId, u8 hp | 3 |
| 10 | hitMe | u8 hp, f hitDirectionX, f hitDirectionZ | 6 |
| 11 | collectItem | u8 playerId, u8 kind, u8 applyToWeaponIdx, u16 itemId | 6 |
| 12 | spawnItem | u16 id, u8 kind, f x, f y, f z | 10 |
| 13 | respawn | u8 id, f x, f y, f z | 8 |
| 14 | swapWeapon | u8 id, u8 slot | 3 |
| 16 | ping | none | 1 |
| 18 | clientReady | none | 1 |
| 20 | throwGrenade | u8 id, f x, f y, f z, f dx, f dy, f dz | 14 |
| 25 | switchTeam | u8 id, u8 newTeam | 3 |
| 26 | notification | str text, u8 seconds | 3+2N |
| 27 | changeCharacter | u8 id, u8 classIdx, u8 primary8, u8 secondary8, u8 color, u8 hat8, u8 stamp8 | 8 |
| 30 | pause | u8 id | 2 |
| 32 | updateBalance | u32 newBalance | 5 |
| 33 | reload | u8 id | 2 |
| 35 | switchTeamFail | none | 1 |
| 40 | gameLocked | none | 1 |
| 41 | expireUpgrade | none | 1 |
| 44 | spatula | f x, f y, f z, u8 controlledBy, u8 controlledByTeam | 9 |
| 49 | fire | u8 playerId, f originX, f originY, f originZ, f directionX, f directionY, f directionZ, u8 randomSeed | 15 |

The `fire` direction is an unnormalized range vector; the receiving Bullet normalizes it and uses the weapon's velocity/range. Reproduce its quantization to 1/300 and shared seeded random sequence, particularly for the 20 shotgun pellets. The server echoes `fire` to the shooter as well; local fire animation is skipped on the echo but projectiles are spawned from the authoritative packet.

On receipt of server sync, the local client reconciles and resimulates its buffered frames beginning at `stateIdx`. Therefore report the position corresponding to that exact state index, rather than an unrelated current position. Other players reset their local state index to zero and simulate the three supplied input frames. A server peer starting from old state should run those frames in order and return a compatible position/index pair.

`hitMe` updates local HP and indicator; `hitThem` updates remote HP/visuals. A kill additionally requires `die`, which updates scores, kill/death totals, streaks, removes the egg from play, plays the old burst/death sounds, and opens the death/respawn flow. A respawn sets HP to 100, resets weapons on death, and activates a 120-count shield that drains by 2/tick or disables upon movement/firing.

## Reusing original logic in a headless backend

Feasible preserved components: weapon constructors and late tuning overrides; Player movement, jump, ladder and weapon countdown methods; all original map definitions; Collider geometry/ray intersection helpers; Bullet/Rocket/Grenade motion; catalog; binary codec; deterministic shotgun spread.

Use a Babylon NullEngine/Scene and original map meshes to retain ramps, ladders, and precise cells. The movement collider is a box of width/depth .5 and height .6, with its bottom at the player's Y. Projectile target collision is instead a sphere radius .3 centered at `(player.x, player.y+.32, player.z)`.

The whole browser script cannot simply be required in Node: it starts DOM/UI, Firebase, advertising and audio. Extract the game IIFE's declarations and selected assignment statements via AST. All actor construction sites (`new PlayerActor`, weapon actors, projectile actors) must become `null` in server constructors; a constructor stub that returns null still produces a truthy object under JavaScript `new`. Required free globals include room-owned `players`, `playerLimit`, `map`, `mapMeshes`, `munitionsManager`, `now`, `sendToAll`, `sendToOthers`, and reconstruction hooks. Keep these per room (for example, separate VM contexts), not shared across rooms.

Important missing server effects in the browser artifact:

- `Bullet.prototype.collidesWithPlayer` preserves the hit-normal calculation and `Math.pow(dot, 4)` but its server-only HP application was compiled away; remaining expressions are `this.damage, Math.pow(...); this.player, ...`. It needs an explicit damage hook.
- `checkExplosionCollisions` is called by grenade/rocket server branches but is not defined in the browser client. Explosion damage/occlusion requires reconstruction.
- Player damage/death broadcasting, item collection/spawning policy, authoritative joins, room lifetime, account persistence and server input validation are not supplied.
- `sendToAll`, `sendToOthers`, `sendSpatulaState`, authoritative clock/queue advancement and room data are external to the preserved client.

Thus movement can reuse original routines, but combat server authority is reconstructed and must be tested/documented accordingly. LegacyShell provides an independently reconstructed server reference, but its February 2019 balance and later custom modifiers/protocol changes must not overwrite the May bundle's values.

## Recovered original balance and timing

The bundle contains base class assignments and a **later override block**. Use the final values, not the first occurrence. Earliest recovered new-weapons bundle, May 19 capture:

| Weapon | Final damage | ROF counter (30Hz) | Magazine / reserve | Long / short reload counters |
| --- | --- | --- | --- | --- |
| EggK-47 | 30 | 3 (600RPM) | 30 / 240 | 210 / 180 |
| Dozen Gauge | 8.5 per pellet, 20 pellets (170 total) | 8 (225RPM theoretical) | 2 / 24 | 155 / 155 |
| CSG-1 | 105 | 15 (120RPM) | 15 / 60 | 240 / 150 |
| RPEGG | 140, blast radius 2.75 | 40 | 1 / 3 | 170 / 170 |
| SMEGG | 23 | 2 (900RPM) | 50 / 200 | 225 / 190 |
| M2DZ | 170 | 15, plus mandatory single-round cycle | 1 / 20 | 120 / 120 |
| Cluck 9mm | 26 | 4 (450RPM) | 15 / 60 | 195 / 160 |

Reload counters decrease by **2** each logic tick: 120 means 2 seconds, 225 means ceil(112.5) ticks (about 3.77 seconds). The server branch also applies a .9 multiplier to some fire/swap cooldowns, as preserved in Player.fire/swapWeapon. Do not derive full weapon feel from RPM alone.

Other preserved constants: player acceleration .03/tick, gravity .012/tick², terminal downward velocity -.4/tick, lateral velocity damping .64/tick, normal jump impulse .124, climbing jump .06, HP regeneration .1/tick, grenade TTL75 ticks, grenade damage150 and radius3. Grenade throw speed is `.26 * power + .16`; initial local vector `(0,.1,1)` rotated by yaw/pitch; position offset `(0,-.05,.2)` added to player eye base `(x,y+.3,z)`.

Historical release notes retained in `legacy-timeline.md` say CSG-1 102 damage, and v0.20.2 increased its ammunition. The recovered earliest complete bundle actually has 105 damage and 15/60 ammo. This discrepancy is evidence of a nearby patch, not permission to claim those numbers are proved exact 0.20.1.
