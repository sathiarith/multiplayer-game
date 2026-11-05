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
- **Logging out** closes every connection that belongs to that session.

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

| Event      | Direction        | Payload                                                   | Validated by                                   |
| ---------- | ---------------- | --------------------------------------------------------- | ---------------------------------------------- |
| `input`    | client to server | `{ seq, up, down, left, right }`                          | The server (`parseInput` in `server/world.js`) |
| `welcome`  | server to client | `{ character, you, tickRate }`                            | The client trusts the server                   |
| `snapshot` | server to client | `{ tick, players: [{ id, name, x, y, hp, maxHp, ack }] }` | The client trusts the server                   |
| `replaced` | server to client | none                                                      | The client trusts the server                   |
| `kicked`   | server to client | `{ reason }`                                              | The client trusts the server                   |

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

### `snapshot`

Sent to every player on every tick. A player who joins or leaves appears in or
disappears from the list, so there are no separate events for that.
`ack` is the last input `seq` the server applied for that player. The client
uses it to replay the inputs the server has not seen yet.

### `replaced`

Another connection took over this character. The client should stop the game
and offer a way back in.

### `kicked`

The server is about to close the connection because of too many violations
(see Limits). `reason` is always `too_many_messages`.

## Limits

| Limit                        | Value                  |
| ---------------------------- | ---------------------- |
| Tick rate                    | 20 per second          |
| Maximum message size         | 1024 bytes             |
| Sustained message rate       | 40 per second          |
| Burst allowance              | 60 messages            |
| Violations before disconnect | 20 in 10 seconds       |
| Input released after         | 20 ticks without input |

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

## What the client does

These parts are not enforced by the server, but the server's behavior is
designed around them.

- It predicts its own character with the same movement code as the server, and
  corrects itself when a snapshot disagrees.
- It draws other players about 100 ms in the past, blended between two
  snapshots.
- It does not reconnect by itself after `replaced`, `kicked`, or a refusal.
