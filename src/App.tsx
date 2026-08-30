import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { DataProvider } from './lib/data';
import { ToastProvider } from './lib/ui';
import Layout from './components/Layout';
import Home from './pages/Home';
import Routine from './pages/Routine';
import FacultyRoutine from './pages/FacultyRoutine';
import RoomSchedule from './pages/RoomSchedule';
import LabRoutine from './pages/LabRoutine';
import SearchRoutine from './pages/SearchRoutine';
import Announcements from './pages/Announcements';
import Login from './pages/Login';
import AdminDashboard from './admin/AdminDashboard';
import AdminRoutines from './admin/AdminRoutines';
import AdminOffDays from './admin/AdminOffDays';
import { AdminCourses, AdminFaculty, AdminRooms, AdminBatches, AdminCatalog, AdminAnnouncements, AdminSettings } from './admin/AdminCatalog';

export default function App() {
  return (
    <ToastProvider>
      <DataProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Home />} />
              <Route path="/routine" element={<Routine />} />
              <Route path="/faculty" element={<FacultyRoutine />} />
              <Route path="/rooms" element={<RoomSchedule />} />
              <Route path="/lab" element={<LabRoutine />} />
              <Route path="/search" element={<SearchRoutine />} />
              <Route path="/announcements" element={<Announcements />} />
              <Route path="/login" element={<Login />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/routines" element={<AdminRoutines />} />
              <Route path="/admin/offdays" element={<AdminOffDays />} />
              <Route path="/admin/courses" element={<AdminCourses />} />
              <Route path="/admin/faculty" element={<AdminFaculty />} />
              <Route path="/admin/rooms" element={<AdminRooms />} />
              <Route path="/admin/batches" element={<AdminBatches />} />
              <Route path="/admin/catalog" element={<AdminCatalog />} />
              <Route path="/admin/announcements" element={<AdminAnnouncements />} />
              <Route path="/admin/settings" element={<AdminSettings />} />
              <Route path="*" element={<Home />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </DataProvider>
    </ToastProvider>
  );
}
