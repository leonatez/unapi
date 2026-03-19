-- ============================================================
-- API Contract Intelligence Platform — Initial Schema
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ─── ENUM types ──────────────────────────────────────────────

create type owner_enum as enum ('Monee', 'Bank');
create type http_method_enum as enum ('GET', 'POST', 'PUT', 'PATCH', 'DELETE');
create type message_type_enum as enum ('request', 'response');
create type edge_action_enum as enum ('retry', 'inquiry', 'next_step', 'fail', 'end_flow');
create type sig_location_enum as enum ('header', 'body');
create type diff_severity_enum as enum ('breaking', 'risky', 'info');

-- ─── SECURITY PROFILE ────────────────────────────────────────

create table security_profile (
    id              uuid primary key default gen_random_uuid(),
    auth_type       text,                    -- "Bearer", "API key"
    algorithm       text,                    -- "SHA256withRSA"
    signed_fields   text[],                  -- ordered list
    sig_location    sig_location_enum,
    token_source_api text,
    created_at      timestamptz default now()
);

-- ─── API DOCUMENT ────────────────────────────────────────────

create table api_document (
    id               uuid primary key default gen_random_uuid(),
    name             text not null,
    owner            owner_enum not null,    -- Monee | Bank
    partner_name     text,
    flow_name        text,
    version          text,
    doc_date         text,
    raw_format       text not null,          -- docx | xlsx | md | pdf
    raw_storage_path text,                   -- path/URL to original file
    markdown_content text,                   -- intermediate Markdown
    created_at       timestamptz default now(),
    updated_at       timestamptz default now()
);

-- ─── API ─────────────────────────────────────────────────────

create table api (
    id                  uuid primary key default gen_random_uuid(),
    document_id         uuid not null references api_document(id) on delete cascade,
    name                text not null,
    description         text,
    method              http_method_enum,
    path                text,
    exposed_by          owner_enum not null,  -- Monee | Bank
    is_idempotent       boolean default false,
    security_profile_id uuid references security_profile(id),
    confidence_score    numeric(4,3) default 1.0,
    created_at          timestamptz default now()
);

create index api_document_idx on api(document_id);
create index api_name_idx on api(name);

-- ─── API MESSAGE (request / response) ────────────────────────

create table api_message (
    id           uuid primary key default gen_random_uuid(),
    api_id       uuid not null references api(id) on delete cascade,
    message_type message_type_enum not null,
    example_json text,
    created_at   timestamptz default now()
);

create index api_message_api_idx on api_message(api_id);

-- ─── API FIELD ───────────────────────────────────────────────

create table api_field (
    id               uuid primary key default gen_random_uuid(),
    message_id       uuid not null references api_message(id) on delete cascade,
    parent_field_id  uuid references api_field(id),  -- for nested objects
    name             text not null,
    description      text,
    data_type        text,
    max_length       integer,
    is_required      boolean default false,
    default_value    text,
    constraints      text,
    is_encrypted     boolean default false,   -- field-level encryption flag
    is_deprecated    boolean default false,   -- strikethrough in source doc
    confidence_score numeric(4,3) default 1.0,
    created_at       timestamptz default now()
);

create index api_field_message_idx on api_field(message_id);
create index api_field_parent_idx on api_field(parent_field_id);

-- ─── API FIELD ENUM ──────────────────────────────────────────

create table api_field_enum (
    id       uuid primary key default gen_random_uuid(),
    field_id uuid not null references api_field(id) on delete cascade,
    value    text not null,
    label    text
);

create index api_field_enum_field_idx on api_field_enum(field_id);

-- ─── API ERROR ───────────────────────────────────────────────
-- Stores the resultStatus + resultCode + resultMessage triplet

create table api_error (
    id               uuid primary key default gen_random_uuid(),
    api_id           uuid not null references api(id) on delete cascade,
    http_status      integer,                -- 200, 400, 500 …
    result_status    text,                   -- "SENTOTP-FAILED", "VERIOTP-SUCCESS"
    result_code      text,                   -- "2007", "200"
    result_message   text,                   -- human-readable
    condition        text,                   -- when this error occurs
    confidence_score numeric(4,3) default 1.0,
    created_at       timestamptz default now()
);

create index api_error_api_idx on api_error(api_id);

-- ─── FLOW ────────────────────────────────────────────────────

create table flow (
    id             uuid primary key default gen_random_uuid(),
    document_id    uuid references api_document(id) on delete set null,
    name           text not null,
    description    text,
    mermaid_source text,
    created_at     timestamptz default now()
);

-- ─── FLOW STEP ───────────────────────────────────────────────

create table flow_step (
    id         uuid primary key default gen_random_uuid(),
    flow_id    uuid not null references flow(id) on delete cascade,
    step_order integer not null,
    label      text not null,
    actor_from text,
    actor_to   text,
    api_id     uuid references api(id) on delete set null
);

create index flow_step_flow_idx on flow_step(flow_id);

-- ─── EDGE CASE ───────────────────────────────────────────────

create table edge_case (
    id                  uuid primary key default gen_random_uuid(),
    api_id              uuid not null references api(id) on delete cascade,
    error_id            uuid references api_error(id) on delete set null,
    condition           text,
    action              edge_action_enum not null,
    retry_max           integer,
    retry_interval_sec  integer,
    next_api_id         uuid references api(id) on delete set null,
    notes               text,
    created_at          timestamptz default now()
);

create index edge_case_api_idx on edge_case(api_id);

-- ─── ENVIRONMENT ─────────────────────────────────────────────

create table environment (
    id          uuid primary key default gen_random_uuid(),
    document_id uuid references api_document(id) on delete cascade,
    name        text not null,   -- "UAT", "Production"
    base_url    text,
    notes       text
);

-- ─── DIFF RESULT ─────────────────────────────────────────────
-- Stores comparison results between two api_documents

create table diff_result (
    id              uuid primary key default gen_random_uuid(),
    doc_a_id        uuid not null references api_document(id),  -- internal
    doc_b_id        uuid not null references api_document(id),  -- partner
    api_name        text,
    field_path      text,                -- e.g. "body.personIdNo"
    aspect          text,                -- "type", "required", "enum", "presence"
    value_a         text,
    value_b         text,
    severity        diff_severity_enum not null,
    notes           text,
    created_at      timestamptz default now()
);

create index diff_doc_pair_idx on diff_result(doc_a_id, doc_b_id);

-- ─── Updated_at trigger helper ────────────────────────────────

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger api_document_updated_at
    before update on api_document
    for each row execute function set_updated_at();
