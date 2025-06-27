import React, { useState, useEffect } from 'react';
import { FileText, Download, Lock } from 'lucide-react';
import axios from 'axios';
import { useParams } from 'react-router-dom';
import { useToast } from './Toast'; // Assuming Toast is used for notifications

const PublicShare = () => {
  const { fileId, token } = useParams();
  const [decryptionKey, setDecryptionKey] = useState('');
  const [fileInfo, setFileInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const { addToast } = useToast();

  useEffect(() => {
    const fetchFileInfo = async () => {
      try {
        console.log('Fetching file info:', { fileId, token });
        const response = await axios.get(`${import.meta.env.VITE_BACKEND_URI}/api/files/public/share/${fileId}/${token}`);
        console.log('File info received:', { 
          fileId: response.data._id, 
          filename: response.data.filename, 
          size: response.data.size 
        });
        setFileInfo(response.data);
        setIsLoading(false);
      } catch (err) {
        console.error('Fetch file info error:', {
          fileId,
          token,
          message: err.message,
          status: err.response?.status,
          response: err.response?.data,
        });
        setError(err.response?.data?.message || 'Invalid share link. Please check the link or try again.');
        setIsLoading(false);
        addToast({
          title: 'Error',
          description: err.response?.data?.message || 'Failed to load file information.',
          type: 'error',
        });
      }
    };
    fetchFileInfo();
  }, [fileId, token, addToast]);

  const decryptFile = async (encryptedData, encryptedKey, salt, iv, filename, fileIv) => {
    try {
      console.log('Decrypting file:', { filename, encryptedKeyLength: encryptedKey.length });
      const passwordKey = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: Uint8Array.from(atob(salt), c => c.charCodeAt(0)),
          iterations: 100000,
          hash: 'SHA-256',
        },
        await crypto.subtle.importKey('raw', new TextEncoder().encode(decryptionKey), 'PBKDF2', false, ['deriveKey']),
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );
      const aesKeyData = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: Uint8Array.from(atob(iv), c => c.charCodeAt(0)) },
        passwordKey,
        Uint8Array.from(atob(encryptedKey), c => c.charCodeAt(0))
      );
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        aesKeyData,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );
      const dataBuffer = encryptedData instanceof Blob ? await encryptedData.arrayBuffer() : encryptedData;
      const decryptedData = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: Uint8Array.from(atob(fileIv), c => c.charCodeAt(0)) },
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
      return new Blob([decryptedData], { type: mimeType });
    } catch (error) {
      console.error('Decryption error:', { filename, message: error.message });
      throw new Error('Decryption failed: Invalid key or corrupted data.');
    }
  };

  const handleDownload = async () => {
    if (!decryptionKey) {
      setError('Please enter the decryption key.');
      addToast({
        title: 'Input Error',
        description: 'Decryption key is required.',
        type: 'error',
      });
      return;
    }
    if (!fileInfo || !fileInfo.sharedWith) {
      setError('File information not loaded.');
      addToast({
        title: 'Error',
        description: 'File information not available. Please refresh and try again.',
        type: 'error',
      });
      return;
    }

    try {
      setIsLoading(true);
      console.log('Downloading file:', { fileId, token, retryCount });
      const response = await axios.get(`${import.meta.env.VITE_BACKEND_URI}/api/files/public/download/${fileId}/${token}`, {
        responseType: 'blob',
      });
      const share = fileInfo.sharedWith.find((s) => s.publicToken === token);
      if (!share) {
        throw new Error('Invalid share token.');
      }
      const decryptedBlob = await decryptFile(
        response.data,
        share.encryptedKey,
        share.salt,
        share.iv,
        fileInfo.filename,
        fileInfo.iv
      );
      const url = window.URL.createObjectURL(decryptedBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileInfo.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      setError('');
      addToast({
        title: 'Success',
        description: `File ${fileInfo.filename} downloaded successfully.`,
        type: 'success',
      });
    } catch (err) {
      console.error('Download error:', {
        fileId,
        token,
        message: err.message,
        status: err.response?.status,
        response: err.response?.data,
      });
      if (retryCount < 2 && err.response?.status !== 400 && err.response?.status !== 404) {
        setRetryCount(retryCount + 1);
        setError(`Download failed. Retrying... (Attempt ${retryCount + 2}/3)`);
        addToast({
          title: 'Retrying Download',
          description: `Retrying download for ${fileInfo?.filename || 'file'} (Attempt ${retryCount + 2}/3).`,
          type: 'info',
        });
        setTimeout(() => handleDownload(), 2000); // Retry after 2s
      } else {
        setError(err.message || 'Failed to download or decrypt file. Check the decryption key or link.');
        addToast({
          title: 'Error',
          description: err.message || 'Failed to download or decrypt file.',
          type: 'error',
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (isLoading) {
    return <div className="text-center p-6">Loading...</div>;
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
        <div className="text-center text-red-600">{error}</div>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
        <FileText className="h-6 w-6" />
        Access Shared File
      </h2>
      <div className="border rounded-lg p-4 mb-4">
        <div className="flex items-center space-x-3">
          <FileText className="h-8 w-8 text-gray-500" />
          <div>
            <p className="text-sm font-medium">{fileInfo.filename}</p>
            <p className="text-xs text-gray-500">{formatFileSize(fileInfo.size)}</p>
          </div>
        </div>
      </div>
      <div className="space-y-4">
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
          disabled={isLoading || !decryptionKey}
          className="w-full bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 flex items-center justify-center disabled:opacity-50"
        >
          <Download className="h-4 w-4 mr-2" />
          {isLoading ? 'Downloading...' : 'Download File'}
        </button>
      </div>
    </div>
  );
};

export default PublicShare;