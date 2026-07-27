import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import RequireAuth from './components/RequireAuth';
import Home from './pages/Home';
import Directory from './pages/Directory';
import CreatorProfile from './pages/CreatorProfile';
import Blog from './pages/Blog';
import BlogPost from './pages/BlogPost';
import Faq from './pages/Faq';
import Leaderboard from './pages/Leaderboard';
import Streams from './pages/Streams';
import Merch from './pages/Merch';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Onboarding from './pages/Onboarding';
import Settings from './pages/Settings';
import Admin from './pages/Admin';
import Referrals from './pages/Referrals';
import PointShop from './pages/PointShop';
import Verify from './pages/Verify';
import WhyTenPercent from './pages/WhyTenPercent';
import Watch from './pages/Watch';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/creators" element={<Directory />} />
        <Route path="/creators/:username" element={<CreatorProfile />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/:slug" element={<BlogPost />} />
        <Route path="/faq" element={<Faq />} />
        <Route path="/why-10-percent" element={<WhyTenPercent />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/streams" element={<Streams />} />
        <Route path="/merch" element={<Merch />} />
        <Route path="/login" element={<Login />} />
        {/* Public on purpose: /verify is the front door, signed in or not. */}
        <Route path="/verify" element={<Verify />} />
        {/* Public page, gated player — metadata is open, playback is entitlement-checked. */}
        <Route path="/watch/:id" element={<Watch />} />
        <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
        <Route path="/referrals" element={<RequireAuth><Referrals /></RequireAuth>} />
        <Route path="/shop" element={<PointShop />} />
        <Route path="/admin" element={<RequireAuth><Admin /></RequireAuth>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
