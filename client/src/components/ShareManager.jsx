import React, { useState, useEffect } from 'react';
import { FileText, Trash2, Download, Share2, Link } from 'lucide-react';
import { useToast } from './Toast';
import axios from 'axios';

const ShareManager = ({ selectedFile: initialFile, onShareSuccess }) => {
  const [selectedFile, setSelectedFile] = useState(initialFile);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [shareLink, setShareLink] = useState('');
  const [publicShareLink, setPublicShareLink] = useState('');
  const [decryptionKey, setDecryptionKey] = useState('');
  const [sharedFiles, setSharedFiles] = useState([]);
  const [receivedFiles, setReceivedFiles] = useState([]);
  const [userFiles, setUserFiles] = useState([]);
  const [isValidating, setIsValidating] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    setSelectedFile(initialFile);
    fetchFiles();
  }, [initialFile]);

  const fetchFiles = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        addToast({ title: 'Authentication Error', description: 'Please log in again.', type: 'error' });
        return;
      }
      const response = await axios.get(`${import.meta.env.VITE_BACKEND_URI}/api/files/list`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const files = response.data;
      console.log('Fetched files:', files);
      setUserFiles(files.filter((file) => file.userId.toString() === localStorage.getItem('userId')));
      setSharedFiles(files.filter((file) => file.sharedWith.length > 0));
      setReceivedFiles(files.filter((file) => file.sharedWith.some((share) => share.userId?.toString() === localStorage.getItem('userId'))));
    } catch (error) {
      console.error('Fetch files error:', error);
      addToast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to fetch files.',
        type: 'error',
      });
    }
  };

  const validateFile = async (fileId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${import.meta.env.VITE_BACKEND_URI}/api/files/validate/${fileId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log(`Validate file ${fileId}:`, response.data);
      return true;
    } catch (error) {
      console.error(`Validate file ${fileId} error:`, error.response?.data || error.message);
      addToast({
        title: 'Error',
        description: error.response?.data?.message || 'File validation failed.',
        type: 'error',
      });
      return false;
    }
  };

  const validateEmail = async (email) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${import.meta.env.VITE_BACKEND_URI}/api/auth/validate-email`,
        { email },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('Validate email:', email, response.data);
      return true;
    } catch (error) {
      console.error('Email validation error:', error.response?.data || error.message);
      return false;
    }
  };

  const generateDecryptionKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let key = '';
    for (let i = 0; i < 16; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
  };

  const decryptFile = async (encryptedData, encryptedKey, salt, iv, filename, decryptionKey) => {
    try {
      const passwordKey = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: Uint8Array.from(atob(salt), (c) => c.charCodeAt(0)),
          iterations: 100000,
          hash: 'SHA-256',
        },
        await crypto.subtle.importKey('raw', new TextEncoder().encode(decryptionKey), 'PBKDF2', false, ['deriveKey']),
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );
      const aesKeyData = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: Uint8Array.from(atob(iv), (c) => c.charCodeAt(0)) },
        passwordKey,
        Uint8Array.from(atob(encryptedKey), (c) => c.charCodeAt(0))
      );
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        aesKeyData,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );
      const fileIv = Uint8Array.from(atob(filename.iv), (c) => c.charCodeAt(0));
      const dataBuffer = encryptedData instanceof Blob ? await encryptedData.arrayBuffer() : encryptedData;
      const decryptedData = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fileIv },
        cryptoKey,
        dataBuffer
      );
      const extension = filename.filename.split('.').pop().toLowerCase();
      const mimeTypes = {
        pdf: 'application/pdf',
        rtf: 'application/rtf',
        txt: 'text/plain',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
      const mimeType = mimeTypes[extension] || 'application/octet-stream';
      return new Blob([decryptedData], { type: mimeType });
    } catch (error) {
      throw new Error('Decryption failed: ' + error.message);
    }
  };

  const handleShare = async () => {
    if (!selectedFile) {
      addToast({ title: 'Error', description: 'Please select a file.', type: 'error' });
      return;
    }
    console.log('Attempting to share file:', { fileId: selectedFile._id, recipientEmail });
    try {
      setIsValidating(true);
      const fileExists = await validateFile(selectedFile._id);
      if (!fileExists) {
        setSelectedFile(null);
        fetchFiles();
        return;
      }
      let emailValid = true;
      if (recipientEmail) {
        emailValid = await validateEmail(recipientEmail);
        if (!emailValid) {
          addToast({
            title: 'Error',
            description: `Recipient ${recipientEmail} not registered. Use public sharing instead.`,
            type: 'error',
          });
          setIsValidating(false);
          return;
        }
      }
      const decryptionKey = generateDecryptionKey();
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${import.meta.env.VITE_BACKEND_URI}/api/files/share-link/${selectedFile._id}`,
        { recipientEmail: recipientEmail || null, decryptionKey },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('Share response:', response.data);
      if (recipientEmail) {
        setShareLink(response.data.shareLink);
      } else {
        setPublicShareLink(response.data.shareLink);
      }
      setDecryptionKey(decryptionKey);
      addToast({
        title: 'Share Successful',
        description: recipientEmail
          ? `File shared with ${recipientEmail}. Share this decryption key separately: ${decryptionKey}`
          : `Public share link created. Share this link and decryption key separately: ${decryptionKey}`,
        type: 'success',
      });
      fetchFiles();
      setRecipientEmail('');
      setSelectedFile(null);
      onShareSuccess?.();
    } catch (error) {
      console.error('Share error:', error);
      addToast({
        title: 'Share Failed',
        description: error.response?.data?.message || 'Failed to share file.',
        type: 'error',
      });
      if (error.response?.status === 404) {
        setSelectedFile(null);
        fetchFiles();
      }
    } finally {
      setIsValidating(false);
    }
  };

  const handleCopyLink = (link) => {
    if (link) {
      navigator.clipboard.writeText(link);
      addToast({ title: 'Link Copied', description: 'Share link copied to clipboard.', type: 'success' });
    }
  };

  const handleRevoke = async (fileId, recipientId, publicToken) => {
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${import.meta.env.VITE_BACKEND_URI}/api/files/revoke/${fileId}/${recipientId || publicToken}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      addToast({ title: 'Access Revoked', description: 'File access revoked successfully.', type: 'success' });
      fetchFiles();
    } catch (error) {
      addToast({
        title: 'Revoke Failed',
        description: error.response?.data?.message || 'Failed to revoke access.',
        type: 'error',
      });
    }
  };

  const downloadReceivedFile = async (fileId, filename, encryptedKey, salt, iv) => {
    try {
      const inputDecryptionKey = prompt('Enter the decryption key provided by the sender:');
      if (!inputDecryptionKey) {
        addToast({ title: 'Error', description: 'Decryption key is required.', type: 'error' });
        return;
      }
      const token = localStorage.getItem('token');
      const response = await axios.get(`${import.meta.env.VITE_BACKEND_URI}/api/files/download/${fileId}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      const decryptedBlob = await decryptFile(response.data, encryptedKey, salt, iv, { filename, iv }, inputDecryptionKey);
      const url = window.URL.createObjectURL(decryptedBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      addToast({
        title: 'Download Started',
        description: `Downloading ${filename}.`,
        type: 'success',
      });
    } catch (error) {
      addToast({
        title: 'Error',
        description: error.message || 'Failed to download or decrypt file.',
        type: 'error',
      });
    }
  };

  const accessSharedFile = async (e) => {
    e.preventDefault();
    const link = e.target.elements.shareLink.value;
    const match = link.match(/\/(share|public\/share)\/([^/]+)\/([^/]+)/);
    if (!match) {
      addToast({ title: 'Error', description: 'Invalid share link.', type: 'error' });
      return;
    }
    const [, type, fileId, token] = match;
    try {
      const endpoint = type === 'share' ? `/api/files/share/${fileId}/${token}` : `/api/files/public/share/${fileId}/${token}`;
      const response = await axios.get(`${import.meta.env.VITE_BACKEND_URI}${endpoint}`);
      setReceivedFiles((prev) => [...prev, response.data]);
      addToast({ title: 'File Accessed', description: 'Shared file added to your received files.', type: 'success' });
    } catch (error) {
      addToast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to access shared file.',
        type: 'error',
      });
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      <div className="border rounded-lg bg-white shadow-sm p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Share2 className="h-5 w-5" />
          Share a File
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Select File</label>
            <select
              value={selectedFile?._id || ''}
              onChange={async (e) => {
                const fileId = e.target.value;
                if (!fileId) {
                  setSelectedFile(null);
                  return;
                }
                setIsValidating(true);
                const fileExists = await validateFile(fileId);
                setIsValidating(false);
                if (!fileExists) {
                  fetchFiles();
                  setSelectedFile(null);
                  return;
                }
                const file = userFiles.find((f) => f._id === fileId);
                setSelectedFile(file);
              }}
              disabled={isValidating}
              className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option value="">Select a file</option>
              {userFiles.map((file) => (
                <option key={file._id} value={file._id}>
                  {file.filename} ({formatFileSize(file.size)})
                </option>
              ))}
            </select>
            {isValidating && <p className="text-sm text-gray-500">Validating file...</p>}
          </div>
          <div>
            <label className="block text-sm font-medium">Recipient Email (Optional)</label>
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter recipient's email or leave blank for public link"
            />
            {!recipientEmail && (
              <p className="text-xs text-gray-500 mt-1">Leave blank to generate a public share link for non-registered users.</p>
            )}
          </div>
          <button
            onClick={handleShare}
            disabled={isValidating}
            className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 flex items-center disabled:opacity-50"
          >
            <Share2 className="h-4 w-4 mr-2" />
            {recipientEmail ? 'Share with User' : 'Generate Public Link'}
          </button>
          {shareLink && (
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={shareLink}
                  readOnly
                  className="w-full px-4 py-2 border rounded-md bg-gray-100"
                />
                <button
                  onClick={() => handleCopyLink(shareLink)}
                  className="bg-gray-200 text-gray-700 px-3 py-2 rounded-md hover:bg-gray-300"
                >
                  <Link className="h-4 w-4" />
                </button>
              </div>
              {decryptionKey && (
                <div className="border rounded-lg p-4 bg-yellow-50">
                  <p className="text-sm font-medium">Decryption Key</p>
                  <p className="text-sm text-gray-600">
                    Share this key with {recipientEmail} separately: <strong>{decryptionKey}</strong>
                  </p>
                </div>
              )}
            </div>
          )}
          {publicShareLink && (
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={publicShareLink}
                  readOnly
                  className="w-full px-4 py-2 border rounded-md bg-gray-100"
                />
                <button
                  onClick={() => handleCopyLink(publicShareLink)}
                  className="bg-gray-200 text-gray-700 px-3 py-2 rounded-md hover:bg-gray-300"
                >
                  <Link className="h-4 w-4" />
                </button>
              </div>
              {decryptionKey && (
                <div className="border rounded-lg p-4 bg-yellow-50">
                  <p className="text-sm font-medium">Decryption Key</p>
                  <p className="text-sm text-gray-600">
                    Share this key with the recipient separately: <strong>{decryptionKey}</strong>
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="border rounded-lg bg-white shadow-sm p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Link className="h-5 w-5" />
          Access Shared File
        </h3>
        <form onSubmit={accessSharedFile} className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Share Link</label>
            <input
              type="text"
              name="shareLink"
              className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Paste share link here (e.g., /share/... or /public/share/...)"
            />
          </div>
          <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600">
            Access File
          </button>
        </form>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Shared Files
        </h3>
        {sharedFiles.length === 0 ? (
          <p className="text-gray-600">No files shared.</p>
        ) : (
          sharedFiles.map((file) => (
            <div key={file._id} className="border rounded-lg bg-white shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-3">
                  <FileText className="h-8 w-8 text-gray-500" />
                  <div>
                    <p className="text-sm font-medium">{file.filename}</p>
                    <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                {file.sharedWith.map((share, index) => (
                  <div key={share.userId || share.publicToken || index} className="flex items-center justify-between text-sm">
                    <span>
                      Shared with: {share.email || 'Public Link'} {share.publicToken && `(Token: ${share.publicToken.slice(0, 8)}...)`}
                    </span>
                    <button
                      onClick={() => handleRevoke(file._id, share.userId, share.publicToken)}
                      className="text-red-600 hover:text-red-800 flex items-center"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Received Files
        </h3>
        {receivedFiles.length === 0 ? (
          <p className="text-gray-600">No files received.</p>
        ) : (
          receivedFiles.map((file) => {
            const userShare = file.sharedWith.find((share) => share.userId?.toString() === localStorage.getItem('userId'));
            if (!userShare) return null;
            return (
              <div key={file._id} className="border rounded-lg bg-white shadow-sm p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-3">
                    <FileText className="h-8 w-8 text-gray-500" />
                    <div>
                      <p className="text-sm font-medium">{file.filename}</p>
                      <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => downloadReceivedFile(file._id, file.filename, userShare.encryptedKey, userShare.salt, userShare.iv)}
                    className="text-blue-600 hover:text-blue-800 flex items-center"
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ShareManager;