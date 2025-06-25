import React, { useState, useEffect } from 'react';
import { Shield, Key, Smartphone, CheckCircle } from 'lucide-react';
import { useToast } from './Toast';
import axios from 'axios';

const SecuritySettings = () => {
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [backupCodesGenerated, setBackupCodesGenerated] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [securityScore, setSecurityScore] = useState(50);
  const { addToast } = useToast();

  useEffect(() => {
    const fetchSecuritySettings = async () => {
      try {
        const token = localStorage.getItem('token');
        const { data } = await axios.get(`${import.meta.env.VITE_BACKEND_URI}/api/users/security`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setTwoFactorEnabled(data.twoFactorEnabled);
        setEmailVerified(data.emailVerified);
        setBackupCodesGenerated(data.backupCodesGenerated);
        setSecurityScore(data.securityScore);
      } catch (error) {
        addToast({
          title: 'Error',
          description: error.response?.data?.message || 'Failed to fetch security settings.',
          type: 'error',
        });
      }
    };
    fetchSecuritySettings();
  }, []);

  const handleGenerateBackupCodes = async () => {
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.post(`${import.meta.env.VITE_BACKEND_URI}/api/users/backup-codes`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBackupCodesGenerated(true);
      addToast({
        title: 'Backup codes generated',
        description: `Save these codes securely: ${data.codes.join(', ')}`,
        type: 'success',
      });
    } catch (error) {
      addToast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to generate backup codes.',
        type: 'error',
      });
    }
  };

  const handleRotateKeys = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${import.meta.env.VITE_BACKEND_URI}/api/users/rotate-keys`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      addToast({
        title: 'Keys marked for rotation',
        description: 'Please update your encryption keys client-side.',
        type: 'success',
      });
    } catch (error) {
      addToast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to rotate keys.',
        type: 'error',
      });
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      addToast({ title: 'Error', description: 'New password must be at least 8 characters.', type: 'error' });
      return;
    }
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${import.meta.env.VITE_BACKEND_URI}/api/users/password`,
        { currentPassword, newPassword },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      addToast({
        title: 'Password updated',
        description: 'Your password has been updated successfully.',
        type: 'success',
      });
      setCurrentPassword('');
      setNewPassword('');
    } catch (error) {
      addToast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to update password.',
        type: 'error',
      });
    }
  };

  const handleToggle2FA = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${import.meta.env.VITE_BACKEND_URI}/api/users/toggle-2fa`,
        { enable: !twoFactorEnabled },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setTwoFactorEnabled(!twoFactorEnabled);
      addToast({
        title: '2FA updated',
        description: `2FA is now ${!twoFactorEnabled ? 'enabled' : 'disabled'}.`,
        type: 'success',
      });
    } catch (error) {
      addToast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to update 2FA settings.',
        type: 'error',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="border rounded-lg bg-white shadow-sm">
        <div className="p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Shield className="h-5 w-5" />
            Security Score
          </h3>
          <p className="text-sm text-gray-500">Your current security posture assessment</p>
        </div>
        <div className="p-6 pt-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="text-3xl font-bold text-green-600">{securityScore}%</div>
              <div>
                <span className="bg-gray-200 text-green-600 text-xs px-2 py-1 rounded flex items-center">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  {securityScore >= 90 ? 'Excellent' : securityScore >= 70 ? 'Good' : 'Needs Improvement'}
                </span>
                <p className="text-sm text-gray-500 mt-1">Your account is {securityScore >= 90 ? 'well-secured' : 'moderately secured'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border rounded-lg bg-white shadow-sm">
        <div className="p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Smartphone className="h-5 w-5" />
            Two-Factor Authentication
          </h3>
          <p className="text-sm text-gray-500">Add an extra layer of security to your account</p>
        </div>
        <div className="p-6 pt-0 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="font-medium">Enable 2FA via Email</label>
              <p className="text-sm text-gray-500">
                Receive OTP codes via email for login verification
              </p>
            </div>
            <input
              type="checkbox"
              checked={twoFactorEnabled}
              onChange={handleToggle2FA}
              className="h-5 w-5 text-blue-500 rounded focus:ring-blue-500"
            />
          </div>

          {twoFactorEnabled && (
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label className="font-medium">Email Verification</label>
                  <p className="text-sm text-gray-500">Your email address is verified for 2FA</p>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded ${
                    emailVerified ? 'bg-blue-500 text-white' : 'bg-red-500 text-white'
                  }`}
                >
                  {emailVerified ? 'Verified' : 'Unverified'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label className="font-medium">Backup Codes</label>
                  <p className="text-sm text-gray-500">Generate backup codes for account recovery</p>
                </div>
                <button
                  onClick={handleGenerateBackupCodes}
                  className="border border-gray-300 text-gray-700 px-3 py-1 rounded-md hover:bg-gray-100 text-sm"
                >
                  {backupCodesGenerated ? 'Regenerate' : 'Generate'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border rounded-lg bg-white shadow-sm">
        <div className="p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Key className="h-5 w-5" />
            Encryption Keys
          </h3>
          <p className="text-sm text-gray-500">Manage your client-side encryption keys</p>
        </div>
        <div className="p-6 pt-0 space-y-4">
          <div className="grid gap-4">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-medium">Master Key</p>
                <p className="text-sm text-gray-500">Generated: {new Date().toLocaleDateString()}</p>
              </div>
              <span className="bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded">Active</span>
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-medium">File Encryption Key</p>
                <p className="text-sm text-gray-500">Rotated: {new Date().toLocaleDateString()}</p>
              </div>
              <span className="bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded">Active</span>
            </div>
          </div>
          <button
            onClick={handleRotateKeys}
            className="border border-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-100 flex items-center"
          >
            <Key className="h-4 w-4 mr-2" />
            Rotate Keys
          </button>
        </div>
      </div>

      <div className="border rounded-lg bg-white shadow-sm">
        <div className="p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Key className="h-5 w-5" />
            Change Password
          </h3>
          <p className="text-sm text-gray-500">Update your account password</p>
        </div>
        <div className="p-6 pt-0">
          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <button
              type="submit"
              className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600"
            >
              Update Password
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SecuritySettings;