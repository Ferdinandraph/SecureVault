import React, { createContext, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import { ToastProvider } from './components/Toast';
import Index from './pages/Index';
import Dashboard from './pages/Dashboard';
import Login from './components/Login';
import Register from './components/Register';
import Profile from './pages/Profile';
import NotFound from './pages/NotFound';
import PublicShare from './components/PublicShare';
import FileDecrypt from './components/FileDecrypt';

export const AuthContext = createContext();

const PrivateRoute = ({ children }) => {
  const { isAuthenticated, loading } = React.useContext(AuthContext);
  if (loading) return null; // Wait until validation completes
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const validateToken = async (token, userId) => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_BACKEND_URI}/api/users/security`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Token validation response:', response.data);
      return true;
    } catch (error) {
      console.error('Token validation error:', error.response?.data || error.message);
      if (error.response?.status === 401 || error.response?.status === 404) {
        logout();
      }
      return false;
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUserId = localStorage.getItem('userId');
    const storedEmail = localStorage.getItem('userEmail');
    if (token && storedUserId && storedEmail) {
      validateToken(token, storedUserId).then((isValid) => {
        if (isValid) {
          setIsAuthenticated(true);
          setUser({ id: storedUserId, email: storedEmail });
        } else {
          setIsAuthenticated(false);
          setUser(null);
        }
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  const login = (token, userData) => {
    localStorage.setItem('token', token);
    localStorage.setItem('userId', userData._id || userData.id);
    localStorage.setItem('userEmail', userData.email);
    localStorage.setItem('encryptedPrivateKey', userData.encryptedPrivateKey || '');
    setIsAuthenticated(true);
    setUser({ id: userData._id || userData.id, email: userData.email });
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('encryptedPrivateKey');
    setIsAuthenticated(false);
    setUser(null);
  };

  return (
    <ToastProvider>
      <AuthContext.Provider value={{ isAuthenticated, user, login, logout, loading }}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route
              path="/dashboard"
              element={
                <PrivateRoute>
                  <Dashboard />
                </PrivateRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <PrivateRoute>
                  <Profile />
                </PrivateRoute>
              }
            />
            <Route path="/public/share/:fileId/:token" element={<PublicShare />} />
            <Route path="/decrypt" element={<FileDecrypt />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthContext.Provider>
    </ToastProvider>
  );
};

export default App;