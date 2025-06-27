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
  const [retryCount, setRetryCount] = useState(0);
  const { addToast } = useToast();

  useEffect(() => {
    setSelectedFile(initialFile);
    fetchFiles();
  }, [initialFile]);

  const fetchFiles = async (isRetry = false) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('No token found in localStorage');
        addToast({ title: 'Authentication Error', description: 'Please log in again.', type: 'error' });
        return;
      }
      console.log('Fetching files:', { userId: localStorage.getItem('userId'), attempt: retryCount + 1 });
      const response = await axios.get(`${import.meta.env.VITE_BACKEND_URI}/api/files/list`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const files = Array.isArray(response.data) ? response.data : [];
      console.log('Files fetched:', { fileCount: files.length, files: files.map(f => f.filename) });
      setUserFiles(files.filter((file) => file.userId.toString() === localStorage.getItem('userId')));
      setSharedFiles(files.filter((file) => file.sharedWith.length > 0));
      setReceivedFiles(files.filter((file) => file.sharedWith.some((share) => share.userId?.toString() === localStorage.getItem('userId'))));
      setRetryCount(0);
    } catch (error) {
      console.error('Fetch files error:', {
        message: error.message,
        status: error.response?.status,
        response: error.response?.data,
        userId: localStorage.getItem('userId'),
      });
      const errorMessage = error.response?.data?.message || 'Failed to fetch files. Please try again.';
      addToast({
        title: 'Error',
        description: errorMessage,
        type: 'error',
      });
      if (!isRetry && retryCount < 2 && error.response?.status !== 400 && error.response?.status !== 401) {
        setRetryCount(retryCount + 1);
        addToast({
          title: 'Retrying Fetch',
          description: `Retrying file fetch (Attempt ${retryCount + 2}/3).`,
          type: 'info',
        });
        setTimeout(() => fetchFiles(true), 2000);
      }
    }
  };

  const validateFile = async (fileId) => {
    try {
      const token = localStorage.getItem('token');
      console.log('Validating file:', { fileId });
      const response = await axios.get(`${import.meta.env.VITE_BACKEND_URI}/api/files/validate/${fileId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Validate file response:', { fileId, message: response.data.message });
      return true;
    } catch (error) {
      console.error('Validate file error:', {
        fileId,
        message: error.message,
        status: error.response?.status,
        response: error.response?.data,
      });
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
      console.log('Validating email:', { email });
      const response = await axios.post(
        `${import.meta.env.VITE_BACKEND_URI}/api/auth/validate-email`,
        { email },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('Email validation response:', { email, message: response.data.message });
      return true;
    } catch (error) {
      console.error('Email validation error:', {
        email,
        message: error.message,
        status: error.response?.status,
        response: error.response?.data,
      });
      return false;
    }
  };

  const generateDecryptionKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let key = '';
    for (let i = 0; i < 16; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    console.log('Generated decryption key:', { key: key.slice(0, 4) + '...' });
    return key;
  };

  const decryptFile = async (encryptedData, encryptedKey, salt, iv, filename, decryptionKey) => {
    try {
      console.log('Decrypting file:', { filename: filename.filename, fileId: filename._id });
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
      console.log('File decrypted successfully:', { filename: filename.filename });
      return new Blob([decryptedData], { type: mimeType });
    } catch (error) {
      console.error('Decrypt file error:', {
        filename: filename.filename,
        fileId: filename._id,
        message: error.message,
      });
      throw new Error('Decryption failed: Invalid key or corrupted data.');
    }
  };

  const handleShare = async (retry = false) => {
    if (!selectedFile) {
      console.error('No file selected for sharing');
      addToast({ title: 'Error', description: 'Please select a file.', type: 'error' });
      return;
    }
    console.log('Attempting to share file:', { fileId: selectedFile._id, filename: selectedFile.filename, recipientEmail });
    try {
      setIsValidating(true);
      const fileExists = await validateFile(selectedFile._id);
      if (!fileExists) {
        console.error('File validation failed:', { fileId: selectedFile._id });
        addToast({
          title: 'Error',
          description: `File ${selectedFile.filename} no longer exists.`,
          type: 'error',
        });
        setSelectedFile(null);
        fetchFiles();
        return;
      }
      let emailValid = true;
      if (recipientEmail) {
        emailValid = await validateEmail(recipientEmail);
        if (!emailValid) {
          console.error('Invalid recipient email:', { recipientEmail });
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
      console.log('Share response:', {
        fileId: selectedFile._id,
        shareLink: response.data.shareLink,
        recipientEmail,
        decryptionKey: decryptionKey.slice(0, 4) + '...',
      });
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
      console.error('Share error:', {
        fileId: selectedFile._id,
        filename: selectedFile.filename,
        message: error.message,
        status: error.response?.status,
        response: error.response?.data,
        retryCount,
      });
      if (!retry && error.response?.status !== 400 && error.response?.status !== 404 && error.response?.status !== 403) {
        setRetryCount(retryCount + 1);
        addToast({
          title: 'Retrying Share',
          description: `Retrying share for ${selectedFile.filename} (Attempt ${retryCount + 2}/3).`,
          type: 'info',
        });
        setTimeout(() => handleShare(true), 2000);
      } else {
        addToast({
          title: 'Share Failed',
          description: error.response?.data?.message || `Failed to share ${selectedFile.filename}.`,
          type: 'error',
        });
        if (error.response?.status === 404) {
          setSelectedFile(null);
          fetchFiles();
        }
      }
    } finally {
      setIsValidating(false);
    }
  };

  const handleCopyLink = (link) => {
    if (link) {
      navigator.clipboard.writeText(link);
      console.log('Share link copied:', { link });
      addToast({ title: 'Link Copied', description: 'Share link copied to clipboard.', type: 'success' });
    }
  };

  const handleRevoke = async (fileId, recipientId, publicToken, retry = false) => {
    try {
      const token = localStorage.getItem('token');
      console.log('Revoking access:', { fileId, recipientId, publicToken });
      await axios.delete(`${import.meta.env.VITE_BACKEND_URI}/api/files/revoke/${fileId}/${recipientId || publicToken}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Access revoked successfully:', { fileId });
      addToast({ title: 'Access Revoked', description: 'File access revoked successfully.', type: 'success' });
      fetchFiles();
    } catch (error) {
      console.error('Revoke error:', {
        fileId,
        recipientId,
        publicToken,
        message: error.message,
        status: error.response?.status,
        response: error.response?.data,
      });
      if (!retry && error.response?.status !== 400 && error.response?.status !== 404 && error.response?.status !== 403) {
        addToast({
          title: 'Retrying Revoke',
          description: `Retrying revoke for file ${fileId} (Attempt 2/2).`,
          type: 'info',
        });
        setTimeout(() => handleRevoke(fileId, recipientId, publicToken, true), 2000);
      } else {
        addToast({
          title: 'Revoke Failed',
          description: error.response?.data?.message || 'Failed to revoke access.',
          type: 'error',
        });
      }
    }
  };

  const downloadReceivedFile = async (fileId, filename, encryptedKey, salt, iv, retry = false) => {
    try {
      const inputDecryptionKey = prompt('Enter the decryption key provided by the sender:');
      if (!inputDecryptionKey) {
        addToast({ title: 'Error', description: 'Decryption key is required.', type: 'error' });
        return;
      }
      const token = localStorage.getItem('token');
      console.log('Downloading received file:', { fileId, filename });
      const response = await axios.get(`${import.meta.env.VITE_BACKEND_URI}/api/files/download/${fileId}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      const decryptedBlob = await decryptFile(response.data, encryptedKey, salt, iv, { filename, iv, _id: fileId }, inputDecryptionKey);
      const url = window.URL.createObjectURL(decryptedBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      console.log('Received file downloaded:', { fileId, filename });
      addToast({
        title: 'Download Started',
        description: `Downloading ${filename}.`,
        type: 'success',
      });
    } catch (error) {
      console.error('Download received file error:', {
        fileId,
        filename,
        message: error.message,
        status: error.response?.status,
        response: error.response?.data,
      });
      if (!retry && error.response?.status !== 400 && error.response?.status !== 404 && error.response?.status !== 403) {
        addToast({
          title: 'Retrying Download',
          description: `Retrying download for ${filename} (Attempt 2/2).`,
          type: 'info',
        });
        setTimeout(() => downloadReceivedFile(fileId, filename, encryptedKey, salt, iv, true), 2000);
      } else {
        addToast({
          title: 'Error',
          description: error.message || 'Failed to download or decrypt file. Check the decryption key.',
          type: 'error',
        });
      }
    }
  };

  const accessSharedFile = async (e, retry = false) => {
    e.preventDefault();
    const link = e.target.elements.shareLink.value;
    const match = link.match(/\/(share|public\/share)\/([^/]+)\/([^/]+)/);
    if (!match) {
      console.error('Invalid share link:', { link });
      addToast({ title: 'Error', description: 'Invalid share link format.', type: 'error' });
      return;
    }
    const [, type, fileId, token] = match;
    try {
      console.log('Accessing shared file:', { type, fileId, token });
      const endpoint = type === 'share' ? `/api/files/share/${fileId}/${token}` : `/api/files/public/share/${fileId}/${token}`;
      const response = await axios.get(`${import.meta.env.VITE_BACKEND_URI}${endpoint}`);
      console.log('Shared file accessed:', { 
        fileId: response.data._id, 
        filename: response.data.filename 
      });
      setReceivedFiles((prev) => [...prev, response.data]);
      addToast({ 
        title: 'File Accessed', 
        description: `Shared file ${response.data.filename} added to your received files.`, 
        type: 'success' 
      });
    } catch (error) {
      console.error('Access shared file error:', {
        type,
        fileId,
        token,
        message: error.message,
        status: error.response?.status,
        response: error.response?.data,
      });
      if (!retry && error.response?.status !== 400 && error.response?.status !== 404 && error.response?.status !== 403) {
        addToast({
          title: 'Retrying Access',
          description: `Retrying access for shared file ${fileId} (Attempt 2/2).`,
          type: 'info',
        });
        setTimeout(() => accessSharedFile(e, true), 2000);
      } else {
        addToast({
          title: 'Error',
          description: error.response?.data?.message || 'Failed to access shared file. Check the link.',
          type: 'error',
        });
      }
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
                  console.error('File not found during selection:', { fileId });
                  addToast({
                    title: 'Error',
                    description: 'Selected file no longer exists.',
                    type: 'error',
                  });
                  fetchFiles();
                  setSelectedFile(null);
                  return;
                }
                const file = userFiles.find((f) => f._id === fileId);
                console.log('File selected:', { fileId, filename: file.filename });
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
            onClick={() => handleShare()}
            disabled={isValidating || !selectedFile}
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
        <form onSubmit={(e) => accessSharedFile(e)} className="space-y-4">
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