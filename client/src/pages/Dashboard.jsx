import React, { useState, useEffect, useContext } from 'react';
import { Upload, Shield, Users, Activity, FileText, Key, Share, LogOut } from 'lucide-react';
import FileUpload from '../components/FileUpload';
import FileManager from '../components/FileManager';
import ShareManager from '../components/ShareManager';
import SecuritySettings from '../components/SecuritySettings';
import axios from 'axios';
import { useToast } from '../components/Toast';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../App';

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState('files');
  const [stats, setStats] = useState({ totalFiles: 0, storageUsed: 0, sharedFiles: 0, securityScore: 0, lastWeekFiles: 0, activeShares: 0 });
  const [selectedShareFile, setSelectedShareFile] = useState(null);
  const { addToast } = useToast();
  const navigate = useNavigate();
  const { isAuthenticated, user, logout } = useContext(AuthContext);

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token || !user?.id) {
        throw new Error('No token or user ID available');
      }
      const response = await axios.get(`${import.meta.env.VITE_BACKEND_URI}/api/users/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStats(response.data);
      console.log('Stats fetched:', response.data);
    } catch (error) {
      console.error('Fetch stats error:', error.response?.data || error.message);
      addToast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to fetch stats.',
        type: 'error',
      });
      if (error.response?.status === 401 || error.response?.status === 404) {
        logout();
        navigate('/login');
      }
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      addToast({
        title: 'Authentication Error',
        description: 'Please log in to continue.',
        type: 'error',
      });
      navigate('/login');
      return;
    }
    fetchStats();
    // Refresh stats every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, user, navigate, addToast]);

  const handleShare = (file) => {
    setSelectedShareFile(file);
    setActiveTab('shared');
  };

  const handleShareSuccess = () => {
    setSelectedShareFile(null);
    fetchStats(); // Refresh stats after sharing
  };

  const handleKeys = async () => {
    try {
      const token = localStorage.getItem('token');
      const password = prompt('Enter your password to generate new keys:');
      if (!password) {
        addToast({ title: 'Error', description: 'Password is required.', type: 'error' });
        return;
      }

      const { publicKey, privateKey } = await crypto.subtle.generateKey(
        { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
        true,
        ['encrypt', 'decrypt']
      );

      const exportedPublicKey = await crypto.subtle.exportKey('spki', publicKey);
      const exportedPrivateKey = await crypto.subtle.exportKey('pkcs8', privateKey);

      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const passwordKey = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']),
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt']
      );
      const encryptedPrivateKeyData = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        passwordKey,
        exportedPrivateKey
      );

      const publicKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(exportedPublicKey)));
      const encryptedPrivateKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(encryptedPrivateKeyData)));
      const saltBase64 = btoa(String.fromCharCode(...salt));
      const ivBase64 = btoa(String.fromCharCode(...iv));

      await axios.post(
        `${import.meta.env.VITE_BACKEND_URI}/api/users/rotate-keys`,
        {
          publicKey: publicKeyBase64,
          encryptedPrivateKey: `${encryptedPrivateKeyBase64}:${saltBase64}:${ivBase64}`,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      localStorage.setItem('encryptedPrivateKey', `${encryptedPrivateKeyBase64}:${saltBase64}:${ivBase64}`);

      addToast({
        title: 'Keys Rotated',
        description: 'Encryption keys have been updated successfully.',
        type: 'success',
      });
      fetchStats(); // Refresh stats after key rotation
    } catch (error) {
      console.error('Key rotation error:', error);
      addToast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to rotate keys.',
        type: 'error',
      });
      if (error.response?.status === 401 || error.response?.status === 404) {
        logout();
        navigate('/login');
      }
    }
  };

  const handleProfile = () => {
    navigate('/profile');
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

  if (!isAuthenticated || !user) {
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
                onClick={handleKeys}
                className="border border-gray-300 text-gray-600 px-3 py-1 rounded-md hover:bg-gray-200 text-sm flex items-center"
              >
                <Key className="h-4 w-4 mr-2" />
                Keys
              </button>
              <button
                onClick={handleProfile}
                className="border border-gray-300 text-gray-600 px-2 py-1 rounded-md hover:bg-gray-200 text-sm"
              >
                Profile
              </button>
              <button
                onClick={handleLogout}
                className="border border-gray-300 text-gray-600 px-2 py-1 rounded-md hover:bg-gray-200 text-sm flex items-center"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="grid gap-6 mb-8 md:grid-cols-4">
          <div className="border rounded-lg bg-white shadow-sm">
            <div className="p-4 flex flex-row items-center justify-between space-y-0">
              <h3 className="text-sm font-medium">Total Files</h3>
              <FileText className="h-4 w-4 text-gray-400" />
            </div>
            <div className="p-4 pt-0">
              <div className="text-2xl font-bold">{stats.totalFiles}</div>
              <p className="text-xs text-gray-600">+{stats.lastWeekFiles || 0} from last week</p>
            </div>
          </div>
          <div className="border rounded-lg bg-white shadow-sm">
            <div className="p-4 flex flex-row items-center justify-between space-y-0">
              <h3 className="text-sm font-medium">Storage Used</h3>
              <Activity className="h-4 w-4 text-gray-400" />
            </div>
            <div className="p-4 pt-0">
              <div className="text-2xl font-bold">{(stats.storageUsed / 1024 / 1024 / 1024).toFixed(2)} GB</div>
              <p className="text-xs text-gray-600">{((stats.storageUsed / (10 * 1024 * 1024 * 1024)) * 100).toFixed(0)}% of 10 GB</p>
            </div>
          </div>
          <div className="border rounded-lg bg-white shadow-sm">
            <div className="p-4 flex flex-row items-center justify-between space-y-0">
              <h3 className="text-sm font-medium">Shared Files</h3>
              <Share className="h-4 w-4 text-gray-400" />
            </div>
            <div className="p-4 pt-0">
              <div className="text-2xl font-bold">{stats.sharedFiles}</div>
              <p className="text-xs text-gray-600">{stats.activeShares || 0} active shares</p>
            </div>
          </div>
          <div className="border rounded-lg bg-white shadow-sm">
            <div className="p-4 flex flex-row items-center justify-between space-y-0">
              <h3 className="text-sm font-medium">Security Score</h3>
              <Shield className="h-4 w-4 text-gray-400" />
            </div>
            <div className="p-4 pt-0">
              <div className="text-2xl font-bold text-green-600">{stats.securityScore}%</div>
              <p className="text-xs text-gray-600">{stats.securityScore >= 90 ? 'Excellent' : stats.securityScore >= 70 ? 'Good' : 'Needs Improvement'}</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-4 w-full border rounded-md bg-white">
            {['files', 'shared', 'upload', 'security'].map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  if (tab !== 'shared') setSelectedShareFile(null);
                }}
                className={`px-4 py-2 text-sm font-medium ${activeTab === tab ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {activeTab === 'files' && (
            <div className="border rounded-lg bg-white shadow-lg">
              <div className="p-6">
                <h2 className="text-xl font-bold">Your Files</h2>
                <p className="text-sm text-gray-600">All files are encrypted with AES-256-GCM before upload</p>
              </div>
              <div className="p-6 pt-0">
                <FileManager onShare={handleShare} />
              </div>
            </div>
          )}

          {activeTab === 'shared' && (
            <div className="border rounded-lg bg-white shadow-lg">
              <div className="p-6">
                <h2 className="text-xl font-bold">Shared Files</h2>
                <p className="text-sm text-gray-600">Files you've shared and files shared with you</p>
              </div>
              <div className="p-6 pt-0">
                <ShareManager selectedFile={selectedShareFile} onShareSuccess={handleShareSuccess} />
              </div>
            </div>
          )}

          {activeTab === 'upload' && (
            <div className="border rounded-lg bg-white shadow-lg">
              <div className="p-6">
                <h2 className="text-xl font-bold">Upload Files</h2>
                <p className="text-sm text-gray-600">Files are encrypted on your device before upload</p>
              </div>
              <div className="p-6 pt-0">
                <FileUpload />
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="border rounded-lg bg-white shadow-lg">
              <div className="p-6">
                <h2 className="text-xl font-bold">Security Settings</h2>
                <p className="text-sm text-gray-600">Manage your security preferences and 2FA settings</p>
              </div>
              <div className="p-6 pt-0">
                <SecuritySettings />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;