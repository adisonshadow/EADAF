import { request } from '@/utils/request';

export type ThreeMemberApproval = {
  id: string;
  actionType: string;
  summary: string;
  status: string;
  comment?: string | null;
  requesterId?: string;
  requesterName?: string | null;
  createdAt?: string;
};

export async function getThreeMemberApprovals() {
  return request<{ code?: number; message?: string; data?: { items?: ThreeMemberApproval[] } }>(
    '/api/v1/admin/three-member-approvals',
    { method: 'GET' },
  );
}

export async function postThreeMemberApprovalDecision(
  id: string,
  decision: 'approve' | 'reject',
  comment?: string,
) {
  return request<{ code?: number; message?: string }>(
    `/api/v1/admin/three-member-approvals/${id}/${decision}`,
    { method: 'POST', data: { comment } },
  );
}
