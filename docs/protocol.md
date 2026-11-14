# Game protocol

How the browser and the game server talk over a WebSocket. The REST API is
described in `docs/openapi.yaml`. A test (`server/protocol.test.js`) checks
that this page lists every event and states the same limits as the code.

## Connecting

- **Address:** the same origin as the page, path `/socket.io/`. In development
  the Vite dev server forwards it to the API.
- **Transport:** WebSocket only, with no HTTP polling.
- **Who you are:** the session cookie (`sid`) identifies the user. The client
  sends `{ characterId }` in the handshake `auth` option. The user always comes
  from the session, and never from anything the client sends.
- **Origin:** the `Origin` header must be on the server's allowlist
  (`ALLOWED_ORIGINS`). A request with no `Origin` (not a browser) is allowed.
  Anything else is rejected before the connection opens.
- **One connection per character.** A newer connection replaces the older one,
  which is told with `replaced` and closed. The player keeps their place in
  the world.
- **Logging out**, or logging in again in the same browser, closes every connection that belonged to the old session.
- One server owns each world. See `docs/decisions/0003-scaling-the-game-server.md`.

## Refusals

A refused connection arrives at the client as `connect_error`, with a code in
`error.data.code`. A character that is not yours looks exactly like one that
does not exist.

| Code                | Meaning                                              |
| ------------------- | ---------------------------------------------------- |
| `not_authenticated` | There is no valid session. Log in first.             |
| `not_found`         | No such character, or it belongs to someone else.    |
| `internal_error`    | The server could not check the handshake. Try again. |

## Events

| Event             | Direction        | Payload                                                                                                                                                 | Validated by                                                                                 |
| ----------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `input`           | client to server | `{ seq, up, down, left, right }`                                                                                                                        | The server (`parseInput` in `server/world.js`)                                               |
| `welcome`         | server to client | `{ character, you, tickRate, inventory, catalog, levels }`                                                                                              | The client trusts the server                                                                 |
| `snapshot`        | server to client | `{ tick, players: [{ id, name, x, y, hp, maxHp, level, attacking, ack }], items: [...], monsters: [{ id, type, x, y, hp, maxHp, facing, attacking }] }` | The client trusts the server                                                                 |
| `replaced`        | server to client | none                                                                                                                                                    | The client trusts the server                                                                 |
| `kicked`          | server to client | `{ reason }`                                                                                                                                            | The client trusts the server                                                                 |
| `chat`            | client to server | `{ text }`                                                                                                                                              | The server (`parseChat` in `server/chat.js`)                                                 |
| `chat`            | server to client | `{ id, from: { id, name }, text, at }`                                                                                                                  | The client trusts the server, and escapes the text when showing it                           |
| `chat_rejected`   | server to client | `{ reason }`                                                                                                                                            | The client trusts the server                                                                 |
| `pickup`          | client to server | `{ id }`                                                                                                                                                | The server (`parsePickup` in `server/loot.js`, range and availability in `server/world.js`)  |
| `inventory`       | server to client | `{ items: [{ code, name, description, quantity }] }`                                                                                                    | The client trusts the server                                                                 |
| `pickup_rejected` | server to client | `{ reason }`                                                                                                                                            | The client trusts the server                                                                 |
| `trade_offer`     | client to server | `{ to, give: [{ code, quantity }], want: [{ code, quantity }] }`                                                                                        | The server (`parseOffer` in `server/offers.js`)                                              |
| `trade_accept`    | client to server | `{ id }`                                                                                                                                                | The server: only the receiver                                                                |
| `trade_decline`   | client to server | `{ id }`                                                                                                                                                | The server: only the receiver                                                                |
| `trade_cancel`    | client to server | `{ id }`                                                                                                                                                | The server: only the sender                                                                  |
| `trade_offered`   | server to client | `{ id, from: { id, name }, give, want, expiresAt }`                                                                                                     | The client trusts the server                                                                 |
| `trade_sent`      | server to client | `{ id, to: { id, name }, give, want, expiresAt }`                                                                                                       | The client trusts the server                                                                 |
| `trade_result`    | server to client | `{ id, ok, reason }`                                                                                                                                    | The client trusts the server                                                                 |
| `attack`          | client to server | none, or `{}`                                                                                                                                           | The server (`parseAttack` in `server/monsters.js`; target and cooldown in `server/world.js`) |
| `attack_rejected` | server to client | `{ reason }`                                                                                                                                            | The client trusts the server                                                                 |
| `progress`        | server to client | `{ level, xp, leveledUp }`                                                                                                                              | The client trusts the server                                                                 |
| `died`            | server to client | `{ by }`                                                                                                                                                | The client trusts the server                                                                 |

### `input`

The keys currently held, sent by the client at the tick rate while any key is
held, and once when the keys change. The client never sends a position.

- Exactly these five fields, and no others.
- `seq`: an integer from 1 to 2,147,483,647. It starts at 1 on each
  connection and must be higher than the last one the server applied. An input
  that is not newer is ignored, without penalty.
- `up`, `down`, `left`, `right`: booleans.

### `welcome`

Sent once after the handshake. `character` is the saved character, `you` is
its id, and `tickRate` is the server's steps per second.
`inventory` is what the character carries, in the same shape as the `inventory` event’s `items`.
`catalog` lists every item that exists, as `[{ code, name }]`.
`levels` is the XP table: `[{ level, xpRequired, maxHp }]`.

### `snapshot`

Sent to every player on every tick. A player who joins or leaves appears in or
disappears from the list, so there are no separate events for that.
`ack` is the last input `seq` the server applied for that player. The client
uses it to replay the inputs the server has not seen yet.
`items` lists the items lying on the map. A picked-up item is missing until it comes back.
`monsters` lists the living monsters. `facing` is `-1` (left) or `1` (right), and `attacking` is true for a moment after a strike.
A player’s `attacking` is true for a moment after the server accepts their attack.

