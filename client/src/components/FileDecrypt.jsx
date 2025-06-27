import React, { useState, useCallback } from 'react';
import { Lock, FileText, X, Shield } from 'lucide-react';
import { useToast } from './Toast';
import axios from 'axios';
import FileSaver from 'file-saver';

// Debounce utility to prevent rapid clicks
const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

const FileDecrypt = () => {
  const [file, setFile] = useState(null);
  const [decryptionKey, setDecryptionKey] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [status, setStatus] = useState('idle');
  const { addToast } = useToast();

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    setFile(droppedFile);
  }, []);

  const handleFileSelect = (e) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const decryptFile = async (encryptedData, encryptedKey, salt, iv, filename, decryptionKey) => {
  try {
    // Validate inputs
    if (!encryptedData || !encryptedKey || !salt || !iv || !filename?.filename || !filename?.iv || !decryptionKey) {
      throw new Error('Missing required decryption parameters');
    }
    console.log('Decrypting file:', {
      filename: filename.filename,
      fileId: filename._id,
      encryptedDataSize: encryptedData instanceof Blob ? encryptedData.size : encryptedData.byteLength,
    });

    // Validate base64 strings
    let saltBuffer, ivBuffer, fileIvBuffer, encryptedKeyBuffer;
    try {
      saltBuffer = Uint8Array.from(atob(salt), (c) => c.charCodeAt(0));
      ivBuffer = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));
      fileIvBuffer = Uint8Array.from(atob(filename.iv), (c) => c.charCodeAt(0));
      encryptedKeyBuffer = Uint8Array.from(atob(encryptedKey), (c) => c.charCodeAt(0));
    } catch (e) {
      throw new Error(`Invalid base64 encoding: ${e.message}`);
    }

    // Validate buffer lengths
    if (saltBuffer.length !== 16) throw new Error(`Invalid salt length: expected 16, got ${saltBuffer.length}`);
    if (ivBuffer.length !== 12) throw new Error(`Invalid IV length: expected 12, got ${ivBuffer.length}`);
    if (fileIvBuffer.length !== 12) throw new Error(`Invalid file IV length: expected 12, got ${fileIvBuffer.length}`);
    console.log('Input buffers validated:', {
      saltLength: saltBuffer.length,
      ivLength: ivBuffer.length,
      fileIvLength: fileIvBuffer.length,
      encryptedKeyLength: encryptedKeyBuffer.length,
    });

    // Derive password key
    let passwordKey;
    try {
      passwordKey = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: saltBuffer,
          iterations: 100000,
          hash: 'SHA-256',
        },
        await crypto.subtle.importKey('raw', new TextEncoder().encode(decryptionKey), 'PBKDF2', false, ['deriveKey']),
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );
    } catch (e) {
      throw new Error(`Failed to derive password key: ${e.message}`);
    }

    // Decrypt AES key
    let aesKeyData;
    try {
      aesKeyData = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: ivBuffer },
        passwordKey,
        encryptedKeyBuffer
      );
      console.log('AES key decrypted', { fileId: filename._id, aesKeyLength: new Uint8Array(aesKeyData).length });
    } catch (e) {
      throw new Error(`Failed to decrypt AES key: ${e.message || 'Invalid decryption key or corrupted encrypted key.'}`);
    }

    // Validate AES key length
    if (new Uint8Array(aesKeyData).length !== 32) {
      throw new Error(`Invalid AES key length: expected 32 bytes, got ${new Uint8Array(aesKeyData).length}`);
    }

    // Import crypto key
    let cryptoKey;
    try {
      cryptoKey = await crypto.subtle.importKey(
        'raw',
        aesKeyData,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );
    } catch (e) {
      throw new Error(`Failed to import crypto key: ${e.message || 'Invalid AES key data.'}`);
    }

    // Validate encrypted data
    const dataBuffer = encryptedData instanceof Blob ? await encryptedData.arrayBuffer() : encryptedData;
    if (!dataBuffer || dataBuffer.byteLength === 0) {
      throw new Error('Encrypted data is empty or invalid.');
    }
    console.log('Encrypted data validated:', { dataBufferSize: dataBuffer.byteLength });

    // Decrypt file data
    let decryptedData;
    try {
      decryptedData = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fileIvBuffer },
        cryptoKey,
        dataBuffer
      );
    } catch (e) {
      throw new Error(`Failed to decrypt file data: ${e.message || 'Invalid key, IV, or corrupted file data.'}`);
    }

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
      filename: filename?.filename,
      fileId: filename?._id,
      message: error.message,
      name: error.name,
      stack: error.stack,
      encryptedKeyLength: encryptedKey?.length,
      saltLength: salt?.length,
      ivLength: iv?.length,
      fileIvLength: filename?.iv?.length,
      decryptionKeyLength: decryptionKey?.length,
      encryptedDataSize: encryptedData instanceof Blob ? encryptedData.size : encryptedData?.byteLength,
    });
    throw error;
  }
};

  const handleDecrypt = useCallback(debounce(async () => {
    if (!file || !decryptionKey) {
      addToast({
        title: 'Error',
        message: 'Please select a file and enter a decryption key.',
        type: 'error',
        clearPrevious: true,
      });
      return;
    }

    setStatus('decrypting');
    try {
      const fileId = file.name.split('_')[0];
      let fileInfo, shareInfo, encryptedKey, salt, iv;

      const token = localStorage.getItem('token');
      if (token) {
        console.log('Fetching file info:', { fileId });
        const response = await axios.get(`${import.meta.env.VITE_BACKEND_URI}/api/files/list`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        fileInfo = response.data.find((f) => f._id === fileId);
        if (!fileInfo) {
          throw new Error('File not found on server.');
        }

        const userId = localStorage.getItem('userId');
        shareInfo = fileInfo.sharedWith.find(
          (share) => share.userId?.toString() === userId || share.publicToken
        );
        if (!shareInfo && fileInfo.userId !== userId) {
          throw new Error('Unauthorized access.');
        }

        encryptedKey = shareInfo ? shareInfo.encryptedKey : fileInfo.encryptedKey;
        salt = shareInfo ? shareInfo.salt : null;
        iv = shareInfo ? shareInfo.iv : null;
        console.log('File info retrieved:', {
          fileId,
          filename: fileInfo.filename,
          hasShareInfo: !!shareInfo,
          encryptedKey: encryptedKey?.slice(0, 10) + '...',
          salt: salt?.slice(0, 10) + '...',
          iv: iv?.slice(0, 10) + '...',
          fileIv: fileInfo.iv?.slice(0, 10) + '...',
        });
      } else {
        // Public share
        fileInfo = {
          iv: prompt('Enter the file IV (base64) provided with the share:'),
          filename: file.name.replace(`${fileId}_`, ''),
        };
        encryptedKey = prompt('Enter the encrypted key (base64) provided with the share:');
        salt = prompt('Enter the salt (base64) provided with the share:');
        iv = prompt('Enter the IV (base64) for the encrypted key:');
        if (!fileInfo.iv || !encryptedKey || !salt || !iv) {
          throw new Error('Missing required decryption parameters.');
        }
        console.log('Public share inputs:', {
          filename: fileInfo.filename,
          fileId,
          encryptedKey: encryptedKey.slice(0, 10) + '...',
          salt: salt.slice(0, 10) + '...',
          iv: iv.slice(0, 10) + '...',
          fileIv: fileInfo.iv.slice(0, 10) + '...',
        });
      }

      const decryptedBlob = await decryptFile(
        file,
        encryptedKey,
        salt,
        iv,
        fileInfo.iv,
        fileInfo.filename
      );
      FileSaver.saveAs(decryptedBlob, fileInfo.filename);

      setStatus('completed');
      addToast({
        title: 'Decryption Successful',
        message: `${fileInfo.filename} has been decrypted and downloaded.`,
        type: 'success',
        clearPrevious: true,
      });
      setFile(null);
      setDecryptionKey('');
    } catch (error) {
      console.error('Decryption error:', {
        fileId: file?.name?.split('_')[0],
        filename: file?.name,
        message: error.message,
        name: error.name,
        stack: error.stack,
      });
      setStatus('failed');
      addToast({
        title: 'Decryption Failed',
        message: error.message || 'Failed to decrypt file. Check the decryption key or file integrity.',
        type: 'error',
        clearPrevious: true,
      });
    }
  }, 500), [file, decryptionKey]);

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      <div
        className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
          isDragOver ? 'border-blue-600 bg-blue-50' : 'border-gray-400'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Lock className="h-10 w-10 text-gray-600 mx-auto mb-2" />
        <h3 className="text-lg font-semibold mb-2">Drop Encrypted File Here or Click to Select</h3>
        <p className="text-sm text-gray-600 mb-4">
          Upload your file to be decrypted
        </p>
        <input
          type="file"
          onChange={handleFileSelect}
          className="hidden"
          id="file-decrypt"
        />
        <label
          htmlFor="file-decrypt"
          className="inline-block bg-blue-500 text-white rounded-md cursor-pointer px-4 py-2 hover:bg-blue-700"
        >
          Select File
        </label>
      </div>

      {file && (
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-3">
              <FileText className="h-8 w-8 text-gray-500" />
              <div>
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
              </div>
            </div>
            <button
              onClick={() => setFile(null)}
              disabled={status === 'decrypting'}
              className="p-1 rounded-full hover:bg-gray-200 disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label htmlFor="decryptionKey" className="block text-sm font-medium text-gray-700">
            Decryption Key
          </label>
          <input
            type="text"
            id="decryptionKey"
            value={decryptionKey}
            onChange={(e) => setDecryptionKey(e.target.value)}
            className="mt-1 block w-full border border-gray-300 rounded-md p-2"
            placeholder="Enter decryption key"
            disabled={status === 'decrypting'}
          />
        </div>
        <button
          onClick={handleDecrypt}
          disabled={!file || !decryptionKey || status === 'decrypting'}
          className="w-full bg-blue-500 text-white rounded-md py-2 hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center"
        >
          {status === 'decrypting' && <Shield className="h-4 w-4 animate-pulse mr-2" />}
          {status === 'decrypting' ? 'Decrypting...' : 'Decrypt File'}
        </button>
      </div>
    </div>
  );
};

export default FileDecrypt;