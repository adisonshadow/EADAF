-- Skill 可见性：全局 / 专用应用
ALTER TABLE aibase.skills
    ADD COLUMN IF NOT EXISTS is_global BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE aibase.skills
    ADD COLUMN IF NOT EXISTS is_dedicated BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS aibase.skill_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_id UUID NOT NULL REFERENCES aibase.skills(id) ON DELETE CASCADE,
    application_id UUID NOT NULL REFERENCES eadaf.applications(application_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(skill_id, application_id)
);

CREATE INDEX IF NOT EXISTS idx_skill_applications_skill_id ON aibase.skill_applications(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_applications_application_id ON aibase.skill_applications(application_id);
