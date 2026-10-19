import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getUserHabit, setUserHabit } from '@/utils/userHabit';

/**
 * 全站 ProTable 密度（表格尺寸）偏好。
 *
 * - 统一在「设置 → 通用 → 表格密度」中切换，一处设置应用到所有 ProTable；
 * - 因此 ProTable 工具栏不再提供密度按钮，避免每个表格各切各的；
 * - 取值与 antd Table / ProTable 的 size 完全一致，便于直接透传；
 * - 与界面主题一致，仅保存在当前浏览器（userHabit），不落服务端。
 */
export type ProTableDensity = 'large' | 'middle' | 'small';

/** ProTable 自身默认即为 middle，保持默认值不改变现有观感 */
export const DEFAULT_PRO_TABLE_DENSITY: ProTableDensity = 'middle';

/** 设置页「表格密度」可选项 */
export const PRO_TABLE_DENSITY_OPTIONS: { label: string; value: ProTableDensity }[] = [
  { label: '宽松', value: 'large' },
  { label: '中等', value: 'middle' },
  { label: '紧凑', value: 'small' },
];

const STORAGE_KEY = 'ui.proTableDensity';

function isProTableDensity(value: unknown): value is ProTableDensity {
  return value === 'large' || value === 'middle' || value === 'small';
}

function readDensity(): ProTableDensity {
  const value = getUserHabit<unknown>(STORAGE_KEY, DEFAULT_PRO_TABLE_DENSITY);
  return isProTableDensity(value) ? value : DEFAULT_PRO_TABLE_DENSITY;
}

interface ProTableDensityContextValue {
  density: ProTableDensity;
  setDensity: (next: ProTableDensity) => void;
}

const ProTableDensityContext = createContext<ProTableDensityContextValue | null>(null);

export function ProTableDensityProvider({ children }: { children: ReactNode }) {
  const [density, setDensityState] = useState<ProTableDensity>(readDensity);

  const setDensity = useCallback((next: ProTableDensity) => {
    if (!isProTableDensity(next)) return;
    setDensityState((prev) => {
      if (prev === next) return prev;
      setUserHabit(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ density, setDensity }), [density, setDensity]);

  return (
    <ProTableDensityContext.Provider value={value}>{children}</ProTableDensityContext.Provider>
  );
}

/**
 * 读取 / 修改全局表格密度。
 * Provider 缺失时回退到浏览器里保存的值 + 空 setter，保证任何挂载路径下表格都能正常渲染。
 */
export function useProTableDensity(): ProTableDensityContextValue {
  const ctx = useContext(ProTableDensityContext);
  return ctx ?? { density: readDensity(), setDensity: () => {} };
}