### `replaced`

Another connection took over this character. The client should stop the game
and offer a way back in.

### `kicked`

The server is about to close the connection because of too many violations
(see Limits). `reason` is always `too_many_messages`.

### `chat`

From a client: exactly `{ text }`, where `text` is a string. The server trims
it, and refuses it as `invalid` if it is empty, longer than the limit (counted
in characters, not bytes), or contains control characters or Unicode
direction controls. Anything that is not exactly `{ text: string }` is a
violation. An accepted message goes to every player within the chat range,
the speaker included, as `{ id, from: { id, name }, text, at }`, where `at` is
the server's time. The server does not remove HTML: a client must show the
text as text, never as markup.

### `chat_rejected`

Only to the sender, when a message was not delivered. `reason` is `invalid`
(empty, too long, or forbidden characters) or `too_fast` (over the chat rate).
Neither counts as a violation.

### `pickup`

From a client: exactly `{ id }`, the id of an item in the latest snapshot.
The server checks that the item is still there and that the character is
within the pickup range, then adds it to the inventory in the database, and
only then removes it from the map. Anything that is not exactly `{ id }` with
a positive whole number is a violation.

### `inventory`

Only to the character who changed: everything it now carries. Sent after a
successful pickup.

### `pickup_rejected`

Only to the sender. `reason` is `gone` (taken already, or no such item),
`too_far` (out of range), `full` (the stack is at its limit) or `error` (the
server could not save it). None of these is a violation.

### Trading

A player offers items to one nearby player with `trade_offer`: `give` and
`want` each list up to 4 different items, and at least one of them is not
empty (a gift wants nothing). The receiver gets `trade_offered` and the sender
`trade_sent`, both with the item names. The receiver answers with
`trade_accept` or `trade_decline`, and the sender may `trade_cancel`. An offer
is answered once and expires after its lifetime.

Accepting runs the trade in one database transaction: every quantity is
checked at that moment, and either every item moves or none does. Both players
then get `trade_result` and, after a success, their new `inventory`.

`trade_result` is `{ id, ok: true }` for a completed trade, or
`{ id, ok: false, reason }`. When an offer is refused before it exists, `id`
is `null`. The reasons are `invalid` (to yourself, or an unknown item),
`not_here` (the other player is not playing), `too_far`, `missing_items`,
`too_many_offers`, `full` (the receiver cannot carry that many), `gone` (no
such offer for you: answered, expired, withdrawn, or not yours), `declined`,
`cancelled`, and `error`. None of these is a violation, but a malformed trade
message is.

### Combat

`attack` names no target. The server checks the attack cooldown, then hits
the nearest monster within reach. A refusal comes back as `attack_rejected`,
with `reason` `cooldown` or `no_target`, and is not a violation; a miss does
not use up the cooldown. A kill sends `progress` to the attacker, with the new
level and XP. The XP earned is also the leaderboard score.

Monsters strike the nearest player within their reach on their own cooldown.
A player whose health reaches zero is sent `died` (with the monster's name)
and returns to the spawn point with full health, keeping level, XP, score and
items. Cooldowns use world time, counted in game ticks.

## Limits

| Limit                        | Value                                      |
| ---------------------------- | ------------------------------------------ |
| Tick rate                    | 20 per second                              |
| Maximum message size         | 1024 bytes                                 |
| Sustained message rate       | 40 per second                              |
| Burst allowance              | 60 messages                                |
| Violations before disconnect | 20 in 10 seconds                           |
| Input released after         | 20 ticks without input                     |
| Progress saved               | every 30 seconds, and when a player leaves |
| Chat message length          | 200 characters                             |
| Chat messages per person     | 5 per 10 seconds                           |
| Chat range                   | 320 pixels (8 tiles)                       |
| Pickup range                 | 48 pixels                                  |
| Item respawn                 | 30 seconds                                 |
| Most of one item             | 9999                                       |
| Trade range                  | 96 pixels                                  |
| Trade offer lifetime         | 30 seconds                                 |
| Open offers per player       | 3                                          |
| Items per side of a trade    | 4                                          |
| Attack reach                 | 48 pixels                                  |
| Attack cooldown              | 800 milliseconds                           |

- **Message size:** a message over the limit closes the connection at once.
- **Rate:** every message costs one token, and tokens come back at the
  sustained rate up to the burst allowance. A message that arrives with no
  token left is dropped, and counts as a violation.
- **Violations:** a message over the rate, an event the server does not know,
  or an `input` that is malformed. When the limit is reached the client gets
  `kicked` and is disconnected. It can connect again, with a fresh count.
- **Silence:** if a client stops sending input for the time above, the server
  releases all its keys, so a player who loses their connection does not run
  into a wall forever.
- **Saving:** the server writes each player's position and health to the
  database every 30 seconds (only if they changed) and when the player leaves,
  so a crash loses at most 30 seconds. A client cannot send a position, and
  there is no REST endpoint that accepts one.

## What the client does

These parts are not enforced by the server, but the server's behavior is
designed around them.

- It predicts its own character with the same movement code as the server, and
  corrects itself when a snapshot disagrees.
- It draws other players about 100 ms in the past, blended between two
  snapshots.
- It does not reconnect by itself after `replaced`, `kicked`, or a refusal.
- It sends chat as volatile, so a message typed while disconnected is dropped, not delivered late. It shows only messages the server echoed back.
- It lists trading partners from the snapshots, within the trade range, and
  counts an offer down from its `expiresAt`. The server checks both again.
- Space sends `attack` once per press. The client never chooses a target. Monsters are drawn from the newest snapshot, without prediction or blending.
