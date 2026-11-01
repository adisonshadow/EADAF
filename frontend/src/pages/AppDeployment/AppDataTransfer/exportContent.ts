/**
 * 「应用数据导出/导入」页的导出内容清单。
 *
 * 清单与后端 appExportService 实际产出的节一一对应(见 backend/src/services/
 * appTransfer/appExportService.js):不要写死条数,也不要凭印象加项。
 * 与导出选项相关的项不隐藏,而是由页面用删除线标注「本次不包含」,
 * 让用户始终能对照完整内容,而不是选项一变清单就缺一块。
 *
 * 纯数据 + 纯函数:exportContent.verify.ts 可直接回归。
 */

export type ExportDataMode = 'structure_and_data' | 'data_only';

/** 与导出表单一一对应的选项;改表单时同步这里,避免清单与实包脱节 */
export type ExportSelectionState = {
  dataMode: ExportDataMode;
  includeEadaf: boolean;
  includeFiles: boolean;
};

export type ExportContentItemSpec = {
  /** 稳定键,建议与后端 payload 的节名对齐 */
  key: string;
  label: string;
  desc: string;
  /** false 表示本次不随包携带:页面保留该行并加删除线 */
  included: (state: ExportSelectionState) => boolean;
  /** 不包含时的原因提示(指向上方哪个开关没勾) */
  excludedHint?: string;
  /** 与选项相关的补充说明,不影响是否包含 */
  note?: (state: ExportSelectionState) => string | null;
};

export type ExportContentGroupSpec = {
  key: string;
  title: string;
  items: ExportContentItemSpec[];
};

const always = () => true;

export const EXPORT_CONTENT_GROUPS: ExportContentGroupSpec[] = [
  {
    key: 'app',
    title: '应用与结构',
    items: [
      {
        key: 'application',
        label: '应用配置',
        desc: 'SSO / API 接入、数据域 Scope、顶层 Skill 说明',
        included: always,
      },
      {
        key: 'entities',
        label: '数据实体结构',
        desc: '实体 / 字段 / 枚举 / 关系 / Scope 文档',
        included: always,
        note: (state) =>
          state.dataMode === 'data_only'
            ? '仅数据模式:结构仍随包携带,只作版本指纹,目标端不落结构'
            : null,
      },
      {
        key: 'metadata',
        label: '实体绑定的逻辑元数据',
        desc: '仅带 code + version 供目标端重映射,不含数据标准目录',
        included: always,
      },
    ],
  },
  {
    key: 'business',
    title: '业务能力',
    items: [
      {
        key: 'apiServices',
        label: 'API 服务',
        desc: '定义 / 操作 / 授权',
        included: always,
      },
      {
        key: 'collectionPipelines',
        label: '采集管道',
        desc: '含本应用的白名单绑定',
        included: always,
      },
      {
        key: 'outboundWebhooks',
        label: 'Outbound Webhook',
        desc: '鉴权密钥以明文段携带',
        included: always,
      },
      {
        key: 'metrics',
        label: '指标与指标卡片',
        desc: '指标定义与卡片',
        included: always,
      },
      {
        key: 'hooks',
        label: '钩子',
        desc: 'event_filter 命中本应用实体 / API 的钩子',
        included: always,
      },
      {
        key: 'skills',
        label: '应用专用 Skill',
        desc: 'Skill 及其 Tools / AI Scope,不含全局 / EADAF 平台 Skill',
        included: always,
      },
    ],
  },
  {
    key: 'data',
    title: '数据与存储',
    items: [
      {
        key: 'databaseConnections',
        label: '数据库连接元数据',
        desc: 'name / dbType / targetSchema / host 等,不含密码;导入优先匹配,失败则用同类型凭证本地创建',
        included: always,
      },
      {
        key: 'materialization',
        label: '物化库表摘要',
        desc: '表名 / schema / 列数 / 行数',
        included: always,
      },
      {
        key: 'entityData',
        label: '行数据',
        desc: '仅 PostgreSQL / MySQL 物化表,保留原主键',
        included: always,
      },
      {
        key: 'storageBuckets',
        label: '存储桶元数据',
        desc: '该应用的桶及其访问限制(角色引用)',
        included: always,
      },
      {
        key: 'storageObjects',
        label: '存储对象文件',
        desc: '该应用桶内对象 + 归属本应用的对象二进制',
        included: (state) => state.includeFiles,
        excludedHint: '未勾选「携带存储文件」',
      },
    ],
  },
  {
    key: 'eadaf',
    title: 'EADAF 数据',
    items: [
      {
        key: 'eadafReferences',
        label: '被引用的角色与权限',
        desc: 'API 授权与桶访问限制引用到的角色 / 权限,始终携带',
        included: always,
        note: (state) =>
          state.includeEadaf
            ? '勾选「携带 EADAF 数据」后扩展为全量角色 / 权限'
            : null,
      },
      {
        key: 'eadafUsers',
        label: '用户 / 部门 / 授权数据',
        desc: '用户、部门、用户角色、角色权限、数据权限规则',
        included: (state) => state.includeEadaf,
        excludedHint: '未勾选「携带 EADAF 数据」',
      },
    ],
  },
];

export type ResolvedExportContentItem = {
  key: string;
  label: string;
  desc: string;
  included: boolean;
  excludedHint: string | null;
  note: string | null;
};

export type ResolvedExportContentGroup = {
  key: string;
  title: string;
  items: ResolvedExportContentItem[];
};

export type ResolvedExportContent = {
  groups: ResolvedExportContentGroup[];
  total: number;
  includedCount: number;
  excludedCount: number;
};

/** 按当前选项展开清单:包含的照常展示,不包含的保留并用 included=false 标记 */
export function resolveExportContent(
  state: ExportSelectionState,
): ResolvedExportContent {
  const groups = EXPORT_CONTENT_GROUPS.map((group) => ({
    key: group.key,
    title: group.title,
    items: group.items.map((item) => {
      const included = item.included(state);
      return {
        key: item.key,
        label: item.label,
        desc: item.desc,
        included,
        excludedHint: included ? null : item.excludedHint || null,
        note: item.note ? item.note(state) : null,
      };
    }),
  }));
  const items = groups.flatMap((group) => group.items);
  const includedCount = items.filter((item) => item.included).length;
  return {
    groups,
    total: items.length,
    includedCount,
    excludedCount: items.length - includedCount,
  };
}

/** 导出、导入共用的安全模式说明。开关写入导出包,导入默认沿用。 */
export const SAFE_MODE_EFFECT =
  '覆盖导入时，把已发布的 API、采集管道、出站 Webhook 退回未发布。关闭后保持源端发布状态。';

/**
 * 导出内容清单下方的安全模式说明。
 * 该设置只写入导出包,不改变包内业务数据,因此不计入导出内容清单。
 */
export function describeSafeMode(safeMode: boolean): string {
  return `安全模式${safeMode ? '开启' : '关闭'}：${SAFE_MODE_EFFECT}该设置写入导出包，导入时默认沿用，不改变包内数据。`;
}
