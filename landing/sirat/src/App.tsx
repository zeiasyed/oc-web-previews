import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SettingsProvider } from './context/SettingsContext';
import { Splash } from './pages/Splash';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Home } from './pages/Home';
import { MosquePage } from './pages/MosquePage';
import { Profile } from './pages/Profile';
import { Settings } from './pages/Settings';
import { Feedback } from './pages/Feedback';
import { Qibla } from './pages/Qibla';
import { Duas } from './pages/Duas';
import { Tasbih } from './pages/Tasbih';
import { TonightsPrograms } from './pages/TonightsPrograms';
import { LostFound } from './pages/LostFound';
import { IslamicCalendar } from './pages/IslamicCalendar';
import { Announcements } from './pages/Announcements';
import { QuranReader } from './pages/QuranReader';
import { ComingSoon } from './pages/ComingSoon';
import { AdminDashboard } from './pages/admin/AdminDashboard';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-charcoal flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gold/50 border-t-gold rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Splash />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
      <Route path="/mosque/:id" element={<ProtectedRoute><MosquePage /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
      <Route path="/qibla" element={<ProtectedRoute><Qibla /></ProtectedRoute>} />
      <Route path="/duas" element={<ProtectedRoute><Duas /></ProtectedRoute>} />
      <Route path="/tasbih" element={<ProtectedRoute><Tasbih /></ProtectedRoute>} />
      <Route path="/tonight" element={<ProtectedRoute><TonightsPrograms /></ProtectedRoute>} />
      <Route path="/lost-found" element={<ProtectedRoute><LostFound /></ProtectedRoute>} />
      <Route path="/calendar" element={<ProtectedRoute><IslamicCalendar /></ProtectedRoute>} />
      <Route path="/announcements" element={<ProtectedRoute><Announcements /></ProtectedRoute>} />
      <Route path="/quran" element={<ProtectedRoute><QuranReader /></ProtectedRoute>} />
      <Route path="/halal" element={
        <ProtectedRoute>
          <ComingSoon
            title="Halal Restaurants"
            description="Find nearby halal restaurants and food options around each mosque. Coming in the next update."
          />
        </ProtectedRoute>
      } />
      <Route path="/notifications" element={
        <ProtectedRoute>
          <ComingSoon
            title="Push Notifications"
            description="Get alerts for prayer times, upcoming programs, and community news. Coming in the next update."
          />
        </ProtectedRoute>
      } />
      <Route path="/language" element={
        <ProtectedRoute>
          <ComingSoon
            title="Multi-Language"
            description="Switch between English, Urdu, and Arabic with full RTL support. Coming in the next update."
          />
        </ProtectedRoute>
      } />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/feedback" element={<ProtectedRoute><Feedback /></ProtectedRoute>} />
      <Route path="/admin/:mosqueId?" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter basename="/oc-web-previews/landing/sirat">
      <SettingsProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </SettingsProvider>
    </BrowserRouter>
  );
}
