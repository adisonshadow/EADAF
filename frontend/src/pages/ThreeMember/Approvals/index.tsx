import { PageContainer } from '@ant-design/pro-components';
import { Button, Input, Modal, Space, Table, Typography } from 'antd';
import { message } from '@/utils/antdAppApis';
import React, { useCallback, useEffect, useState } from 'react';
import {
  getThreeMemberApprovals,
  postThreeMemberApprovalDecision,
  type ThreeMemberApproval,
} from '@/services/EADAF/api/threeMemberApprovals';
import { getApiData, isApiSuccess } from '@/utils/apiResponse';
import dayjs from 'dayjs';

const ACTION_LABEL: Record<string, string> = {
  restore_backup: '恢复数据库',
  log_rotation: '修改日志滚动',
  user_status: '变更用户状态',
  user_delete: '删除用户',
  reset_password: '重置密码',
};

export default function ThreeMemberApprovalsPage() {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ThreeMemberApproval[]>([]);
  const [target, setTarget] = useState<ThreeMemberApproval | null>(null);
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getThreeMemberApprovals();
      if (isApiSuccess(res)) {
        setItems(getApiData<{ items?: ThreeMemberApproval[] }>(res)?.items || []);
      } else {
        message.error(res.message || '加载审批失败');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    if (!target) return;
    setSubmitting(true);
    try {
      const res = await postThreeMemberApprovalDecision(target.id, decision, comment);
      if (isApiSuccess(res)) {
        message.success(res.message || '已处理');
        setTarget(null);
        setComment('');
        await load();
      } else {
        message.error(res.message || '处理失败');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageContainer title={<></>}>
      <Typography.Paragraph type="secondary">
        系统管理员提交的恢复、日志滚动、停用/归档/删除用户和重置密码，批准后才会执行。不能审批自己提交的申请。
      </Typography.Paragraph>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={items}
        pagination={false}
        columns={[
          {
            title: '时间',
            dataIndex: 'createdAt',
            width: 180,
            render: (value) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '—'),
          },
          {
            title: '类型',
            dataIndex: 'actionType',
            width: 140,
            render: (value) => ACTION_LABEL[value] || value,
          },
          { title: '说明', dataIndex: 'summary' },
          { title: '提交人', dataIndex: 'requesterName', width: 140 },
          {
            title: '操作',
            width: 160,
            render: (_, record) => (
              <Space>
                <Button
                  type="primary"
                  size="small"
                  onClick={() => {
                    setDecision('approve');
                    setComment('');
                    setTarget(record);
                  }}
                >
                  批准
                </Button>
                <Button
                  size="small"
                  onClick={() => {
                    setDecision('reject');
                    setComment('');
                    setTarget(record);
                  }}
                >
                  驳回
                </Button>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={decision === 'approve' ? '批准并执行' : '驳回'}
        open={Boolean(target)}
        confirmLoading={submitting}
        onCancel={() => setTarget(null)}
        onOk={() => void submit()}
      >
        <Typography.Paragraph>{target?.summary}</Typography.Paragraph>
        <Input.TextArea
          rows={3}
          placeholder="审批意见（可选）"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
        />
      </Modal>
    </PageContainer>
  );
}
