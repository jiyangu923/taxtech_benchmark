import { Route, Routes } from 'react-router-dom';

import SiteLayout from './components/SiteLayout';
import AutomationPage from './pages/AutomationPage';
import BenchmarkPage from './pages/BenchmarkPage';
import CompliancePage from './pages/CompliancePage';
import HomePage from './pages/HomePage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route index element={<HomePage />} />
        <Route path="automation" element={<AutomationPage />} />
        <Route path="automation/compliance" element={<CompliancePage />} />
        <Route path="benchmark" element={<BenchmarkPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
