import { Navigate, Route, BrowserRouter, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { CongestionReports } from './pages/admin/CongestionReports';
import { DriverAccounts } from './pages/admin/DriverAccounts';
import { HazardReports } from './pages/admin/HazardReports';
import { Drivers } from './pages/fleet/Drivers';
import { FleetOverview } from './pages/fleet/Overview';
import { LiveTrips } from './pages/fleet/LiveTrips';
import { VehicleProfiles } from './pages/fleet/VehicleProfiles';
import { SignIn } from './pages/SignIn';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/sign-in" element={<SignIn />} />
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/fleet" replace />} />
          <Route path="/fleet" element={<FleetOverview />} />
          <Route path="/fleet/live-trips" element={<LiveTrips />} />
          <Route path="/fleet/drivers" element={<Drivers />} />
          <Route path="/fleet/vehicle-profiles" element={<VehicleProfiles />} />
          <Route path="/admin/hazard-reports" element={<HazardReports />} />
          <Route path="/admin/congestion-reports" element={<CongestionReports />} />
          <Route path="/admin/driver-accounts" element={<DriverAccounts />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
