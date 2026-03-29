-- Add 'request_header' and 'response_header' to message_type_enum
ALTER TYPE message_type_enum ADD VALUE IF NOT EXISTS 'request_header';
ALTER TYPE message_type_enum ADD VALUE IF NOT EXISTS 'response_header';

-- Create document_variable table
CREATE TABLE document_variable (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES api_document(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    data_type TEXT,
    is_enum BOOLEAN DEFAULT FALSE,
    value TEXT,
    enum_values JSONB DEFAULT '[]'::jsonb,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient lookup by document
CREATE INDEX document_variable_doc_idx ON document_variable(document_id);

-- Attach set_updated_at trigger
CREATE TRIGGER document_variable_updated_at
    BEFORE UPDATE ON document_variable
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Add document_variable_id reference to api_field
ALTER TABLE api_field ADD COLUMN document_variable_id UUID REFERENCES document_variable(id) ON DELETE SET NULL;
