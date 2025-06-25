import React, { useState, useEffect } from 'react';
import { FileText, MoreVertical, Download, Share2, Trash2 } from 'lucide-react';
import axios from 'axios';
import { useToast } from './Toast';
import { useNavigate } from 'react-router-dom';

const FileManager = ({ onShare }) => {
  const [files, setFiles] = useState([]);
  const [menuOpen, setMenuOpen] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { addToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('token');
      if (!token) {
        addToast({ title: 'Authentication Error', description: 'Please log in again.', type: 'error' });
        navigate('/login');
        return;
      }
      const response = await axios.get(`${import.meta.env.VITE_BACKEND_URI}/api/files/list`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // Ensure files is always an array
      const data = Array.isArray(response.data) ? response.data : [];
      setFiles(data);
    } catch (error) {
      console.error('Fetch files error:', error);
      setError(error.response?.data?.message || 'Failed to fetch files.');
      addToast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to fetch files.',
        type: 'error',
      });
      if (error.response?.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('userId');
        localStorage.removeItem('userEmail');
        navigate('/login');
      }
      setFiles([]); // Reset to empty array to prevent map errors
    } finally {
      setLoading(false);
    }
  };

  const decryptPrivateKey = async (password) => {
    try {
      const [encryptedPrivateKey, salt, iv] = localStorage.getItem('encryptedPrivateKey').split(':');
      const passwordKey = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: Uint8Array.from(atob(salt), (c) => c.charCodeAt(0)),
          iterations: 100000,
          hash: 'SHA-256',
        },
        await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']),
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );
      const privateKeyData = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: Uint8Array.from(atob(iv), (c) => c.charCodeAt(0)) },
        passwordKey,
        Uint8Array.from(atob(encryptedPrivateKey), (c) => c.charCodeAt(0))
      );
      return await crypto.subtle.importKey(
        'pkcs8',
        privateKeyData,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        false,
        ['decrypt']
      );
    } catch (error) {
      throw new Error('Failed to decrypt private key: ' + error.message);
    }
  };

  const decryptFile = async (encryptedData, base64Key, base64Iv, file, password) => {
    try {
      const privateKey = await decryptPrivateKey(password);
      const aesKeyData = await crypto.subtle.decrypt(
        { name: 'RSA-OAEP' },
        privateKey,
        Uint8Array.from(atob(base64Key), (c) => c.charCodeAt(0))
      );
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        aesKeyData,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );
      const ivData = Uint8Array.from(atob(base64Iv), (c) => c.charCodeAt(0));
      const dataBuffer = encryptedData instanceof Blob ? await encryptedData.arrayBuffer() : encryptedData;
      const decryptedData = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: ivData },
        cryptoKey,
        dataBuffer
      );
      const extension = file.filename.split('.').pop().toLowerCase();
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

  const handleDownload = async (file) => {
    try {
      const password = prompt('Enter your password to decrypt the file:');
      if (!password) {
        addToast({ title: 'Error', description: 'Password is required.', type: 'error' });
        return;
      }
      const token = localStorage.getItem('token');
      const response = await axios.get(`${import.meta.env.VITE_BACKEND_URI}/api/files/download/${file._id}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      if (file.needsKeyUpdate) {
        addToast({ title: 'Error', description: 'File key needs updating. Please rotate keys.', type: 'error' });
        return;
      }
      const decryptedBlob = await decryptFile(response.data, file.encryptedKey, file.iv, file, password);
      const url = window.URL.createObjectURL(decryptedBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      addToast({
        title: 'Download Successful',
        description: `${file.filename} downloaded and decrypted successfully.`,
        type: 'success',
      });
    } catch (error) {
      console.error('Download error:', error);
      addToast({
        title: 'Download Failed',
        description: error.message || 'Failed to download or decrypt file.',
        type: 'error',
      });
    }
  };

  const handleShare = (file) => {
    onShare(file);
    setMenuOpen(null);
  };

  const handleDelete = async (file) => {
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${import.meta.env.VITE_BACKEND_URI}/api/files/delete/${file._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setFiles(files.filter((f) => f._id !== file._id));
      addToast({
        title: 'File Deleted',
        description: `${file.filename} deleted successfully.`,
        type: 'success',
      });
    } catch (error) {
      console.error('Delete error:', error);
      addToast({
        title: 'Delete Failed',
        description: error.response?.data?.message || 'Failed to delete file.',
        type: 'error',
      });
      if (error.response?.status === 404) {
        fetchFiles();
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

  if (loading) {
    return <p className="text-center text-gray-600">Loading files...</p>;
  }

  if (error) {
    return (
      <div className="text-center text-gray-600">
        <p>{error}</p>
        <button
          onClick={fetchFiles}
          className="mt-4 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {files.length === 0 ? (
        <p className="text-center text-gray-600">No files found.</p>
      ) : (
        <div className="grid gap-4">
          {files.map((file) => (
            <div key={file._id} className="border rounded-lg bg-white shadow-sm p-4 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <FileText className="h-8 w-8 text-gray-500" />
                <div>
                  <p className="text-sm font-medium">{file.filename}</p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(file.size)} • {new Date(file.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="relative">
                <button
                  onClick={() => setMenuOpen(menuOpen === file._id ? null : file._id)}
                  className="p-2 rounded-full hover:bg-gray-200"
                >
                  <MoreVertical className="h-5 w-5 text-gray-600" />
                </button>
                {menuOpen === file._id && (
                  <div className="absolute right-0 mt-2 w-48 bg-white border rounded-lg shadow-lg z-50 overflow-y-auto max-h-40">
                    <button
                      onClick={() => {
                        handleDownload(file);
                        setMenuOpen(null);
                      }}
                      className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </button>
                    <button
                      onClick={() => {
                        handleShare(file);
                      }}
                      className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      <Share2 className="h-4 w-4 mr-2" />
                      Share
                    </button>
                    <button
                      onClick={() => {
                        handleDelete(file);
                        setMenuOpen(null);
                      }}
                      className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileManager;