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
  const [retryCount, setRetryCount] = useState(0);
  const { addToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async (isRetry = false) => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('No token found in localStorage');
        addToast({ title: 'Authentication Error', description: 'Please log in again.', type: 'error' });
        navigate('/login');
        return;
      }
      console.log('Fetching files:', { userId: localStorage.getItem('userId'), attempt: retryCount + 1 });
      const response = await axios.get(`${import.meta.env.VITE_BACKEND_URI}/api/files/list`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = Array.isArray(response.data) ? response.data : [];
      console.log('Files fetched:', { fileCount: data.length, files: data.map(f => f.filename) });
      setFiles(data);
      setRetryCount(0);
    } catch (error) {
      console.error('Fetch files error:', {
        message: error.message,
        status: error.response?.status,
        response: error.response?.data,
        userId: localStorage.getItem('userId'),
      });
      const errorMessage = error.response?.data?.message || 'Failed to fetch files. Please try again.';
      setError(errorMessage);
      addToast({
        title: 'Error',
        description: errorMessage,
        type: 'error',
      });
      if (error.response?.status === 401) {
        console.error('Unauthorized, clearing localStorage');
        localStorage.removeItem('token');
        localStorage.removeItem('userId');
        localStorage.removeItem('userEmail');
        navigate('/login');
      } else if (!isRetry && retryCount < 2) {
        setRetryCount(retryCount + 1);
        addToast({
          title: 'Retrying Fetch',
          description: `Retrying file fetch (Attempt ${retryCount + 2}/3).`,
          type: 'info',
        });
        setTimeout(() => fetchFiles(true), 2000);
      }
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const decryptPrivateKey = async (password) => {
    try {
      const encryptedPrivateKeyData = localStorage.getItem('encryptedPrivateKey');
      if (!encryptedPrivateKeyData) {
        throw new Error('No encrypted private key found in localStorage');
      }
      const [encryptedPrivateKey, salt, iv] = encryptedPrivateKeyData.split(':');
      console.log('Decrypting private key:', { userId: localStorage.getItem('userId') });
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
      const privateKey = await crypto.subtle.importKey(
        'pkcs8',
        privateKeyData,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        false,
        ['decrypt']
      );
      console.log('Private key decrypted successfully');
      return privateKey;
    } catch (error) {
      console.error('Decrypt private key error:', { message: error.message });
      throw new Error('Failed to decrypt private key: Invalid password or corrupted key data.');
    }
  };

  const decryptFile = async (encryptedData, base64Key, base64Iv, file, password) => {
    try {
      console.log('Decrypting file:', { filename: file.filename, fileId: file._id });
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
      console.log('File decrypted successfully:', { filename: file.filename });
      return new Blob([decryptedData], { type: mimeType });
    } catch (error) {
      console.error('Decrypt file error:', {
        filename: file.filename,
        fileId: file._id,
        message: error.message,
      });
      throw new Error('Decryption failed: Invalid password or corrupted file data.');
    }
  };

  const handleDownload = async (file, retry = false) => {
    try {
      const password = prompt('Enter your password to decrypt the file:');
      if (!password) {
        addToast({ title: 'Error', description: 'Password is required.', type: 'error' });
        return;
      }
      const token = localStorage.getItem('token');
      if (!token) {
        addToast({ title: 'Authentication Error', description: 'Please log in again.', type: 'error' });
        navigate('/login');
        return;
      }
      console.log('Downloading file:', { fileId: file._id, filename: file.filename });
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
      console.error('Download error:', {
        fileId: file._id,
        filename: file.filename,
        message: error.message,
        status: error.response?.status,
        response: error.response?.data,
      });
      if (!retry && error.response?.status !== 400 && error.response?.status !== 404 && error.response?.status !== 403) {
        addToast({
          title: 'Retrying Download',
          description: `Retrying download for ${file.filename} (Attempt 2/2).`,
          type: 'info',
        });
        setTimeout(() => handleDownload(file, true), 2000);
      } else {
        addToast({
          title: 'Download Failed',
          description: error.message || 'Failed to download or decrypt file. Check password or file availability.',
          type: 'error',
        });
        if (error.response?.status === 404) {
          fetchFiles();
        }
      }
    }
  };

  const handleShare = (file) => {
    console.log('Initiating share:', { fileId: file._id, filename: file.filename });
    onShare(file);
    setMenuOpen(null);
  };

  const handleDelete = async (file, retry = false) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        addToast({ title: 'Authentication Error', description: 'Please log in again.', type: 'error' });
        navigate('/login');
        return;
      }
      console.log('Deleting file:', { fileId: file._id, filename: file.filename });
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
      console.error('Delete error:', {
        fileId: file._id,
        filename: file.filename,
        message: error.message,
        status: error.response?.status,
        response: error.response?.data,
      });
      if (!retry && error.response?.status !== 400 && error.response?.status !== 404 && error.response?.status !== 403) {
        addToast({
          title: 'Retrying Delete',
          description: `Retrying delete for ${file.filename} (Attempt 2/2).`,
          type: 'info',
        });
        setTimeout(() => handleDelete(file, true), 2000);
      } else {
        addToast({
          title: 'Delete Failed',
          description: error.response?.data?.message || `Failed to delete ${file.filename}.`,
          type: 'error',
        });
        if (error.response?.status === 404) {
          fetchFiles();
        }
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
          onClick={() => fetchFiles()}
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