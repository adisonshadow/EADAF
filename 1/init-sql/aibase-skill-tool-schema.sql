-- AIBase Skill / Tool / Scope Schema

CREATE TABLE IF NOT EXISTS aibase.scopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS aibase.tools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_id UUID NOT NULL REFERENCES aibase.scopes(id),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    function_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    execution_type VARCHAR(20) NOT NULL CHECK (execution_type IN ('client', 'server_http', 'server_builtin')),
    parameters_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
    review_markdown TEXT,
    server_config JSONB,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tools_scope_id ON aibase.tools(scope_id);
CREATE INDEX IF NOT EXISTS idx_tools_execution_type ON aibase.tools(execution_type);

CREATE TABLE IF NOT EXISTS aibase.skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_id UUID REFERENCES aibase.scopes(id),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    content_markdown TEXT NOT NULL DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_global BOOLEAN NOT NULL DEFAULT false,
    is_dedicated BOOLEAN NOT NULL DEFAULT false,
    completion_strategy JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_skills_scope_id ON aibase.skills(scope_id);

CREATE TABLE IF NOT EXISTS aibase.skill_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_id UUID NOT NULL REFERENCES aibase.skills(id) ON DELETE CASCADE,
    application_id UUID NOT NULL REFERENCES eadaf.applications(application_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(skill_id, application_id)
);

CREATE INDEX IF NOT EXISTS idx_skill_applications_skill_id ON aibase.skill_applications(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_applications_application_id ON aibase.skill_applications(application_id);

CREATE TABLE IF NOT EXISTS aibase.skill_tools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_id UUID NOT NULL REFERENCES aibase.skills(id) ON DELETE CASCADE,
    tool_id UUID NOT NULL REFERENCES aibase.tools(id) ON DELETE CASCADE,
    sort_order INT NOT NULL DEFAULT 0,
    UNIQUE(skill_id, tool_id)
);

CREATE INDEX IF NOT EXISTS idx_skill_tools_skill_id ON aibase.skill_tools(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_tools_tool_id ON aibase.skill_tools(tool_id);
