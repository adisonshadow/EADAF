import { ProFormColumnsType } from "@ant-design/pro-components";
import UUIDDisplay from "@/components/UUIDDisplay";
import { Tag } from 'antd';
import { getDepartmentsTree } from "@/services/EADAF/api/departments";
import { useEffect, useState } from "react";
import type { MixedFieldType } from "@/types/schema";
import { attachCreatedUpdatedAtColumnRender, createdUpdatedAtTableField } from '@/utils/createdUpdatedAtColumn';

// 字段定义
export const fieldDefinitions: MixedFieldType[] = [
  {
    title: "部门名称",
    dataIndex: "name",
    valueType: 'text',
    formItemProps: {
      rules: [
        { required: true, message: '请输入部门名称' },
        { min: 2, message: '部门名称至少2个字符' },
        { max: 50, message: '部门名称最多50个字符' },
      ]
    },
    ifShowInTable: true,
    ifShowInDetail: true,
    ifShowInForm: true,
    width: 240,
  },
  {
    title: "部门ID",
    dataIndex: "department_id",
    valueType: 'text',
    copyable: true,
    ifShowInTable: true,
    hideInSearch: true,
    ifShowInDetail: true,
    ifShowInForm: false,
  },
  {
    title: "上级部门",
    dataIndex: "parent_id",
    valueType: 'treeSelect',
    hideInSearch: true,
    formItemProps: {
      tooltip: '不选择则表示创建为顶级部门',
      rules: [],
    },
    fieldProps: {
      treeData: [],
      allowClear: true,
      treeDefaultExpandAll: true,
      showSearch: true,
      treeNodeFilterProp: 'title',
      fieldNames: {
        label: 'name',
        value: 'department_id',
        children: 'children',
      },
    },
    ifShowInTable: true,
    ifShowInDetail: true,
    ifShowInForm: true,
  },
  {
    title: "创建时间",
    dataIndex: "created_at",
    valueType: 'dateTime',
    readonly: true,
    hideInSearch: true,
    ifShowInTable: false,
    ifShowInDetail: true,
    ifShowInForm: false,
    width: 180,
  },
  {
    title: "更新时间",
    dataIndex: "updated_at",
    valueType: 'dateTime',
    readonly: true,
    hideInSearch: true,
    ifShowInTable: false,
    ifShowInDetail: true,
    ifShowInForm: false,
    width: 180,
  },
  createdUpdatedAtTableField,
  {
    title: "绑定角色",
    dataIndex: "role_ids",
    valueType: 'select',
    formItemProps: {
      tooltip: '该组织成员可继承的角色，可多选',
    },
    fieldProps: {
      mode: 'multiple',
      allowClear: true,
      placeholder: '请选择角色',
      options: [],
    },
    ifShowInTable: true,
    ifShowInDetail: true,
    ifShowInForm: true,
    width: 200,
  },
];

// 表格列配置
export const tableColumns = attachCreatedUpdatedAtColumnRender(
  fieldDefinitions
  .filter(field => field.ifShowInTable)
  .map(field => {
    if (field.dataIndex === 'department_id') {
      return {
        ...field,
        width: field.width,
        render: (text: any, record: any) => {
          const department_id = record.department_id;
          if (!department_id || department_id === '') return null;
          return <UUIDDisplay uuid={String(department_id)} />;
        },
      };
    }
    if (field.dataIndex === 'parent_id') {
      return {
        ...field,
        width: field.width,
        render: (text: any, record: any) => {
          const parent_id = record.parent_id;
          if (!parent_id || parent_id === '') return '无';
          return <UUIDDisplay uuid={String(parent_id)} />;
        },
      };
    }
    if (field.dataIndex === 'role_ids') {
      return {
        ...field,
        width: field.width,
        render: (_: unknown, record: any) => {
          const roles = record.roles || [];
          if (!roles.length) return '-';
          return (
            <>
              {roles.map((role: { role_id: string; role_name: string }) => (
                <Tag key={role.role_id}>{role.role_name}</Tag>
              ))}
            </>
          );
        },
      };
    }
    return {
      ...field,
      width: field.width,
    };
  }),
);

// 部门详情表单配置
export const departmentDetailFormColumns = fieldDefinitions
  .filter(field => field.ifShowInDetail)
  .map(field => {
    const { width, ...rest } = field;
    if (field.dataIndex === 'role_ids') {
      return {
        ...rest,
        render: (_: unknown, record: any) => {
          const roles = record.roles || [];
          if (!roles.length) return '-';
          return (
            <>
              {roles.map((role: { role_id: string; role_name: string }) => (
                <Tag key={role.role_id}>{role.role_name}</Tag>
              ))}
            </>
          );
        },
      };
    }
    return {
      ...rest,
    };
  });

// 部门编辑表单配置
export const departmentEditFormColumns = fieldDefinitions
  .filter(field => field.ifShowInForm)
  .map(field => {
    const { width, ...rest } = field;
    return {
      ...rest,
    };
  });

// 创建一个自定义 hook 来获取部门数据
export const useDepartmentOptions = () => {
  const [departmentTree, setDepartmentTree] = useState<any[]>([]);

  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const response = await getDepartmentsTree();
        if (response.code === 200 && response.data?.items) {
          setDepartmentTree(response.data.items);
        }
      } catch (error) {
        console.error('获取部门树失败:', error);
      }
    };

    fetchDepartments();
  }, []);

  return departmentTree;
}; 