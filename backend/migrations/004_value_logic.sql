-- Migration 004: Add value_logic field to api_field
-- Stores sample values, fixed values, or conditional logic for a parameter.
-- Examples: "e.g. VCB001", "Fixed: 'PAYMENT'", "If type=A then X; if type=B then Y"

ALTER TABLE api_field
  ADD COLUMN IF NOT EXISTS value_logic text;

COMMENT ON COLUMN api_field.value_logic IS 'Sample value, fixed value, or conditional value/logic for this field (e.g. "e.g. VCB001", "Fixed: PAYMENT", "If A then X; if B then Y")';
