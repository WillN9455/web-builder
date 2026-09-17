import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { ProjectsScreen } from './components/ProjectsScreen';
import { NewIdeaScreen } from './components/NewIdeaScreen';
import { ProjectDetailScreen, ProjectTabScreen } from './components/ProjectDetailScreen';
import { ProjectBackgroundScreen } from './components/ProjectBackgroundScreen';
import { RequirementsScreen } from './components/requirements/RequirementsScreen';
import { SprintScreen } from './components/sprint/SprintScreen';
import { DesignScreen } from './components/design/DesignScreen';
import { DesignStoryScreen } from './components/design/DesignStoryScreen';
import { BuildScreen } from './components/build/BuildScreen';
import { BuildStoryScreen } from './components/build/BuildStoryScreen';

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
        {/* Project Background has its own screen (BA Workspace, screens
            12–14 + State D), as does Requirements (screen 15); the remaining
            tabs stay placeholders until their Stage-2 tasks. Declared before
            `:tab` so they win the match. */}
        <Route path="background" element={<ProjectBackgroundScreen />} />
        <Route path="requirements" element={<RequirementsScreen />} />
        <Route path="sprint" element={<SprintScreen />} />
        {/* Design routes are declared before the `:tab` catch-all below.
            The design screen is gated (ProjectSidebar gated:true) and the
            detail route resolves a story id that never collides with a tab. */}
        <Route path="design" element={<DesignScreen />} />
        <Route path="design/:storyId" element={<DesignStoryScreen />} />
        {/* Build routes are declared before the `:tab` catch-all, mirroring
            design. `build/rules` must be declared before `build/:storyId` so a
            deep link to the rules screen does not resolve `rules` as a story
            id (the server has the same route-order guard). `/rules` is the
            deep-link target; the in-tab Status/Rules pill switch is a UI-only
            mode toggle (FR-5) and does not navigate. */}
        <Route path="build" element={<BuildScreen />} />
        <Route path="build/rules" element={<BuildScreen />} />
        <Route path="build/:storyId" element={<BuildStoryScreen />} />
        <Route path=":tab" element={<ProjectTabScreen />} />
      </Route>
      <Route path="*" element={<Navigate to="/projects" replace />} />
    </Routes>
  );
}