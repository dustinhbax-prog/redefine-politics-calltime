import { lazy } from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'

// All route pages are code-split into their own lazy-loaded chunks so they
// don't bloat the initial bundle. HomePage stays eager (it's the landing
// route). The Suspense boundary lives in Layout.
const CandidatesPage = lazy(() => import('./pages/CandidatesPage'))
const CommitteesPage = lazy(() => import('./pages/CommitteesPage'))
const DonorsPage = lazy(() => import('./pages/DonorsPage'))
const DonorProfilePage = lazy(() => import('./pages/DonorProfilePage'))
const WatchlistPage = lazy(() => import('./pages/WatchlistPage'))
const MissouriCandidatesPage = lazy(() => import('./pages/MissouriCandidatesPage'))
const ProspectScoringPage = lazy(() => import('./pages/ProspectScoringPage'))
const FundraisingListsPage = lazy(() => import('./pages/FundraisingListsPage'))
const ContactsPage = lazy(() => import('./pages/ContactsPage'))
const NamelessContactsPage = lazy(() => import('./pages/NamelessContactsPage'))
const NetworkGraphPage = lazy(() => import('./pages/NetworkGraphPage'))
const MoneyFlowPage = lazy(() => import('./pages/MoneyFlowPage'))
const LegislaturePage = lazy(() => import('./pages/LegislaturePage'))
const EmailBuilderPage = lazy(() => import('./pages/EmailBuilderPage'))
const EmailHarvesterPage = lazy(() => import('./pages/EmailHarvesterPage'))
const DpiMapPage = lazy(() => import('./pages/DpiMapPage'))
const VerificationReviewPage = lazy(() => import('./pages/VerificationReviewPage'))
const RolodexAdminPage = lazy(() => import('./pages/RolodexAdminPage'))
// Standalone client PWA — rendered OUTSIDE the Layout chrome + password gate.
const RolodexPage = lazy(() => import('./pages/RolodexPage'))

export default function App() {
  return (
    <Routes>
      {/* Public client PWA — its own full-screen page, token-authed, no app chrome. */}
      <Route path="/rolodex" element={<RolodexPage />} />
      <Route path="/" element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="candidates" element={<CandidatesPage />} />
        <Route path="mo-candidates" element={<MissouriCandidatesPage />} />
        <Route path="committees" element={<CommitteesPage />} />
        <Route path="donors" element={<DonorsPage />} />
        <Route path="donors/profile" element={<DonorProfilePage />} />
        <Route path="prospects" element={<ProspectScoringPage />} />
        <Route path="fundraising-lists" element={<FundraisingListsPage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="contacts-without-names" element={<NamelessContactsPage />} />
        <Route path="rolodex-admin" element={<RolodexAdminPage />} />
        <Route path="watchlist" element={<WatchlistPage />} />
        <Route path="network" element={<NetworkGraphPage />} />
        <Route path="flow" element={<MoneyFlowPage />} />
        <Route path="legislature" element={<LegislaturePage />} />
        <Route path="dpi-map" element={<DpiMapPage />} />
        <Route path="email-builder" element={<EmailBuilderPage />} />
        <Route path="email-harvester" element={<EmailHarvesterPage />} />
        <Route path="verifications" element={<VerificationReviewPage />} />
      </Route>
    </Routes>
  )
}
