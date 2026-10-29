import DepartmentPath from '@/components/DepartmentPath';
import UUIDDisplay from "@/components/UUIDDisplay";
import AvatarUpload from "@/components/AvatarUpload";
import TitleWithHelp from '@/components/TitleWithHelp';
import { Image, Tag } from 'antd';
import { getImageUrlIfValid } from '@/utils/image';
import { statusEnum, genderEnum } from '@/enums';
import type { MixedFieldType } from "@/types/schema";
import { attachCreatedUpdatedAtColumnRender, createdUpdatedAtTableField } from '@/utils/createdUpdatedAtColumn';
import { useDepartmentCascaderOptions } from '@/hooks/useDepartmentOptions';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const USER_ID_HELP = (
  <div style={{ maxWidth: 360 }}>
    <p style={{ margin: '0 0 8px' }}>
      用户 ID 为标准 UUID 格式，例如 550e8400-e29b-41d4-a716-446655440000。
    </p>
    <p style={{ margin: 0 }}>
      须全局唯一；开启「是否自动创建唯一ID」时由系统自动生成，无需手动填写。
    </p>
  </div>
);

// 1、 所有字段定义
export const fieldDefinitions: MixedFieldType[] = [
  {
    title: "用户ID",
    dataIndex: "user_id",
    valueType: 'text',
    copyable: true,
    ifShowInTable: true,
    ifShowInDetail: true,
    ifShowInForm: false,
    width: 100,
  },
  {
    title: "用户名",
    dataIndex: "username",
    formItemProps: {
      rules: [
        { required: true, message: '请输入用户名' },
        { min: 3, message: '用户名至少3个字符' },
        { max: 16, message: '用户名最多16个字符' },
        { pattern: /^[a-zA-Z0-9_]+$/, message: '用户名只能包含字母、数字和下划线' },
      ]
    },
    ifShowInTable: true,
    ifShowInDetail: true,
    ifShowInForm: true,
    width: 90,
  },
  {
    title: "姓名",
    dataIndex: "name",
    formItemProps: {
      rules: [{ required: true, message: '请输入姓名' }]
    },
    ifShowInTable: true,
    ifShowInDetail: true,
    ifShowInForm: true,
    width: 90,
  },
  {
    title: "状态",
    dataIndex: "status",
    valueType: 'select',
    valueEnum: statusEnum,
    ifShowInTable: true,
    ifShowInDetail: true,
    ifShowInForm: true,
    width: 100,
  },
  {
    title: "所属部门",
    dataIndex: "department_id",
    valueType: 'cascader',
    formItemProps: {
      rules: [{ required: true, message: '请选择一个部门' }]
    },
    fieldProps: {
      changeOnSelect: false,
      expandTrigger: 'hover',
      showSearch: {
        filter: (inputValue: string, path: any[]) => {
          return path.some(option => 
            String(option.label).toLowerCase().indexOf(inputValue.toLowerCase()) > -1
          );
        },
      },
      options: [], // 这里先设置为空数组，实际值会在组件中动态设置
    },
    ifShowInTable: true,
    ifShowInDetail: true,
    ifShowInForm: true,
    width: 160,
  },
  {
    title: "头像",
    dataIndex: "avatar",
    valueType: 'text',
    fieldProps: {
      listType: 'picture-card',
      maxCount: 1,
    },
    ifShowInTable: false,
    ifShowInDetail: true,
    ifShowInForm: true,
  },
  {
    title: "性别",
    dataIndex: "gender",
    valueType: 'select',
    valueEnum: genderEnum,
    ifShowInTable: false,
    ifShowInDetail: true,
    ifShowInForm: true,
  },
  {
    title: "三员属性",
    dataIndex: "three_member_role",
    valueType: 'select',
    valueEnum: {
      system_admin: { text: '系统管理员' },
      security_admin: { text: '安全保密管理员' },
      auditor: { text: '安全审计员' },
    },
    fieldProps: { allowClear: true },
    ifShowInTable: false,
    ifShowInDetail: true,
    ifShowInForm: true,
  },
  
  {
    title: "邮箱",
    dataIndex: "email",
    valueType: 'text',
    formItemProps: {
      rules: [
        // { required: true, message: '请输入邮箱' },
        { type: 'email', message: '请输入有效的邮箱地址' }
      ]
    },
    ifShowInTable: true,
    ifShowInDetail: true,
    ifShowInForm: true,
    width: 160,
  },
  {
    title: "电话",
    dataIndex: "phone",
    valueType: 'text',
    ifShowInTable: true,
    ifShowInDetail: true,
    ifShowInForm: true,
    width: 120,
  },
  {
    title: "直接角色",
    dataIndex: "role_ids",
    valueType: 'select',
    formItemProps: {
      tooltip: '成员直接绑定的角色，可多选',
    },
    fieldProps: {
      mode: 'multiple',
      allowClear: true,
      placeholder: '请选择角色',
      options: [],
    },
    ifShowInTable: false,
    ifShowInDetail: true,
    ifShowInForm: true,
  },
  {
    title: "组织继承角色",
    dataIndex: "department_roles",
    valueType: 'text',
    formItemProps: {
      tooltip: '来自所属组织绑定的角色，只读',
    },
    ifShowInTable: false,
    ifShowInDetail: true,
    ifShowInForm: false,
  },
  {
    title: "有效角色",
    dataIndex: "effective_roles",
    valueType: 'text',
    formItemProps: {
      tooltip: '直接角色与组织继承角色的并集',
    },
    ifShowInTable: true,
    ifShowInDetail: true,
    ifShowInForm: false,
    width: 160,
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
    width: 200,
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
];

// 创建一个自定义 hook 来获取部门 Cascader 选项（直接拉取部门树，不依赖 initialState）
export const useDepartmentOptions = () => useDepartmentCascaderOptions();

// 2、 从所有字段定义中，过滤出需要显示在表格中的字段
export const tableColumns = attachCreatedUpdatedAtColumnRender(
  fieldDefinitions
  .filter(field => field.ifShowInTable)
  .map(field => {
    if (field.dataIndex === 'user_id') {
      return {
        ...field,
        width: field.width,
        render: (text: any, record: any) => {
          const user_id = record.user_id;
          if (!user_id || user_id === '') return null;
          return <UUIDDisplay uuid={String(user_id)} />;
        },
      };
    }
    if (field.dataIndex === 'department_id') {
      return {
        ...field,
        width: field.width,
        render: (text: any, record: any) => {
          const department_id = record.department_id;
          if (!department_id || department_id === '') return null;
          return <DepartmentPath departmentId={String(department_id)} />;
        },
      };
    }
    if (field.dataIndex === 'effective_roles') {
      return {
        ...field,
        width: field.width,
        render: (_: unknown, record: any) => {
          const roles = record.effective_roles || record.roles || [];
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
    if (['user_id', 'username', 'name', 'email', 'phone'].includes(field.dataIndex as string)) {
      return {
        ...field,
        width: field.width,
        filters: false,
        onFilter: true,
        filterMode: 'menu',
        filterSearch: true,
      };
    }
    if (['status', 'gender', 'department_id'].includes(field.dataIndex as string)) {
      return {
        ...field,
        width: field.width,
        filters: true,
        onFilter: true,
        filterMode: 'menu',
        filterSearch: true,
      };
    }
    return {
      ...field,
      width: field.width,
    };
  }),
);

// 3、 从所有字段定义中，过滤出需要显示在详情表单中的字段
export const userDetailFormColumns = fieldDefinitions
  .filter(field => field.ifShowInDetail)
  .map(field => {
    const { width, ...rest } = field;
    if (field.dataIndex === 'avatar') {
      return {
        ...rest,
        render: (dom: any) => {
          if (!dom) return null;
          const imageUrl = getImageUrlIfValid(String(dom));
          if (!imageUrl) return null;
          return (
            <Image
              src={imageUrl}
              alt="用户头像"
              width={64}
              height={64}
              style={{ objectFit: 'cover', borderRadius: '50%' }}
              preview={{
                mask: '预览',
                maskClassName: 'custom-image-mask',
              }}
            />
          );
        },
      };
    }
    if (field.dataIndex === 'department_id') {
      return {
        ...rest,
        render: (text: any, record: any) => {
          if (text.length === 0) return null;
          const department_id = text[text.length - 1];
          if (!department_id || department_id === '') return null;
          return <DepartmentPath isOnlyShowTail={false} departmentId={String(department_id)} />;
        },
      };
    }
    if (['department_roles', 'effective_roles'].includes(field.dataIndex as string)) {
      return {
        ...rest,
        render: (_: unknown, record: any) => {
          const roles = record[field.dataIndex as string] || [];
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
    if (field.dataIndex === 'role_ids') {
      return {
        ...rest,
        render: (_: unknown, record: any) => {
          const roles = record.roles || [];
          if (!roles.length) return '-';
          return (
            <>
              {roles.map((role: { role_id: string; role_name: string }) => (
                <Tag key={role.role_id} color="blue">{role.role_name}</Tag>
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

// 用户编辑表单配置
export const userEditFormColumns = fieldDefinitions
  .filter(field => field.ifShowInForm)
  .map(field => {
    const { width, ...rest } = field;
    if (field.dataIndex === 'avatar') {
      return {
        ...rest,
        renderFormItem: () => <AvatarUpload />,
      };
    }
    return {
      ...rest,
    };
  });

// 新建用户表单（含 ID 自动创建选项）
export const userCreateFormColumns = [
  {
    title: '是否自动创建唯一ID',
    dataIndex: 'auto_create_user_id',
    valueType: 'switch' as const,
    initialValue: true,
    colProps: { span: 12 },
    fieldProps: {
      checkedChildren: '是',
      unCheckedChildren: '否',
    },
  },
  {
    valueType: 'dependency' as const,
    name: ['auto_create_user_id'],
    columns: ({ auto_create_user_id }: { auto_create_user_id?: boolean }) => {
      if (auto_create_user_id !== false) return [];
      return [
        {
          title: <TitleWithHelp title="用户ID" help={USER_ID_HELP} />,
          dataIndex: 'user_id',
          valueType: 'text' as const,
          colProps: { span: 12 },
          formItemProps: {
            rules: [
              { required: true, message: '请输入用户 ID' },
              { pattern: UUID_PATTERN, message: '请输入有效的 UUID 格式' },
            ],
          },
          fieldProps: {
            placeholder: '550e8400-e29b-41d4-a716-446655440000',
          },
        },
      ];
    },
  },
  ...userEditFormColumns,
];
