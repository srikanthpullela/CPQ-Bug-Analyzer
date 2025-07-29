// File: src/App.tsx
import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Sfdc from './pages/Sfdc';
import Turbo from './pages/Turbo';
import JsonFormatter from './pages/JsonFormatter';
import CompareJsonPage from "./pages/CompareJsonPage";
import HarSupport from "./pages/HarMethod";
import HarMethodsTabPage from "./pages/HarMethodsTabPage";
import LogAnalyzerPage from './pages/LogAnalyzerPage';
import { CodePieces } from "./pages/components/CodePieces";

const App: React.FC = () => (
  <HashRouter>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/sfdc" element={<Sfdc />} />
      <Route path="/turbo" element={<Turbo />} />
      <Route path="/formatter" element={<JsonFormatter />} />
      <Route path="/compare" element={<CompareJsonPage />} />
      <Route path="/har" element={<HarSupport />} />
      <Route path="/harTab" element={<HarMethodsTabPage />} />
      <Route path="/log" element={<LogAnalyzerPage />} />
      <Route path="/pieces" element={<CodePieces />} />
    </Routes>
  </HashRouter>
);

export default App;