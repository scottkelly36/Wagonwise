import { isPlatform } from '../../state/access';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { ManagerHome } from '../home/ManagerHome';
import { PlatformHome } from '../home/PlatformHome';

/** Everyone's landing page: WagonWise staff see the business, a company's staff see their own fleet today. */
export function FleetOverview() {
  const me = useStaffAuthStore((s) => s.session?.staff);
  if (me === undefined) return null;
  if (isPlatform(me)) return <PlatformHome />;
  if (me.companyId === undefined) return null;
  return <ManagerHome companyId={me.companyId} />;
}
