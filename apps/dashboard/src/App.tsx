import { Navigate, Route, BrowserRouter, Routes } from 'react-router-dom';
import { holds } from './state/access';
import { useStaffAuthStore } from './state/staff-auth-store';
import { RequireStaff } from './components/RequireStaff';
import { StaffLayout } from './components/StaffLayout';
import { Companies } from './pages/admin/Companies';
import { CongestionReports } from './pages/admin/CongestionReports';
import { DriverAccounts } from './pages/admin/DriverAccounts';
import { HazardReports } from './pages/admin/HazardReports';
import { Drivers } from './pages/fleet/Drivers';
import { FleetOverview } from './pages/fleet/Overview';
import { LiveTrips } from './pages/fleet/LiveTrips';
import { VehicleProfiles } from './pages/fleet/VehicleProfiles';
import { InviteCodes } from './pages/admin/InviteCodes';
import { Activity } from './pages/staff/Activity';
import { Join } from './pages/staff/Join';
import { StaffSignIn } from './pages/staff/StaffSignIn';
import { Users } from './pages/staff/Users';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* One sign-in, for staff accounts (P2-M1.12c). The old driver sign-in's address sends
            anyone with a bookmark to it. */}
        <Route path="/staff/sign-in" element={<StaffSignIn />} />
        <Route path="/sign-in" element={<Navigate to="/staff/sign-in" replace />} />
        <Route path="/join" element={<Join />} />
        <Route element={<RequireStaff />}>
          <Route element={<StaffLayout />}>
            <Route index element={<Home />} />
            <Route path="/fleet" element={<FleetOverview />} />
            <Route path="/fleet/live-trips" element={<LiveTrips />} />
            <Route path="/fleet/drivers" element={<Drivers />} />
            <Route path="/fleet/vehicle-profiles" element={<VehicleProfiles />} />
            <Route path="/staff" element={<Navigate to="/staff/users" replace />} />
            <Route path="/staff/users" element={<Users />} />
            <Route path="/staff/activity" element={<Activity />} />
            <Route path="/admin/companies" element={<Companies />} />
            <Route path="/admin/invite-codes" element={<InviteCodes />} />
            <Route path="/admin/hazard-reports" element={<HazardReports />} />
            <Route path="/admin/congestion-reports" element={<CongestionReports />} />
            <Route path="/admin/driver-accounts" element={<DriverAccounts />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

/** Where signing in lands: Users for those who manage people (and WagonWise staff, whose first
 *  job is inviting everyone else), the fleet pages for everyone else. */
function Home() {
  const staff = useStaffAuthStore((s) => s.session?.staff);
  return <Navigate to={holds(staff, 'manage_users') ? '/staff/users' : '/fleet'} replace />;
}
