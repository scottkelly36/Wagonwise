import { Navigate, Route, BrowserRouter, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireAdmin } from './components/RequireAdmin';
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
import { SignIn } from './pages/SignIn';
import { Activity } from './pages/staff/Activity';
import { Join } from './pages/staff/Join';
import { StaffSignIn } from './pages/staff/StaffSignIn';
import { Users } from './pages/staff/Users';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/sign-in" element={<SignIn />} />
        {/* Staff accounts (P2-M1.10): their own sign-in and session, alongside the driver one
            until the cutover (P2-M1.12). */}
        <Route path="/staff/sign-in" element={<StaffSignIn />} />
        <Route path="/join" element={<Join />} />
        <Route element={<RequireStaff />}>
          <Route element={<StaffLayout />}>
            <Route path="/staff" element={<Navigate to="/staff/users" replace />} />
            <Route path="/staff/users" element={<Users />} />
            <Route path="/staff/activity" element={<Activity />} />
          </Route>
        </Route>
        <Route element={<RequireAdmin />}>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/fleet" replace />} />
            <Route path="/fleet" element={<FleetOverview />} />
            <Route path="/fleet/live-trips" element={<LiveTrips />} />
            <Route path="/fleet/drivers" element={<Drivers />} />
            <Route path="/fleet/vehicle-profiles" element={<VehicleProfiles />} />
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
