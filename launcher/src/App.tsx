import { Navigate, Route, Routes } from 'react-router-dom';
import { ProjectsScreen } from './components/ProjectsScreen';
import { NewIdeaScreen } from './components/NewIdeaScreen';
import { ProjectDetailScreen } from './components/ProjectDetailScreen';

// App shell — single frosted-glass panel. Per the v5 plan there is no
// global sidebar; the initial Projects screen and the New idea flow live
// in single-column (`app full`) layouts, and the per-project menu only
// appears inside an open project (Stage 2).
export default function App() {
  return (
    <div className="app full">
      <Routes>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/projects" element={<ProjectsScreen />} />
        <Route path="/new" element={<NewIdeaScreen />} />
        <Route path="/projects/:id" element={<ProjectDetailScreen />} />
        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Routes>
    </div>
  );
}
