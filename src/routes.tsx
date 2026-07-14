import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import { LoginPage } from './features/auth/LoginPage';
import { HomePage } from './features/home/HomePage';
import { AccountPage } from './features/account/AccountPage';
import { ChildrenPage } from './features/children/ChildrenPage';
import { NewChildPage } from './features/children/NewChildPage';
import { GenerateHomeworkPage } from './features/devoirs/GenerateHomeworkPage';
import { DevoirsPage } from './features/devoirs/DevoirsPage';
import { CaptureCopiesPage } from './features/copies/CaptureCopiesPage';
import { DossierPage } from './features/dossier/DossierPage';

export const router = createBrowserRouter([
  { path: '/connexion', element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <HomePage /> },
          { path: '/enfants', element: <ChildrenPage /> },
          { path: '/enfants/nouveau', element: <NewChildPage /> },
          { path: '/enfants/:childId/devoir', element: <GenerateHomeworkPage /> },
          { path: '/enfants/:childId/devoirs', element: <DevoirsPage /> },
          { path: '/enfants/:childId/devoirs/:homeworkId/copies', element: <CaptureCopiesPage /> },
          { path: '/enfants/:childId/dossier', element: <DossierPage /> },
          { path: '/compte', element: <AccountPage /> },
        ],
      },
    ],
  },
]);
