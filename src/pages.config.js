import PredictionForm from './pages/PredictionForm';
import ViewSubmissions from './pages/ViewSubmissions';
import Statistics from './pages/Statistics';
import LeaderboardNew from './pages/LeaderboardNew';
import SystemOverview from './pages/SystemOverview';
import CreateGame from './pages/CreateGame';
import FormBuilder from './pages/FormBuilder';
import UserManagement from './pages/UserManagement';
import JoinGame from './pages/JoinGame';
import ManageGameParticipants from './pages/ManageGameParticipants';
import AdminResults from './pages/AdminResults';
import ExportData from './pages/ExportData';
import ImportData from './pages/ImportData';
import CleanScoreTable from './pages/CleanScoreTable';
import TeamComparison from './pages/TeamComparison';
import __Layout from './Layout.jsx';

export const PAGES = {
  LeaderboardNew,
  PredictionForm,
  ViewSubmissions,
  Statistics,
  AdminResults,
  FormBuilder,
  CreateGame,
  SystemOverview,
  UserManagement,
  JoinGame,
  ManageGameParticipants,
  ExportData,
  ImportData,
  CleanScoreTable,
  TeamComparison,
};

export const pagesConfig = {
  mainPage: 'LeaderboardNew',
  Pages: PAGES,
  Layout: __Layout,
};
