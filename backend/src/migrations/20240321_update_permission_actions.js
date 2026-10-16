'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. 添加新的 actions 字段
    await queryInterface.addColumn('permissions', 'actions', {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: []
    }, {
      schema: 'eadaf'
    });

    // 2. 将现有的 action 数据迁移到 actions 数组
    const permissions = await queryInterface.sequelize.query(
      'SELECT permission_id, action FROM eadaf.permissions WHERE action IS NOT NULL',
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    for (const permission of permissions) {
      await queryInterface.sequelize.query(
        'UPDATE eadaf.permissions SET actions = :actions WHERE permission_id = :permission_id',
        {
          replacements: {
            actions: JSON.stringify([permission.action]),
            permission_id: permission.permission_id
          }
        }
      );
    }

    // 3. 删除旧的 action 字段
    await queryInterface.removeColumn('permissions', 'action', {
      schema: 'eadaf'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // 1. 添加回 action 字段
    await queryInterface.addColumn('permissions', 'action', {
      type: Sequelize.STRING(50),
      allowNull: true
    }, {
      schema: 'eadaf'
    });

    // 2. 将 actions 数组的第一个元素迁移回 action 字段
    const permissions = await queryInterface.sequelize.query(
      'SELECT permission_id, actions FROM eadaf.permissions WHERE actions IS NOT NULL',
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    for (const permission of permissions) {
      const actions = JSON.parse(permission.actions);
      if (actions && actions.length > 0) {
        await queryInterface.sequelize.query(
          'UPDATE eadaf.permissions SET action = :action WHERE permission_id = :permission_id',
          {
            replacements: {
              action: actions[0],
              permission_id: permission.permission_id
            }
          }
        );
      }
    }

    // 3. 删除 actions 字段
    await queryInterface.removeColumn('permissions', 'actions', {
      schema: 'eadaf'
    });
  }
}; 