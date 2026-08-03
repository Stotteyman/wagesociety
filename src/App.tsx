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
import LinkDevice from './pages/LinkDevice';
import WhyTenPercent from './pages/WhyTenPercent';
import Plans from './pages/Plans';
import Tools from './pages/Tools';
import Watch from './pages/Watch';
import Terms from './pages/Terms';
import PrivacyPolicy from './pages/PrivacyPolicy';
import Invite from './pages/Invite';
import JoinTheTeam from './pages/JoinTheTeam';
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
        <Route path="/plans" element={<Plans />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/streams" element={<Streams />} />
        <Route path="/merch" element={<Merch />} />
        <Route path="/login" element={<Login />} />
        {/* Where a referral link lands. Public, and it has to be: the whole point is
            that the visitor does not have an account yet. */}
        <Route path="/join/:handle" element={<Invite />} />
        {/* Public on purpose: /verify is the front door, signed in or not. */}
        <Route path="/verify" element={<Verify />} />
        <Route path="/link" element={<LinkDevice />} />
        {/* Public page, gated player — metadata is open, playback is entitlement-checked. */}
        <Route path="/watch/:id" element={<Watch />} />
        {/* Same shape as /watch: the page sells the tool to everyone, the
            download itself is tier-checked server-side. */}
        {/* Member software, not a public page — reached from the dashboard. */}
        <Route path="/tools" element={<RequireAuth><Tools /></RequireAuth>} />
        <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
        <Route path="/referrals" element={<RequireAuth><Referrals /></RequireAuth>} />
        <Route path="/shop" element={<PointShop />} />
        <Route path="/admin" element={<RequireAuth><Admin /></RequireAuth>} />
        {/* Public: the openings list is readable signed out, applying is not. */}
        <Route path="/join-the-team" element={<JoinTheTeam />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        {/* People type these; send them to the real pages rather than a 404. */}
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms-of-service" element={<Terms />} />
        <Route path="/careers" element={<JoinTheTeam />} />
        <Route path="/staff" element={<JoinTheTeam />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
