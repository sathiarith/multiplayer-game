# 0003: Scaling the game server

Date: 2026-11-08
Status: Accepted

## Context

The game server keeps each game world in the memory of one Node process. Story
6.4 tested what the Socket.IO Redis adapter does when two such servers run,
using real sockets in `server/adapter.test.js` and two real processes with
`server/scripts/try-adapter.js`.

## What the adapter does and does not do

| Question                                                          | Without the adapter    | With the adapter                           |
| ----------------------------------------------------------------- | ---------------------- | ------------------------------------------ |
| Does a broadcast on server A reach clients on server B?           | No                     | Yes                                        |
| Does a player on A appear in B's world?                           | No                     | No: the worlds stay separate               |
| What does a client receive when both servers broadcast snapshots? | Its own server's world | Both worlds, mixed, taking turns           |
| Does a logout on A end the session's sockets on B?                | No                     | Yes                                        |
| Can one character be online on both servers?                      | Yes                    | Yes: the "newest wins" rule is per process |

Sessions are already shared, because they are stored in Redis: a cookie
issued by one server is accepted by the other.

## What lives in each process

| State                                                  | Where it lives today | Shared?                         |
| ------------------------------------------------------ | -------------------- | ------------------------------- |
| The game world (positions, inputs, scores in progress) | Process memory       | No                              |
| Who is online, and the "newest connection wins" rule   | Process memory       | No                              |
| What was last saved for each character                 | Process memory       | No                              |
| Abuse limits for each connection                       | Process memory       | No (and they should stay local) |
| Accounts and characters                                | SQLite file          | Yes, but SQLite is one file     |
| Sessions, rate-limit counters, the leaderboard index   | Redis                | Yes                             |

## Decision

- **One server process owns each world.** To scale the game, run more worlds
  (more maps or regions, each owned by exactly one process), not more copies of
  the same world.
- **The Socket.IO Redis adapter stays off for the game.** `SOCKET_ADAPTER` is
  `none` by default. With it on, every snapshot would reach every server's
  clients, which breaks the game as shown above.
- **The adapter is acceptable for things that should cross servers**, such as
  ending a session's sockets on logout, chat between worlds, or an admin
  dashboard. Those would use their own rooms or namespaces, never the world's.
- **The REST API can scale independently.** It keeps no game state, and its
  state lives in the database and Redis.
- **The WebSocket-only transport means a connection stays on one server for its
  whole life**, so no sticky sessions are needed for the handshake. Players
  reach the right world through routing: an address per world, or a lobby that
  hands out the right server.

## Alternatives considered

- **Sticky sessions plus the adapter.** Keeps a client on one server but does
  not share the world, so players on different servers still cannot see each
  other.
- **Keep the world in Redis.** Every tick would read and write every player,
  and Redis becomes the bottleneck and the single point of failure. It also
  turns a simple loop into a distributed-systems problem.
- **One process per world (chosen).** Simple, fast, and each world fails
  independently.

## Consequences

- A world is a unit of failure: if its process stops, its players disconnect
  (their progress was saved at most 30 seconds earlier).
- Capacity is measured per world. Sprint 10's load test finds how many players
  one world holds before ticks slow down.
- **Sprint 10 (Kubernetes):** replicas serve the REST API. The game server runs
  as one pod per world (a Deployment with one replica, or a StatefulSet for
  several worlds), and is not scaled by adding copies of the same world.
- Moving to PostgreSQL (Sprint 8) removes the single SQLite file as a limit on
  how many processes can write at once.

## Revisit when

A single world needs more players than one process can simulate, or when worlds
must share state (for example a global market or chat). Both need a design
beyond this one.
