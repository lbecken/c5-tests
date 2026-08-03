-- reader-tts schema, migration 2: multiple languages.
--
-- Existing rows were created when English was the only language, so both new
-- columns default to the values those rows already implied. No data is
-- rewritten and nothing that worked before changes behaviour.

ALTER TABLE documents ADD COLUMN language TEXT NOT NULL DEFAULT 'en-us';

-- A pronunciation is written in ARPAbet for English and IPA for French. The
-- notation must be recorded, because the two are parsed differently.
ALTER TABLE pronunciation_overrides
    ADD COLUMN notation TEXT NOT NULL DEFAULT 'arpabet';

CREATE INDEX idx_documents_language ON documents(language);
