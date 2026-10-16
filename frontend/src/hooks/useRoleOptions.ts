import { useCallback, useEffect, useState } from 'react';
import { getRoles } from '@/services/EADAF/api/roles';

export interface RoleOption {
  label: string;
  value: string;
}

export function useRoleOptions() {
  const [options, setOptions] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(false);

  const loadRoles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getRoles({ page: 1, size: -1, status: 'ACTIVE' });
      const items = res.data?.items || [];
      setOptions(
        items.map((role) => ({
          label: `${role.role_name} (${role.code})`,
          value: role.role_id!,
        })),
      );
    } catch {
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  return { roleOptions: options, roleOptionsLoading: loading, reloadRoleOptions: loadRoles };
}
