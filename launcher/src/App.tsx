import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { ProjectsScreen } from './components/ProjectsScreen';
import { NewIdeaScreen } from './components/NewIdeaScreen';
import { ProjectDetailScreen, ProjectTabScreen } from './components/ProjectDetailScreen';

// Single-column frame for the screens without the per-project menu. The
// two-column `.app` grid (sidebar + main) only applies inside an open
// project — /projects and /new keep the `app full` layout they had when the
// wrapper was hardcoded here (sitemap screens 1/7: "Sidebar: none").
function FullFrame() {
  return (
    <div className="app full">
      <Outlet />
    </div>
  );
}

// App shell. Per the v5 plan there is no global sidebar; the initial Projects
// screen and the New idea flow live in single-column (`app full`) layouts,
// and the per-project menu only appears inside an open project. Project tabs
// are sub-routes under /projects/:id so the URL bar reflects the active tab.
export default function App() {
  return (
    <Routes>
      <Route element={<FullFrame />}>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/projects" element={<ProjectsScreen />} />
        <Route path="/new" element={<NewIdeaScreen />} />
      </Route>
      <Route path="/projects/:id" element={<ProjectDetailScreen />}>
        <Route index element={<Navigate to="overview" replace />} />
        <Route path=":tab" element={<ProjectTabScreen />} />
      </Route>
      <Route path="*" element={<Navigate to="/projects" replace />} />
    </Routes>
  );
}