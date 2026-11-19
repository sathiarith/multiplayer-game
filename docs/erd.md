# Database schema

PostgreSQL 18. Created by the migrations in `server/pg/migrations/`.

```mermaid
erDiagram
  users ||--o{ characters : owns
  characters ||--o{ inventory : carries
  items ||--o{ inventory : "is carried as"

  users {
    integer id PK "identity"
    text username UK "unique whatever its case"
    text password_hash "bcrypt"
    timestamptz created_at
  }
  characters {
    integer id PK "identity"
    integer user_id FK
    text name UK "unique whatever its case"
    text class
    integer level
    integer xp
    integer hp
    integer score "indexed, for the leaderboard"
    double_precision pos_x
    double_precision pos_y
    timestamptz created_at
  }
  items {
    integer id PK "identity"
    text code UK
    text name
    text description
  }
  inventory {
    integer character_id PK, FK
    integer item_id PK, FK
    integer quantity "1 to 9999"
  }
  levels {
    integer level PK
    integer xp_required UK
    integer max_hp
  }
```

`levels` stands alone: it is the XP table, read once at startup. Sessions,
rate-limit counters and the leaderboard index live in Redis, not here.
"Unique whatever its case" is an index on `lower(...)`, so "Alice" and
"alice" are the same name.