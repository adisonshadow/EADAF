import { ProTable } from '@ant-design/pro-components';
import type { ParamsType, ProTableProps } from '@ant-design/pro-components';
import { resolveProTableOptions } from '@/constants/proTable';
import { useProTableDensity } from '@/theme/proTableDensity';

export type UnifiedProTableProps<
  T extends Record<string, any>,
  U extends ParamsType = ParamsType,
  ValueType = 'text',
> = ProTableProps<T, U, ValueType>;

/**
 * 全站统一 ProTable（唯一出口，业务页面不要直接使用 @ant-design/pro-components 的 ProTable）。
 *
 * 统一两件事：
 * 1. 工具栏固定为「刷新 / 设置 / 全屏」，密度按钮一律不显示（页面无法自行打开）；
 * 2. 表格尺寸（宽松 / 中等 / 紧凑）跟随「设置 → 通用 → 表格密度」的全局偏好，
 *    页面显式传入的 size 会被全局设置覆盖，保证全站一致。
 */
export function UnifiedProTable<
  T extends Record<string, any>,
  U extends ParamsType = ParamsType,
  ValueType = 'text',
>(props: UnifiedProTableProps<T, U, ValueType>) {
  const { density } = useProTableDensity();
  const { options, ...rest } = props;

  return (
    <ProTable<T, U, ValueType>
      {...rest}
      size={density}
      options={resolveProTableOptions(options)}
    />
  );
}

export default UnifiedProTable;
