import { useCallback, useEffect, useState } from 'react';
import { getBizdataDataStandards } from '@/services/EADAF/api/businessData';
import { useInitialState } from '@/providers/InitialStateProvider';
import { getApiData, isApiSuccess } from '@/utils/apiResponse';

export function formatStandardLabel(standard?: API.BizdataDataStandard | null) {
  if (!standard) return '';
  return `${standard.name} (${standard.code} v${standard.version})`;
}

export function useDataStandardOptions() {
  const { initialState } = useInitialState();
  const metadataEnabled = Boolean(initialState?.systemFeatures?.metadataEnabled);
  const [options, setOptions] = useState<{ label: string; value: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!metadataEnabled) {
      setOptions([]);
      return;
    }
    setLoading(true);
    try {
      const res = await getBizdataDataStandards({ status: 'enabled', size: 500 });
      if (isApiSuccess(res)) {
        const data = getApiData<API.BizdataDataStandardList>(res);
        setOptions(
          (data?.items || []).map((item) => ({
            label: formatStandardLabel(item),
            value: item.id || '',
          })),
        );
      }
    } finally {
      setLoading(false);
    }
  }, [metadataEnabled]);

  useEffect(() => {
    void load();
  }, [load]);

  return { options, loading, reload: load };
}
