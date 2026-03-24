-- Migration 003: Add Gemini File API support and sheet selection
-- Adds gemini_file_uri and selected_sheets to api_document for the new Gemini-native ingestion path.

ALTER TABLE api_document
  ADD COLUMN IF NOT EXISTS gemini_file_uri text,
  ADD COLUMN IF NOT EXISTS selected_sheets text[];

-- New pipeline_status values introduced:
--   pending_sheet_selection  — XLSX uploaded, waiting for user to choose sheets
--   file_ready               — Sheets confirmed, file uploaded to Gemini File API, ready to extract

COMMENT ON COLUMN api_document.gemini_file_uri IS 'URI returned by Gemini File API after uploading the raw file';
COMMENT ON COLUMN api_document.selected_sheets IS 'Sheet names the user selected for AI extraction (XLSX only)';
