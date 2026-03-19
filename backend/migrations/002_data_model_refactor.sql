-- ============================================================
-- Migration 002: Data Model Refactor + Pipeline Support
-- ============================================================
-- Changes:
--   1. Fix flow → api_document FK to CASCADE (was SET NULL)
--   2. Move api parent from api_document → flow
--   3. Add pipeline fields to api_document

-- ─── 1. Fix flow cascade delete ───────────────────────────────
ALTER TABLE flow DROP CONSTRAINT IF EXISTS flow_document_id_fkey;
ALTER TABLE flow
    ADD CONSTRAINT flow_document_id_fkey
    FOREIGN KEY (document_id) REFERENCES api_document(id) ON DELETE CASCADE;

-- ─── 2. Move api under flow ────────────────────────────────────
-- Add flow_id column
ALTER TABLE api ADD COLUMN flow_id uuid REFERENCES flow(id) ON DELETE CASCADE;

-- For any existing apis, try to find their flow via flow_step and assign flow_id.
-- Orphaned apis (not in any flow_step) will have flow_id = NULL temporarily.
UPDATE api a
SET flow_id = fs.flow_id
FROM flow_step fs
WHERE fs.api_id = a.id;

-- Remove old document_id column
ALTER TABLE api DROP COLUMN IF EXISTS document_id;

-- Index for the new FK
CREATE INDEX IF NOT EXISTS api_flow_idx ON api(flow_id);

-- ─── 3. Add pipeline fields to api_document ────────────────────
ALTER TABLE api_document
    ADD COLUMN IF NOT EXISTS pipeline_status text DEFAULT 'complete';
-- values: 'markdown_ready' | 'extracting' | 'extraction_review' | 'complete'

ALTER TABLE api_document
    ADD COLUMN IF NOT EXISTS parser text DEFAULT 'markitdown';

ALTER TABLE api_document
    ADD COLUMN IF NOT EXISTS extraction_draft jsonb;
-- stores raw AI output (flows + apis) before user approval
