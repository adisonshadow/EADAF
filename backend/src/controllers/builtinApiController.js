const { BuiltinApiConfig } = require('../models');
const { listBuiltinApis, existsBuiltinApiCode } = require('../services/builtinApi/catalog');
const {
  normalizeAccessRestriction,
  invalidateCache,
} = require('../services/builtinApi/builtinApiPermissionService');

/**
 * 内置 API 管理控制器（清单只读 + 限制配置）
 *
 * - 清单元数据来自代码常量 catalog.js（固定、不可新建/编辑/删除）。
 * - 限制配置存 eadaf.builtin_api_configs（access_restriction JSONB）。
 */
class BuiltinApiController {
  /**
   * GET /api/v1/admin/builtin-apis
   * 返回内置 API 清单（合并 catalog 常量 + 限制配置），并附带按 code 分层的 tree。
   */
  static async list(ctx) {
    try {
      const configRows = await BuiltinApiConfig.findAll({
        attributes: ['code', 'access_restriction'],
      });
      const configMap = {};
      configRows.forEach((row) => {
        configMap[row.code] = row.access_restriction || null;
      });

      const items = listBuiltinApis().map((item) => {
        const raw = configMap[item.code] || null;
        const restriction = normalizeAccessRestriction(raw);
        return {
          ...item,
          accessRestriction: restriction,
          configured: Boolean(restriction),
        };
      });

      ctx.body = {
        code: 200,
        message: 'success',
        data: {
          items,
          tree: buildBuiltinApiTree(items),
        },
      };
    } catch (error) {
      ctx.status = 500;
      ctx.body = {
        code: 500,
        message: '获取内置 API 清单失败',
        error: error.message,
      };
    }
  }

  /**
   * PUT /api/v1/admin/builtin-apis/:code/access-restriction
   * body: { accessRestriction: { mode: 'role'|'department', roleIds?: [], departmentIds?: [] } }
   * 内置 API 无 "none"（必须配置角色或组织限制）。
   */
  static async updateAccessRestriction(ctx) {
    try {
      const { code } = ctx.params;
      if (!existsBuiltinApiCode(code)) {
        ctx.status = 404;
        ctx.body = { code: 404, message: '内置 API 不存在', data: null };
        return;
      }

      const input = ctx.request.body?.accessRestriction;
      const normalized = normalizeAccessRestriction(input);
      if (!normalized) {
        ctx.status = 400;
        ctx.body = {
          code: 400,
          message: '内置 API 访问限制无效（mode=none|role|department；role/department 需对应非空 id 列表）',
          data: null,
        };
        return;
      }

      await BuiltinApiConfig.upsert({
        code,
        access_restriction: normalized,
      });
      invalidateCache();

      ctx.body = {
        code: 200,
        message: 'success',
        data: { code, accessRestriction: normalized },
      };
    } catch (error) {
      ctx.status = 500;
      ctx.body = {
        code: 500,
        message: '更新内置 API 限制失败',
        error: error.message,
      };
    }
  }

  /**
   * DELETE /api/v1/admin/builtin-apis/:code/access-restriction
   * 清除限制配置（恢复为「未配置」，运行时按放行处理）。
   */
  static async deleteAccessRestriction(ctx) {
    try {
      const { code } = ctx.params;
      if (!existsBuiltinApiCode(code)) {
        ctx.status = 404;
        ctx.body = { code: 404, message: '内置 API 不存在', data: null };
        return;
      }
      await BuiltinApiConfig.destroy({ where: { code } });
      invalidateCache();
      ctx.body = { code: 200, message: 'success', data: null };
    } catch (error) {
      ctx.status = 500;
      ctx.body = {
        code: 500,
        message: '清除内置 API 限制失败',
        error: error.message,
      };
    }
  }

  /**
   * PUT /api/v1/admin/builtin-apis/batch/access-restriction
   * body: { domainPrefix: 'user', accessRestriction: { mode, roleIds?, departmentIds? } }
   * 将同一访问限制批量应用到指定域（domainPrefix）下的所有内置 API。
   * domainPrefix 为 code 的顶层或前缀段（如 'user'、'bizdata:metrics'）。
   */
  static async batchUpdateAccessRestriction(ctx) {
    try {
      const { domainPrefix, accessRestriction: input } = ctx.request.body || {};
      if (!domainPrefix || typeof domainPrefix !== 'string') {
        ctx.status = 400;
        ctx.body = { code: 400, message: 'domainPrefix 不能为空', data: null };
        return;
      }
      const normalized = normalizeAccessRestriction(input);
      if (!normalized) {
        ctx.status = 400;
        ctx.body = {
          code: 400,
          message: '内置 API 访问限制无效（mode=none|role|department；role/department 需对应非空 id 列表）',
          data: null,
        };
        return;
      }

      // 命中 domainPrefix 域下的所有内置 API（code === prefix 或 code 以 prefix + ':' 开头）
      const prefix = domainPrefix;
      const targets = listBuiltinApis()
        .filter((item) => item.code === prefix || item.code.startsWith(`${prefix}:`))
        .map((item) => item.code);
      if (!targets.length) {
        ctx.status = 404;
        ctx.body = { code: 404, message: `域 ${prefix} 下无内置 API`, data: null };
        return;
      }

      // upsert 每条
      await Promise.all(
        targets.map((code) =>
          BuiltinApiConfig.upsert({ code, access_restriction: normalized }),
        ),
      );
      invalidateCache();

      ctx.body = {
        code: 200,
        message: 'success',
        data: { domainPrefix: prefix, appliedCount: targets.length, accessRestriction: normalized },
      };
    } catch (error) {
      ctx.status = 500;
      ctx.body = {
        code: 500,
        message: '批量配置内置 API 限制失败',
        error: error.message,
      };
    }
  }
}

/**
 * 按 code 的 `:` 分层构建 tree（与 Permissions 的 buildPermissionTree 同构）。
 * 节点：{ code, label, isLeaf, children? }，域/资源为中间节点，具体 API 为叶子。
 */
function buildBuiltinApiTree(items) {
  const root = { code: '', label: '', children: {} };
  items.forEach((item) => {
    const segments = item.code.split(':');
    let node = root;
    segments.forEach((seg, idx) => {
      const isLeaf = idx === segments.length - 1;
      if (!node.children[seg]) {
        node.children[seg] = { code: seg, label: seg, children: {} };
      }
      node = node.children[seg];
      if (isLeaf) {
        node.label = item.label || seg;
        node.isLeaf = true;
        node.fullCode = item.code;
      }
    });
  });

  function toTreeNodes(mapNode, parentPath = '') {
    return Object.values(mapNode.children)
      .map((child) => {
        const code = parentPath ? `${parentPath}:${child.code}` : child.code;
        const treeNode = {
          code,
          label: child.label,
          key: code,
          isLeaf: Boolean(child.isLeaf),
        };
        if (!child.isLeaf && Object.keys(child.children).length) {
          treeNode.children = toTreeNodes(child, code);
        }
        return treeNode;
      })
      .sort((a, b) => {
        if (a.isLeaf !== b.isLeaf) return a.isLeaf ? 1 : -1;
        return String(a.code).localeCompare(String(b.code));
      });
  }

  return toTreeNodes(root);
}

module.exports = BuiltinApiController;
