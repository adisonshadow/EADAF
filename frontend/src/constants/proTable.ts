import type { ProTableProps } from '@ant-design/pro-components';

/**
 * 全站 ProTable 统一工具栏配置：
 * 只保留「刷新 / 设置 / 全屏」三个按钮。
 *
 * 密度按钮统一关闭——表格密度改由「设置 → 通用 → 表格密度」全局控制
 * （见 @/theme/proTableDensity），避免每个表格各自切换。
 */
export const DEFAULT_PRO_TABLE_OPTIONS: NonNullable<ProTableProps<any, any>['options']> = {
  density: false,
  fullScreen: true,
  reload: true,
  setting: true,
};

type ProTableOptions = ProTableProps<any, any>['options'];

/**
 * 合并页面自定义 toolbar options 与全站默认值。
 *
 * - 页面传 `false` 表示完全不要工具栏（嵌套子表沿用该语义），原样返回；
 * - 其余情况先铺默认值，再叠加页面自定义，最后**强制** `density: false`，
 *   防止页面自行传入 `density: true` 把密度按钮重新放出来。
 */
export function resolveProTableOptions(options: ProTableOptions): ProTableOptions {
  if (options === false) return false;
  return {
    ...DEFAULT_PRO_TABLE_OPTIONS,
    ...(options || {}),
    density: false,
  };
}
