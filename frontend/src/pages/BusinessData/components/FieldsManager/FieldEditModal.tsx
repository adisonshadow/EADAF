import {
  Button,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Switch,
  Tooltip,
  Typography,
} from 'antd';
import { ClearOutlined } from '@ant-design/icons';
import React, { useEffect, useMemo, useState } from 'react';
import {
  getADBExtendTypes,
  getDefaultValueOptions,
  getFieldTypeHint,
  getTypeORMNativeTypes,
  isIDType,
  requiresLengthConfig,
  requiresPrecisionConfig,
  requiresScaleConfig,
  shouldShowConfig,
} from '../../utils/fieldTypeConfig';
import { getStorageBuckets } from '@/services/EADAF/api/storage';
import { isApiSuccess, parseApiListResponse } from '@/utils/apiResponse';
import MetadataEditor from '../MetadataEditor';
import EnumSelectModal from '../EnumManager/EnumSelectModal';
import { enumDefaultValueOptions } from '../../utils/enumUtils';

const { Option } = Select;
const { Text } = Typography;

export interface FieldEditFormValues {
  fieldKey?: string;
  label?: string;
  type?: string;
  length?: number;
  precision?: number;
  scale?: number;
  nullable?: boolean;
  unique?: boolean;
  primary?: boolean;
  default?: string | number | boolean;
  extendType?: string;
  mediaConfig?: {
    mediaType?: string;
    formats?: string[];
    maxSize?: number;
    isMultiple?: boolean;
    bucketCode?: string;
  };
  enumConfig?: {
    enumCode?: string;
    isMultiple?: boolean;
  };
  autoIncrementIdConfig?: Record<string, unknown>;
  guidIdConfig?: Record<string, unknown>;
  snowflakeIdConfig?: Record<string, unknown>;
}

interface FieldEditModalProps {
  open: boolean;
  isCreate: boolean;
  field: API.BusinessDataField | null;
  entityId?: string;
  entityCode?: string;
  enums: API.BusinessDataEnum[];
  saving?: boolean;
  onOk: (field: API.BusinessDataField) => void | Promise<void>;
  onCancel: () => void;
}

const ADB_EXTEND_TYPES = new Set([
  'adb-media',
  'adb-enum',
  'adb-auto-increment-id',
  'adb-guid-id',
  'adb-snowflake-id',
]);

const SWITCH_ITEM_WIDTH = 120;

type InlineSwitchItemConfig = {
  key: string;
  name: string | string[];
  label: React.ReactNode;
  tooltip?: string;
};

