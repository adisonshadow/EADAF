import { Navigate } from 'react-router-dom';
import { useInitialState } from '@/providers/InitialStateProvider';

/** 点「三员」分组时，按身份进审批或审计。 */
export default function ThreeMemberHome() {
  const { initialState } = useInitialState();
  const role = initialState?.currentUser?.three_member_role;
  if (role === 'auditor') return <Navigate to="/three_member/audit" replace />;
  return <Navigate to="/three_member/approvals" replace />;
}
