-- 部门角色关联表
CREATE TABLE IF NOT EXISTS eadaf.department_roles (
    department_id UUID NOT NULL,
    role_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (department_id, role_id)
);

ALTER TABLE eadaf.department_roles
    DROP CONSTRAINT IF EXISTS fk_department_roles_department,
    DROP CONSTRAINT IF EXISTS fk_department_roles_role;

ALTER TABLE eadaf.department_roles
    ADD CONSTRAINT fk_department_roles_department
        FOREIGN KEY (department_id) REFERENCES eadaf.departments(department_id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_department_roles_role
        FOREIGN KEY (role_id) REFERENCES eadaf.roles(role_id) ON DELETE CASCADE;
