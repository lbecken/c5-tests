-- reader-tts schema, migration 1.
--
-- Audio is never stored in the database; rows reference files under the
-- configured runtime directory.

CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    original_text TEXT NOT NULL,
    text_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX idx_documents_created_at ON documents(created_at);

CREATE TABLE sentences (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    sentence_index INTEGER NOT NULL,
    paragraph_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    span_start INTEGER NOT NULL,
    span_end INTEGER NOT NULL,
    terminal_punctuation TEXT,
    UNIQUE(document_id, sentence_index)
);

CREATE INDEX idx_sentences_document ON sentences(document_id, sentence_index);

CREATE TABLE pronunciation_overrides (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL CHECK (scope IN ('global', 'document')),
    document_id TEXT,
    word TEXT NOT NULL,
    phonemes TEXT NOT NULL,
    synthesis_text TEXT,
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(scope, document_id, word)
);

CREATE INDEX idx_overrides_word ON pronunciation_overrides(word);

-- SQLite treats NULLs as distinct in a UNIQUE constraint, so the constraint
-- above does not prevent duplicate global overrides (document_id IS NULL).
-- This expression index enforces uniqueness for both scopes.
CREATE UNIQUE INDEX idx_overrides_identity
    ON pronunciation_overrides(scope, COALESCE(document_id, ''), word);

CREATE TABLE synthesis_jobs (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    voice_id TEXT NOT NULL,
    speed REAL NOT NULL,
    total_units INTEGER NOT NULL,
    completed_units INTEGER NOT NULL,
    failed_units INTEGER NOT NULL,
    cache_hits INTEGER NOT NULL DEFAULT 0,
    synthesized_units INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    error_message TEXT
);

CREATE INDEX idx_jobs_document ON synthesis_jobs(document_id, created_at);

CREATE TABLE sentence_audio (
    sentence_id TEXT NOT NULL REFERENCES sentences(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    cache_key TEXT,
    status TEXT NOT NULL,
    error_message TEXT,
    PRIMARY KEY(sentence_id, chunk_index)
);

CREATE INDEX idx_sentence_audio_cache_key ON sentence_audio(cache_key);

CREATE TABLE audio_cache (
    cache_key TEXT PRIMARY KEY,
    engine TEXT NOT NULL,
    model_id TEXT NOT NULL,
    voice_id TEXT NOT NULL,
    language_code TEXT NOT NULL,
    speed REAL NOT NULL,
    synthesis_text_hash TEXT NOT NULL,
    audio_path TEXT NOT NULL,
    sample_rate INTEGER NOT NULL,
    duration_seconds REAL NOT NULL,
    byte_size INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    last_accessed_at TEXT NOT NULL
);

CREATE INDEX idx_cache_last_accessed ON audio_cache(last_accessed_at);

CREATE TABLE exports (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    scope TEXT NOT NULL,
    status TEXT NOT NULL,
    voice_id TEXT NOT NULL,
    speed REAL NOT NULL,
    file_path TEXT,
    filename TEXT,
    byte_size INTEGER,
    duration_seconds REAL,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    error_message TEXT
);

CREATE INDEX idx_exports_document ON exports(document_id, created_at);

CREATE TABLE application_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
