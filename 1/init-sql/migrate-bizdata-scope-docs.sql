-- 增量：bizdata.scope_docs — Scope 级业务说明（Markdown）

CREATE TABLE IF NOT EXISTS bizdata.scope_docs (
    code VARCHAR(255) PRIMARY KEY,
    content_markdown TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
