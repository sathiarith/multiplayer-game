# PostgreSQL, MySQL and SQL Server, for this game

Tried hands-on on 2026-11-22 with PostgreSQL 18, MySQL 9.7 and SQL Server 2025,
each in a throwaway container, using the scripts in `docs/compare/`.

## What our code relies on, in each database

| What the game needs                 | PostgreSQL 18                                  | MySQL 9.7                                                                           | SQL Server 2025                                                                                                                          |
| ----------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Numbering new rows                  | `GENERATED ALWAYS AS IDENTITY`                 | `AUTO_INCREMENT`                                                                    | `IDENTITY(1, 1)`                                                                                                                         |
| The new row back from an insert     | `RETURNING`                                    | none: `LAST_INSERT_ID()` afterwards, on the same connection                         | `OUTPUT inserted.*`                                                                                                                      |
| Names unique whatever their case    | an index on `lower(name)`; accents still count | the default collation ignores case **and accents**: "Jose" collides with "José"     | the default collation ignores case; accents count                                                                                        |
| An upsert that stops at a limit     | `ON CONFLICT ... DO UPDATE ... WHERE`          | `ON DUPLICATE KEY UPDATE`, condition inside the value; 0 rows changed means refused | `MERGE ... WITH (HOLDLOCK)`; 0 rows changed means refused                                                                                |
| A partial index (the leaderboard)   | yes                                            | **no**: only a full index on `(score DESC, id)`                                     | yes: a filtered index, which needs the session setting `QUOTED_IDENTIFIER ON` (on in most drivers and tools, off by default in `sqlcmd`) |
| Schema changes inside a transaction | rolled back                                    | **committed at once**: `ROLLBACK` left the table behind                             | rolled back                                                                                                                              |
| Locking a row                       | `SELECT ... FOR UPDATE`                        | `SELECT ... FOR UPDATE`                                                             | the hint `WITH (UPDLOCK, ROWLOCK)`                                                                                                       |
| A named lock (the migration runner) | `pg_advisory_lock`                             | `GET_LOCK`                                                                          | `sp_getapplock`                                                                                                                          |
| Placeholders in the Node driver     | `$1, $2` (`pg`)                                | `?` (`mysql2`)                                                                      | `@name` (`mssql`)                                                                                                                        |
| A time with its time zone           | `timestamptz`                                  | `TIMESTAMP` (stored as UTC) or `DATETIME`                                           | `datetimeoffset`                                                                                                                         |
| Licence                             | PostgreSQL Licence (permissive, free)          | Community edition GPLv2 (Oracle); paid Enterprise edition                           | proprietary: free Developer and Express editions with limits; paid Standard and Enterprise                                               |

The first eight rows were confirmed by running the scripts. The last three
(placeholders, time zones and licences) come from each project's documentation,
and licence terms in particular change: check the vendors' current terms before
relying on them.

## Two lessons from running the scripts

**State the text encoding.** The first MySQL run stored "José" as garbled text,
without any error, because the client inside the container guessed the wrong
character encoding: it read the two UTF-8 bytes of "é" as two separate
characters. Running it again with `--default-character-set=utf8mb4` stored it
correctly, and "Jose" then collided with "José" as expected.
`SELECT HEX(username)` showed the difference (`C3A9` for a correct "é",
`C383C2A9` when garbled). Always state the encoding when moving text between
programs.

**Know the session settings.** SQL Server refused the filtered index at first,
because `sqlcmd` leaves the old `QUOTED_IDENTIFIER` setting off, and filtered
indexes require it on. Adding `SET QUOTED_IDENTIFIER ON` to the script fixed it.
Most drivers and tools turn it on automatically, which is why this rarely shows
up in application code.

In both cases the database did exactly what its defaults said. The surprises
came from defaults nobody had looked at.

## What moving this game would take

The async interface from Story 8.2 keeps every query behind `server/database.js`,
so the driver change happens in one file. The SQL itself would still change:

- **MySQL:** every `RETURNING` (creating users and characters, `addItem` and
  `removeItem`) becomes a second query; the `lower(...)` indexes become plain
  `UNIQUE` columns relying on the collation, which also makes usernames collide
  across accents, a behaviour change players would notice; the leaderboard index
  loses its `WHERE`; and the migration runner could no longer promise that a
  failed migration leaves nothing behind.
- **SQL Server:** `RETURNING` becomes `OUTPUT`; the `lower(...)` indexes become
  plain `UNIQUE` columns relying on the case-insensitive collation; the upserts
  become `MERGE` statements, which need `HOLDLOCK` to be safe under concurrency;
  `FOR UPDATE` becomes a table hint; and placeholders become named parameters.

## Why PostgreSQL for this game

It supports everything the game's correctness depends on, natively:
`RETURNING`, conditional upserts, partial indexes, transactional schema
changes, and advisory locks. It is free under a permissive licence, and runs
the same in a container on any machine.

## When I would choose the others

- **MySQL:** when the hosting or the team already runs it. It is offered almost
  everywhere, is well understood, and has mature replication.
- **SQL Server:** in a Microsoft environment: .NET applications, Azure, Windows
  authentication, and its tooling (SQL Server Management Studio, built-in
  reporting).

## How to run the comparison again

Each database runs in a throwaway container, removed when stopped. The scripts
are copied into the container first, so their accented characters arrive intact.

PostgreSQL (on the test container):

    docker exec game-postgres-test psql -U game -d postgres -c "CREATE DATABASE compare"
    docker cp docs/compare/postgres.sql game-postgres-test:/tmp/postgres.sql
    docker exec game-postgres-test psql -U game -d compare -f /tmp/postgres.sql
    docker exec game-postgres-test psql -U game -d postgres -c "DROP DATABASE compare"

MySQL (repeat the `ping` until it says `mysqld is alive`):

    docker run -d --rm --name compare-mysql -e MYSQL_ROOT_PASSWORD=compare-only -e MYSQL_DATABASE=game mysql:9.7
    docker exec compare-mysql mysqladmin ping -uroot -pcompare-only
    docker cp docs/compare/mysql.sql compare-mysql:/tmp/mysql.sql
    docker exec compare-mysql sh -c "mysql -uroot -pcompare-only --force --table --default-character-set=utf8mb4 game < /tmp/mysql.sql"

SQL Server (repeat the search until it prints the "ready" line):

    docker run -d --rm --name compare-mssql -e "ACCEPT_EULA=Y" -e "MSSQL_SA_PASSWORD=Compare-only-1" -e "MSSQL_PID=EnterpriseDeveloper" mcr.microsoft.com/mssql/server:2025-latest
    docker logs compare-mssql 2>&1 | Select-String "ready for client connections"
    docker cp docs/compare/sqlserver.sql compare-mssql:/tmp/sqlserver.sql
    docker exec compare-mssql /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "Compare-only-1" -C -f 65001 -i /tmp/sqlserver.sql

Clean up with `docker stop compare-mysql compare-mssql`, and free the disk space
of the two images with `docker rmi mysql:9.7 mcr.microsoft.com/mssql/server:2025-latest`.
The passwords here are for these throwaway containers only.
