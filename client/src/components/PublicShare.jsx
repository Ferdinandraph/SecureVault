import React, { useState, useEffect } from 'react';
import { FileText, Download, Shield } from 'lucide-react';
import axios from 'axios';
import { useParams } from 'react-router-dom';
import { useToast } from './Toast';

const PublicShare = () => {
  const { fileId, token } = useParams();
  const [fileInfo, setFileInfo] = useState(null);
  const [decryptionKey, setDecryptionKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const { addToast } = useToast();

  useEffect(() => {
    fetchFileInfo();
  }, [fileId, token]);

  const fetchFileInfo = async (isRetry = false) => {
    try {
      console.log('Fetching file info:', { fileId, token, attempt: retryCount + 1 });
      setLoading(true);
      setError(null);
      const response = await axios.get(`${import.meta.env.VITE_BACKEND_URI}/api/files/public/share/${fileId}/${token}`);
      console.log('File info received:', { 
        fileId: response.data._id, 
        filename: response.data.filename, 
        size: response.data.size 
      });
      setFileInfo(response.data);
      setRetryCount(0);
    } catch (error) {
      console.error('Fetch file info error:', {
        fileId,
        token,
        message: error.message,
        status: error.response?.status,
        response: error.response?.data,
      });
      const errorMessage = error.response?.data?.message || 'Failed to fetch file information. Please check the link.';
      setError(errorMessage);
      addToast({
        title: 'Error',
        description: errorMessage,
        type: 'error',
      });
      if (!isRetry && retryCount < 2 && error.response?.status !== 400 && error.response?.status !== 404 && error.response?.status !== 403) {
        setRetryCount(retryCount + 1);
        addToast({
          title: 'Retrying Fetch',
          description: `Retrying file fetch (Attempt ${retryCount + 2}/3).`,
          type: 'info',
        });
        setTimeout(() => fetchFileInfo(true), 2000);
      }
    } finally {
      setLoading(false);
    }
  };

  const decryptFile = async (encryptedData, encryptedKey, iv, filename, decryptionKey) => {
    try {
      console.log('Decrypting file:', { filename, fileId });
      const passwordKey = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: Uint8Array.from(atob(fileInfo.salt), (c) => c.charCodeAt(0)),
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
      const fileIv = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));
      const dataBuffer = encryptedData instanceof Blob ? await encryptedData.arrayBuffer() : encryptedData;
      const decryptedData = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fileIv },
        cryptoKey,
        dataBuffer
      );
      const extension = filename.split('.').pop().toLowerCase();
      const mimeTypes = {
        pdf: 'application/pdf',
        rtf: 'application/rtf',
        txt: 'text/plain',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
      const mimeType = mimeTypes[extension] || 'application/octet-stream';
      console.log('File decrypted successfully:', { filename });
      return new Blob([decryptedData], { type: mimeType });
    } catch (error) {
      console.error('Decrypt file error:', { filename, fileId, message: error.message });
      throw new Error('Decryption failed: Invalid key or corrupted data.');
    }
  };

  const handleDownload = async () => {
    if (!decryptionKey) {
      addToast({ title: 'Error', description: 'Please enter the decryption key.', type: 'error' });
      return;
    }
    try {
      console.log('Downloading file:', { fileId, filename: fileInfo.filename });
      setLoading(true);
      const response = await axios.get(`${import.meta.env.VITE_BACKEND_URI}/api/files/public/download/${fileId}/${token}`, {
        responseType: 'blob',
      });
      const userShare = fileInfo.sharedWith.find((share) => share.publicToken === token);
      if (!userShare) {
        throw new Error('Share token not found in file data.');
      }
      const decryptedBlob = await decryptFile(
        response.data,
        userShare.encryptedKey,
        userShare.iv,
        fileInfo.filename,
        decryptionKey
      );
      const url = window.URL.createObjectURL(decryptedBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileInfo.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      console.log('File downloaded successfully:', { fileId, filename: fileInfo.filename });
      addToast({
        title: 'Download Started',
        description: `Downloading ${fileInfo.filename}.`,
        type: 'success',
      });
    } catch (error) {
      console.error('Download error:', {
        fileId,
        filename: fileInfo?.filename,
        message: error.message,
        status: error.response?.status,
        response: error.response?.data,
      });
      addToast({
        title: 'Download Failed',
        description: error.message || 'Failed to download or decrypt file. Check the decryption key.',
        type: 'error',
      });
    } finally {
      setLoading(false);
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
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-gray-600">Loading file information...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-center text-gray-600">
          <p>{error}</p>
          <button
            onClick={() => fetchFileInfo()}
            className="mt-4 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!fileInfo) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-gray-600">No file information available.</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-10 p-6 border rounded-lg bg-white shadow-sm">
      <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
        <FileText className="h-6 w-6" />
        Shared File
      </h2>
      <div className="space-y-4">
        <div className="flex items-center space-x-3">
          <FileText className="h-8 w-8 text-gray-500" />
          <div>
            <p className="text-sm font-medium">{fileInfo.filename}</p>
            <p className="text-xs text-gray-500">
              {formatFileSize(fileInfo.size)} • {new Date(fileInfo.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium">Decryption Key</label>
          <input
            type="text"
            value={decryptionKey}
            onChange={(e) => setDecryptionKey(e.target.value)}
            className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter decryption key"
          />
        </div>
        <button
          onClick={handleDownload}
          disabled={loading || !decryptionKey}
          className="w-full bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 flex items-center justify-center disabled:opacity-50"
        >
          {loading ? (
            <Shield className="h-4 w-4 animate-pulse mr-2" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          Download File
        </button>
      </div>
    </div>
  );
};

export default PublicShare;