import { ApiOutlined, AppstoreOutlined } from '@ant-design/icons';
import { Empty, Spin, Tree, Typography } from 'antd';
import type { DataNode } from 'antd/es/tree';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getBuiltinApis, type BuiltinApiTreeNode } from '@/services/EADAF/api/builtinApis';
// 注意：admin 端点返回的树节点字段为 { code, label, key, isLeaf, fullCode?, children? }
// （与公开目录的 { name, isApiNode } 不同）。此处按 admin 树结构映射。
import { isApiSuccess, getApiData } from '@/utils/apiResponse';

const { Text } = Typography;

export interface BuiltinApiTreePickerProps {
  value?: string[];
  onChange?: (codes: string[]) => void;
  enabled?: boolean;
  height?: number;
}

/** 后端 admin 树节点（domain→resource→action，叶子为具体内置 API）转 antd DataNode */
function toTreeData(nodes: BuiltinApiTreeNode[]): DataNode[] {
  return nodes.map((node) => {
    const isLeaf = node.isLeaf === true;
    const display = node.label || node.code;
    return {
      key: node.code,
      title: isLeaf ? (
        <span>
          <ApiOutlined style={{ marginRight: 6, color: '#1677ff' }} />
          <Text>{display}</Text>
          <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>{node.code}</Text>
        </span>
      ) : (
        <span>
          <AppstoreOutlined style={{ marginRight: 6 }} />
          <Text strong>{display}</Text>
        </span>
      ),
      checkable: isLeaf, // 仅叶子（具体内置 API）可勾选授权
      disableCheckbox: !isLeaf,
      selectable: false,
      isLeaf,
      children: node.children?.length ? toTreeData(node.children) : undefined,
    };
  });
}

/** 收集树中所有叶子 code（用于全选/勾选联动） */
function collectLeafCodes(nodes: BuiltinApiTreeNode[]): string[] {
  const codes: string[] = [];
  const walk = (list: BuiltinApiTreeNode[]) => {
    list.forEach((n) => {
      if (n.isLeaf) codes.push(n.code);
      if (n.children?.length) walk(n.children);
    });
  };
  walk(nodes);
  return codes;
}

const BuiltinApiTreePicker: React.FC<BuiltinApiTreePickerProps> = ({
  value = [],
  onChange,
  enabled = true,
  height = 360,
}) => {
  const [tree, setTree] = useState<BuiltinApiTreeNode[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const res = await getBuiltinApis();
      if (isApiSuccess(res)) {
        setTree(getApiData(res)?.tree || []);
      }
    } catch {
      setTree([]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const antTreeData = useMemo(() => toTreeData(tree), [tree]);

  return (
    <Spin spinning={loading}>
      {antTreeData.length ? (
        <Tree
          showLine
          defaultExpandAll
          checkable
          selectable={false}
          checkedKeys={value}
          onCheck={(keys) => {
            const next = Array.isArray(keys) ? keys : keys.checked;
            // 仅保留叶子 code（剔除被联动勾选的域节点 key）
            const leafSet = new Set(collectLeafCodes(tree));
            onChange?.(next.map(String).filter((k) => leafSet.has(k)));
          }}
          treeData={antTreeData}
          height={height}
          style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 8 }}
        />
      ) : (
        <Empty description="暂无内置 API 清单" />
      )}
    </Spin>
  );
};

export default BuiltinApiTreePicker;
