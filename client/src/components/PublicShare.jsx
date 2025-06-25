import React, { useState } from 'react';
import { FileText, Download, Lock } from 'lucide-react';
import axios from 'axios';
import { useParams } from 'react-router-dom';

const PublicShare = () => {
  const { fileId, token } = useParams();
  const [decryptionKey, setDecryptionKey] = useState('');
  const [fileInfo, setFileInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  React.useEffect(() => {
    const fetchFileInfo = async () => {
      try {
        const response = await axios.get(`${import.meta.env.VITE_BACKEND_URI}/api/files/public/share/${fileId}/${token}`);
        setFileInfo(response.data);
        setIsLoading(false);
      } catch (err) {
        setError(err.response?.data?.message || 'Invalid share link.');
        setIsLoading(false);
      }
    };
    fetchFileInfo();
  }, [fileId, token]);

  const decryptFile = async (encryptedData, encryptedKey, salt, iv, filename, fileIv) => {
    try {
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
      throw new Error('Decryption failed: ' + error.message);
    }
  };

  const handleDownload = async () => {
    if (!decryptionKey) {
      setError('Please enter the decryption key.');
      return;
    }
    try {
      setIsLoading(true);
      const response = await axios.get(`${import.meta.env.VITE_BACKEND_URI}/api/files/public/download/${fileId}/${token}`, {
        responseType: 'blob',
      });
      const share = fileInfo.sharedWith.find((s) => s.publicToken === token);
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
    } catch (err) {
      setError(err.message || 'Failed to download or decrypt file.');
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
    return <div className="text-center p-6 text-red-600">{error}</div>;
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