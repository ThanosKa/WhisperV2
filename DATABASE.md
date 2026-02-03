# Database Documentation

WhisperV2 uses SQLite for local data storage. The database is fully managed by the app and requires no manual setup.

## Overview

- **Engine**: SQLite (via `better-sqlite3`)
- **Location**: `~/.whisper/whisper.db`
- **Initialization**: Automatic on first run
- **Migrations**: Auto-sync schema on startup

## Database Location

| Platform | Path |
|----------|------|
| macOS    | `~/.whisper/whisper.db` |
| Windows  | `C:\Users\<username>\.whisper\whisper.db` |
| Linux    | `~/.whisper/whisper.db` |

## Schema

The database has the following tables:

### users

Stores user profile information.

| Column | Type | Description |
|--------|------|-------------|
| uid | TEXT PRIMARY KEY | User unique identifier |
| display_name | TEXT NOT NULL | Display name |
| email | TEXT NOT NULL | Email address |
| created_at | INTEGER | Unix timestamp |
| auto_update_enabled | INTEGER | Auto-update preference (1/0) |

### sessions

Stores conversation/meeting sessions.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PRIMARY KEY | Session UUID |
| uid | TEXT NOT NULL | User ID |
| title | TEXT | Session title |
| session_type | TEXT | Type: 'ask' or 'listen' |
| started_at | INTEGER | Start timestamp |
| ended_at | INTEGER | End timestamp |
| sync_state | TEXT | Sync status |
| updated_at | INTEGER | Last update timestamp |

### transcripts

Stores speech-to-text transcriptions.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PRIMARY KEY | Transcript UUID |
| session_id | TEXT NOT NULL | Parent session ID |
| start_at | INTEGER | Start time (ms) |
| end_at | INTEGER | End time (ms) |
| speaker | TEXT | Speaker identifier |
| text | TEXT | Transcribed text |
| lang | TEXT | Language code |
| created_at | INTEGER | Creation timestamp |
| sync_state | TEXT | Sync status |

### ai_messages

Stores AI conversation messages.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PRIMARY KEY | Message UUID |
| session_id | TEXT NOT NULL | Parent session ID |
| sent_at | INTEGER | Send timestamp |
| role | TEXT | 'user' or 'assistant' |
| content | TEXT | Message content |
| tokens | INTEGER | Token count |
| model | TEXT | AI model used |
| created_at | INTEGER | Creation timestamp |
| sync_state | TEXT | Sync status |

### summaries

Stores AI-generated session summaries.

| Column | Type | Description |
|--------|------|-------------|
| session_id | TEXT PRIMARY KEY | Session ID |
| generated_at | INTEGER | Generation timestamp |
| model | TEXT | AI model used |
| text | TEXT | Full summary text |
| tldr | TEXT | Short summary |
| bullet_json | TEXT | Bullet points (JSON) |
| action_json | TEXT | Action items (JSON) |
| tokens_used | INTEGER | Tokens consumed |
| updated_at | INTEGER | Last update timestamp |
| sync_state | TEXT | Sync status |

### prompt_presets

Stores custom prompt templates.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PRIMARY KEY | Preset ID |
| uid | TEXT NOT NULL | Owner user ID |
| title | TEXT NOT NULL | Preset name |
| prompt | TEXT NOT NULL | Prompt template |
| is_default | INTEGER | Default preset flag |
| created_at | INTEGER | Creation timestamp |
| sync_state | TEXT | Sync status |
| append_text | TEXT | Appended text |

### provider_settings

Stores AI provider configuration.

| Column | Type | Description |
|--------|------|-------------|
| provider | TEXT PRIMARY KEY | Provider name |
| selected_llm_model | TEXT | Active LLM model |
| selected_stt_model | TEXT | Active STT model |
| is_active_llm | INTEGER | LLM enabled flag |
| is_active_stt | INTEGER | STT enabled flag |
| created_at | INTEGER | Creation timestamp |
| updated_at | INTEGER | Last update |

### shortcuts

Stores keyboard shortcut customizations.

| Column | Type | Description |
|--------|------|-------------|
| action | TEXT PRIMARY KEY | Action identifier |
| accelerator | TEXT NOT NULL | Key combination |
| created_at | INTEGER | Creation timestamp |

### session_insights

Stores real-time analysis during Listen sessions.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PRIMARY KEY | Insight UUID |
| session_id | TEXT NOT NULL | Parent session ID |
| analysis_round | INTEGER NOT NULL | Analysis iteration |
| payload_json | TEXT NOT NULL | Analysis data (JSON) |
| created_at | INTEGER NOT NULL | Creation timestamp |

## Default Data

On first run, the app initializes:

1. **Default user**: `default_user`
2. **Default presets**: School, Meetings, Sales, Recruiting, Customer Support

## Schema Synchronization

The app automatically handles schema updates:

1. On startup, compares current DB schema to `LATEST_SCHEMA`
2. Creates missing tables
3. Adds missing columns to existing tables
4. Preserves existing data

See `src/features/common/services/sqliteClient.js` for implementation.

## Manual Operations

### Resetting the Database

Delete the database file to start fresh:

```bash
# macOS/Linux
rm -rf ~/.whisper/whisper.db*

# Windows (PowerShell)
Remove-Item -Path "$env:USERPROFILE\.whisper\whisper.db*" -Force
```

### Accessing the Database Directly

```bash
# Using sqlite3 CLI
sqlite3 ~/.whisper/whisper.db

# List tables
.tables

# View schema
.schema sessions

# Query data
SELECT * FROM sessions LIMIT 10;
```

### Backup

```bash
# Simple copy
cp ~/.whisper/whisper.db ~/.whisper/whisper.db.backup

# While app is running (uses WAL mode)
sqlite3 ~/.whisper/whisper.db ".backup ~/.whisper/whisper.db.backup"
```

## Development Notes

- **WAL Mode**: Database uses Write-Ahead Logging for better concurrency
- **Connection**: Single connection managed by `sqliteClient` singleton
- **Thread Safety**: better-sqlite3 is synchronous, no async issues
- **File Locking**: Standard SQLite locking applies

## Troubleshooting

### "Database is locked" errors

Usually caused by another process accessing the DB. Close other instances of the app.

### "Disk I/O error"

Check disk space and permissions on `~/.whisper/` directory.

### Corrupted database

Reset by deleting the database files:
```bash
rm -rf ~/.whisper/whisper.db*
```
