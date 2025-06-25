import React, { useState, useEffect, useContext } from 'react';
import { User, Mail, Shield, LogOut, ChevronDown, Edit } from 'lucide-react';
import { useToast } from '../components/Toast';
import { AuthContext } from '../App';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const Profile = () => {
  const [userData, setUserData] = useState({ email: '', isVerified: false });
  const { addToast } = useToast();
  const { logout, user } = useContext(AuthContext);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token || !user?.id) {
          addToast({ title: 'Authentication Error', description: 'Please log in again.', type: 'error' });
          navigate('/login');
          return;
        }
        const { data } = await axios.get(`${import.meta.env.VITE_BACKEND_URI}/api/users/security`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setUserData({
          email: localStorage.getItem('userEmail') || data.email,
          isVerified: data.emailVerified,
        });
      } catch (error) {
        console.error('Fetch user data error:', error);
        addToast({
          title: 'Error',
          description: error.response?.data?.message || 'Failed to fetch user data.',
          type: 'error',
        });
        if (error.response?.status === 401 || error.response?.status === 404) {
          logout();
          navigate('/login');
        }
      }
    };
    fetchUserData();
  }, [addToast, navigate, logout, user]);

  const handleEditProfile = () => {
    addToast({
      title: 'Info',
      description: 'Profile editing is not implemented yet.',
      type: 'info',
    });
    // Placeholder for future edit functionality (e.g., update email)
  };

  const handleManageSecurity = () => {
    navigate('/dashboard', { state: { activeTab: 'security' } });
    addToast({
      title: 'Navigation',
      description: 'Redirecting to security settings.',
      type: 'success',
    });
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
    addToast({
      title: 'Logged Out',
      description: 'You have been logged out successfully.',
      type: 'success',
    });
  };

  if (!user) {
    return null; // Prevent rendering until auth is confirmed
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Shield className="h-8 w-8 text-blue-600" />
              <h1 className="text-2xl font-bold">SecureVault</h1>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/dashboard')}
                className="border border-gray-300 text-gray-600 px-3 py-1 rounded-md hover:bg-gray-200 text-sm flex items-center"
              >
                Dashboard
              </button>
              <div className="relative group">
                <button
                  className="flex items-center border border-gray-300 text-gray-600 px-3 py-1 rounded-md hover:bg-gray-200 text-sm"
                >
                  Profile
                  <ChevronDown className="h-4 w-4 ml-1" />
                </button>
                <div className="absolute right-0 mt-2 w-48 bg-white border rounded-md shadow-lg hidden group-hover:block z-10">
                  <button
                    onClick={handleEditProfile}
                    className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 flex items-center"
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Profile
                  </button>
                  <button
                    onClick={handleManageSecurity}
                    className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 flex items-center"
                  >
                    <Shield className="h-4 w-4 mr-2" />
                    Security
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 flex items-center"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Log out
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center gap-8">
          <div className="w-full max-w-3xl flex flex-col items-start gap-8">
            <h2 className="text-3xl font-bold text-default-font">
              {userData.email}'s Profile
            </h2>
            <div className="w-full flex flex-col items-start gap-12 rounded-md border border-gray-200 bg-white p-6 shadow-sm">
              <div className="w-full flex flex-col items-start gap-4">
                <div className="flex w-full items-center justify-between">
                  <span className="text-xl font-semibold text-default-font">
                    Basic Information
                  </span>
                  <button
                    onClick={handleEditProfile}
                    className="border border-gray-300 text-gray-600 px-3 py-1 rounded-md hover:bg-gray-200 text-sm"
                  >
                    Edit basic information
                  </button>
                </div>
                <div className="w-full flex flex-col items-start">
                  <div className="flex w-full items-center gap-2 border-b border-gray-200 py-4">
                    <span className="grow shrink-0 basis-0 text-sm font-medium text-gray-500">
                      Email
                    </span>
                    <span className="grow shrink-0 basis-0 text-sm text-default-font">
                      {userData.email || '–'}
                    </span>
                  </div>
                  <div className="flex w-full items-center gap-2 border-b border-gray-200 py-4">
                    <span className="grow shrink-0 basis-0 text-sm font-medium text-gray-500">
                      Email Verification
                    </span>
                    <span className="grow shrink-0 basis-0 text-sm text-default-font">
                      {userData.isVerified ? 'Verified' : 'Not Verified'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="w-full flex flex-col items-start gap-4">
                <div className="flex w-full items-center justify-between">
                  <span className="text-xl font-semibold text-default-font">
                    Security
                  </span>
                  <button
                    onClick={handleManageSecurity}
                    className="border border-gray-300 text-gray-600 px-3 py-1 rounded-md hover:bg-gray-200 text-sm"
                  >
                    Manage security settings
                  </button>
                </div>
                <div className="w-full flex flex-col items-start">
                  <div className="flex w-full items-center gap-2 border-b border-gray-200 py-4">
                    <span className="grow shrink-0 basis-0 text-sm font-medium text-gray-500">
                      Two-Factor Authentication
                    </span>
                    <span className="grow shrink-0 basis-0 text-sm text-default-font">
                      {userData.twoFactorEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex w-full items-center gap-2 border-b border-gray-200 py-4">
                    <span className="grow shrink-0 basis-0 text-sm font-medium text-gray-500">
                      Security Score
                    </span>
                    <span className="grow shrink-0 basis-0 text-sm text-default-font">
                      {userData.securityScore || '–'}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex w-full flex-col items-center justify-center gap-2">
              <span className="text-xs text-gray-500">
                © Copyright {new Date().getFullYear()}, SecureVault. All rights reserved.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;