function InlineSwitchItem({ name, label, tooltip }: InlineSwitchItemConfig) {
  const form = Form.useFormInstance<FieldEditFormValues>();
  const checked = Form.useWatch(name, form) ?? false;

  const toggle = () => {
    form.setFieldValue(name, !checked);
  };

  const labelNode = tooltip ? <Tooltip title={tooltip}>{label}</Tooltip> : label;
  return (
    <div
      style={{
        width: SWITCH_ITEM_WIDTH,
        flex: `0 0 ${SWITCH_ITEM_WIDTH}px`,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <Form.Item name={name} valuePropName="checked" noStyle>
        <Switch size="small" />
      </Form.Item>
      <span
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
        style={{
          fontSize: 14,
          lineHeight: 1,
          color: 'rgba(0,0,0,0.88)',
          whiteSpace: 'nowrap',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {labelNode}
      </span>
    </div>
  );
}

function InlineSwitchRow({ items }: { items: InlineSwitchItemConfig[] }) {
  if (!items.length) return null;
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px 12px',
        marginBottom: 24,
      }}
    >
      {items.map((item) => (
        <InlineSwitchItem key={item.key} name={item.name} label={item.label} tooltip={item.tooltip} />
      ))}
    </div>
  );
}

function fieldToFormValues(field: API.BusinessDataField | null): FieldEditFormValues {
  if (!field) {
    return { type: 'varchar', nullable: true, unique: false, primary: false };
  }
  const extendType = field.columnInfo?.extendType as string | undefined;
  const type = extendType || field.typeormConfig?.type || 'varchar';
  return {
    fieldKey: field.fieldKey,
    label: field.columnInfo?.label,
    type,
    length: field.typeormConfig?.length,
    precision: field.typeormConfig?.precision,
    scale: field.typeormConfig?.scale,
    nullable: field.typeormConfig?.nullable !== false,
    unique: !!field.typeormConfig?.unique,
    primary: !!field.typeormConfig?.primary,
    default: field.typeormConfig?.default,
    extendType,
    mediaConfig: field.columnInfo?.mediaConfig,
    enumConfig: field.columnInfo?.enumConfig,
    autoIncrementIdConfig: field.columnInfo?.autoIncrementIdConfig,
    guidIdConfig: field.columnInfo?.guidIdConfig,
    snowflakeIdConfig: field.columnInfo?.snowflakeIdConfig,
  };
}

function sanitizeFormValues(
  values: FieldEditFormValues,
  enums: API.BusinessDataEnum[],
): FieldEditFormValues {
  if (values.type !== 'adb-enum' || !values.enumConfig?.enumCode) {
    if (values.type === 'adb-enum') {
      return { ...values, default: undefined };
    }
    return values;
  }
  const enumRecord = enums.find((e) => e.code === values.enumConfig?.enumCode);
  const valid = new Set(enumDefaultValueOptions(enumRecord).map((o) => String(o.value)));
  const current = values.default;
  if (current !== undefined && current !== '' && !valid.has(String(current))) {
    return { ...values, default: undefined };
  }
  return values;
}

function formValuesToField(
  values: FieldEditFormValues,
  editing: API.BusinessDataField | null,
): API.BusinessDataField {
  const isAdb = values.type && ADB_EXTEND_TYPES.has(values.type);
  const extendType = isAdb ? values.type : undefined;
  const typeormType = isAdb
    ? values.type === 'adb-guid-id'
      ? 'uuid'
      : values.type === 'adb-snowflake-id' || values.type === 'adb-auto-increment-id'
        ? 'bigint'
        : values.type === 'adb-media'
          ? 'varchar'
          : 'varchar'
    : values.type || 'varchar';

  const columnInfo: Record<string, unknown> = {
    ...(editing?.columnInfo || {}),
    label: values.label,
  };
  if (extendType) columnInfo.extendType = extendType;
  else delete columnInfo.extendType;

  if (values.type === 'adb-media') columnInfo.mediaConfig = values.mediaConfig;
  if (values.type === 'adb-enum') columnInfo.enumConfig = values.enumConfig;
  if (values.type === 'adb-auto-increment-id') columnInfo.autoIncrementIdConfig = values.autoIncrementIdConfig;
  if (values.type === 'adb-guid-id') columnInfo.guidIdConfig = values.guidIdConfig;
  if (values.type === 'adb-snowflake-id') columnInfo.snowflakeIdConfig = values.snowflakeIdConfig;

  return {
    ...editing,
    fieldKey: values.fieldKey,
    columnInfo,
    typeormConfig: {
      type: typeormType,
      length: values.length,
      precision: values.precision,
      scale: values.scale,
      nullable: isIDType(values.type || '') ? false : values.nullable,
      unique: isIDType(values.type || '') ? false : values.unique,
      primary: values.primary,
      default: values.default,
    },
  };
}

const FieldEditModal: React.FC<FieldEditModalProps> = ({
  open,
  isCreate,
  field,
  entityId,
  entityCode,
  enums,
  saving,
  onOk,
  onCancel,
}) => {
  const [form] = Form.useForm<FieldEditFormValues>();
  const [buckets, setBuckets] = useState<Array<{ code: string; name: string }>>([]);
  const [enumSelectOpen, setEnumSelectOpen] = useState(false);
  const selectedType = Form.useWatch('type', form);
  const selectedEnumCode = Form.useWatch(['enumConfig', 'enumCode'], form);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue(sanitizeFormValues(fieldToFormValues(field), enums));
  }, [open, field, form, enums]);

  useEffect(() => {
    if (!open || selectedType !== 'adb-enum' || !selectedEnumCode) return;
    const enumRecord = enums.find((e) => e.code === selectedEnumCode);
    const valid = new Set(enumDefaultValueOptions(enumRecord).map((o) => String(o.value)));
    const current = form.getFieldValue('default');
    if (current !== undefined && current !== '' && !valid.has(String(current))) {
      form.setFieldValue('default', undefined);
    }
  }, [open, selectedType, selectedEnumCode, enums, form]);

  useEffect(() => {
    if (!open || selectedType !== 'adb-media') return;
    (async () => {
      const res = await getStorageBuckets({ size: 200 });
      if (isApiSuccess(res)) {
        const { items } = parseApiListResponse<{ code: string; name: string }>(res);
        setBuckets(items);
      }
    })();
  }, [open, selectedType]);

  const typeOptions = useMemo(() => {
    const native = getTypeORMNativeTypes();
    const adb = getADBExtendTypes();
    return { native, adb };
  }, []);

  const defaultValueOptions = useMemo(() => {
    if (!selectedType) return [];
    if (selectedType === 'adb-enum') {
      if (!selectedEnumCode) return [];
      const enumRecord = enums.find((e) => e.code === selectedEnumCode);
      const opts = enumDefaultValueOptions(enumRecord);
      if (!opts.length) return [];
      return getDefaultValueOptions(selectedType, opts) || [];
    }
    return getDefaultValueOptions(selectedType) || [];
  }, [selectedType, selectedEnumCode, enums]);

  const showDefaultValue =
    selectedType &&
    shouldShowConfig(selectedType, 'default') &&
    (selectedType !== 'adb-enum' || !!selectedEnumCode) &&
    defaultValueOptions.length > 0;

  const inlineSwitchItems = useMemo((): InlineSwitchItemConfig[] => {
    if (!selectedType || isIDType(selectedType)) return [];
    const items: InlineSwitchItemConfig[] = [];
    if (shouldShowConfig(selectedType, 'nullable')) {
      items.push({ key: 'nullable', name: 'nullable', label: '可空' });
    }
    if (shouldShowConfig(selectedType, 'unique')) {
      items.push({ key: 'unique', name: 'unique', label: '唯一' });
    }
    if (shouldShowConfig(selectedType, 'primary')) {
      items.push({ key: 'primary', name: 'primary', label: '主键' });
    }
    if (selectedType === 'adb-enum') {
      items.push({
        key: 'enumMultiple',
        name: ['enumConfig', 'isMultiple'],
        label: '多选',
      });
    }
    return items;
  }, [selectedType]);

  const handleTypeChange = (value: string) => {
    const reset: Partial<FieldEditFormValues> = {};
    if (!requiresLengthConfig(value)) reset.length = undefined;
    if (!requiresPrecisionConfig(value)) {
      reset.precision = undefined;
      reset.scale = undefined;
    }
    if (!shouldShowConfig(value, 'default')) reset.default = undefined;
    if (value === 'adb-enum') {
      reset.default = undefined;
      reset.enumConfig = { isMultiple: false };
    }
    if (isIDType(value)) {
      reset.nullable = false;
      reset.unique = false;
      reset.primary = false;
      reset.default = undefined;
    }
    form.setFieldsValue(reset);
  };

  const handleOk = async () => {
    const values = await form.validateFields();
    await onOk(formValuesToField(values, field));
  };

  return (
    <Modal
      title={isCreate ? '添加字段' : '编辑字段'}
      open={open}
      width={640}
      confirmLoading={saving}
      onOk={handleOk}
      onCancel={onCancel}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item name="fieldKey" label="字段名" rules={[{ required: true }]}>
          <Input placeholder="例如 user_name" />
        </Form.Item>
        <Form.Item name="label" label="显示名" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="type" label="数据类型" rules={[{ required: true }]}>
          <Select placeholder="选择类型" onChange={handleTypeChange}>
            <Select.OptGroup label="TypeORM 原生类型">
              {typeOptions.native.map((t) => (
                <Option key={t.type} value={t.type.toLowerCase()}>
                  {t.label}
                </Option>
              ))}
            </Select.OptGroup>
            <Select.OptGroup label="ADB 扩展类型">
              {typeOptions.adb.map((t) => (
                <Option key={t.type} value={t.type}>
                  {t.label}
                </Option>
              ))}
            </Select.OptGroup>
          </Select>
        </Form.Item>

        {selectedType && getFieldTypeHint(selectedType) && (
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            {getFieldTypeHint(selectedType)}
          </Text>
        )}

        {selectedType === 'adb-enum' && (
          <>
            <Form.Item
              name={['enumConfig', 'enumCode']}
              label="关联枚举"
              rules={[{ required: true, message: '请选择枚举' }]}
            >
              <Space.Compact style={{ width: '100%' }}>
                <Input readOnly placeholder="点击选择枚举" value={selectedEnumCode || ''} />
                <Button onClick={() => setEnumSelectOpen(true)}>选择</Button>
                {selectedEnumCode ? (
                  <Tooltip title="清空">
                    <Button
                      icon={<ClearOutlined />}
                      onClick={() => {
                        form.setFieldValue(['enumConfig', 'enumCode'], undefined);
                        form.setFieldValue('default', undefined);
                      }}
                    />
                  </Tooltip>
                ) : null}
              </Space.Compact>
            </Form.Item>
            <EnumSelectModal
              open={enumSelectOpen}
              enums={enums}
              selectedCode={selectedEnumCode}
              onCancel={() => setEnumSelectOpen(false)}
              onConfirm={(code) => {
                form.setFieldValue(['enumConfig', 'enumCode'], code);
                const enumRecord = enums.find((e) => e.code === code);
                const valid = new Set(enumDefaultValueOptions(enumRecord).map((o) => String(o.value)));
                const current = form.getFieldValue('default');
                if (current !== undefined && current !== '' && !valid.has(String(current))) {
                  form.setFieldValue('default', undefined);
                }
                setEnumSelectOpen(false);
              }}
            />
          </>
        )}

        <InlineSwitchRow items={inlineSwitchItems} />

        {selectedType && requiresLengthConfig(selectedType) && (
          <Form.Item name="length" label="长度" rules={[{ required: true }]}>
            <InputNumber min={1} max={65535} style={{ width: '100%' }} />
          </Form.Item>
        )}

        {selectedType && requiresPrecisionConfig(selectedType) && (
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="precision" label="精度" rules={[{ required: true }]}>
                <InputNumber min={1} max={65} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            {requiresScaleConfig(selectedType) && (
              <Col span={12}>
                <Form.Item name="scale" label="小数位">
                  <InputNumber min={0} max={30} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            )}
          </Row>
        )}

        {showDefaultValue && (
          <Form.Item name="default" label="默认值">
            <Select allowClear placeholder="选择或留空">
              {defaultValueOptions.map((opt) => (
                <Option key={String(opt.value)} value={opt.value}>
                  {opt.label}
                </Option>
              ))}
            </Select>
          </Form.Item>
        )}

        {selectedType === 'adb-media' && (
          <>
            <Form.Item name={['mediaConfig', 'mediaType']} label="媒体类型" initialValue="image">
              <Select
                options={[
                  { label: '图片', value: 'image' },
                  { label: '视频', value: 'video' },
                  { label: '音频', value: 'audio' },
                  { label: '文档', value: 'document' },
                  { label: '文件', value: 'file' },
                ]}
              />
            </Form.Item>
            <Form.Item
              name={['mediaConfig', 'bucketCode']}
              label="存储 Bucket"
              rules={[{ required: true, message: '请选择 Bucket' }]}
            >
              <Select
                placeholder="选择 Bucket"
                options={buckets.map((b) => ({ label: `${b.name} (${b.code})`, value: b.code }))}
              />
            </Form.Item>
            <Form.Item name={['mediaConfig', 'maxSize']} label="最大大小 (MB)">
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
            <InlineSwitchRow
              items={[
                {
                  key: 'mediaMultiple',
                  name: ['mediaConfig', 'isMultiple'],
                  label: '多文件',
                },
              ]}
            />
          </>
        )}
      </Form>
      {!isCreate && field?.fieldKey && (
        <MetadataEditor
          mode="field"
          targetType="entity"
          targetId={entityId}
          targetCode={entityCode}
          fieldKey={field.fieldKey}
        />
      )}
    </Modal>
  );
};

export default FieldEditModal;
