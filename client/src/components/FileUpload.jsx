import React, { useState, useCallback } from 'react';
import { Upload, FileText, X, Shield } from 'lucide-react';
import { useToast } from './Toast';
import axios from 'axios';
import { encryptFile } from '../js/encrypt.js';

const FileUpload = () => {
  const [files, setFiles] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const { addToast } = useToast();

  const getFileType = (filename) => {
    if (!filename || typeof filename !== 'string') return 'document';
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const types = {
      jpg: 'image',
      jpeg: 'image',
      png: 'image',
      gif: 'image',
      zip: 'archive',
      rar: 'archive',
      pdf: 'document',
      rtf: 'document',
      txt: 'document',
      doc: 'document',
      docx: 'document',
    };
    return types[ext] || 'document';
  };

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
    const droppedFiles = Array.from(e.dataTransfer.files);
    processFiles(droppedFiles);
  }, []);

  const handleFileSelect = (e) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      processFiles(selectedFiles);
    }
  };

  const processFiles = async (fileList) => {
    const token = localStorage.getItem('token');
    const userEmail = localStorage.getItem('userEmail');
    if (!token || !userEmail) {
      addToast({ title: 'Authentication Error', description: 'Please log in again.', type: 'error' });
      return;
    }
    const newFiles = fileList.map((file) => ({
      id: crypto.getRandomValues(new Uint8Array(16)).reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), ''),
      file,
      progress: 0,
      status: 'pending',
      retryCount: 0,
    }));

    setFiles((prev) => [...prev, ...newFiles]);
    for (const fileItem of newFiles) {
      await encryptAndUpload(fileItem, userEmail);
    }
  };

  const encryptAndUpload = async (fileItem, userEmail, retry = false) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === fileItem.id ? { ...f, status: 'encrypting' } : f))
    );

    try {
      // Encrypt file
      console.log('Encrypting file:', { filename: fileItem.file.name, size: fileItem.file.size });
      const { encrypted, key, encryptedKey, iv } = await encryptFile(fileItem.file, userEmail);
      const fileType = getFileType(fileItem.file.name);
      if (!fileType) throw new Error('Failed to determine file type');

      setFiles((prev) =>
        prev.map((f) => (f.id === fileItem.id ? { ...f, progress: 50 } : f))
      );

      // Prepare form data
      const formData = new FormData();
      formData.append('file', encrypted, fileItem.file.name);
      formData.append('encryptionKey', key);
      formData.append('encryptedKey', encryptedKey);
      formData.append('iv', iv);
      formData.append('fileType', fileType);

      // Upload
      setFiles((prev) =>
        prev.map((f) => (f.id === fileItem.id ? { ...f, status: 'uploading' } : f))
      );
      const token = localStorage.getItem('token');
      const response = await axios.post(`${import.meta.env.VITE_BACKEND_URI}/api/files/upload`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded / progressEvent.total) * 50) + 50;
          setFiles((prev) =>
            prev.map((f) => (f.id === fileItem.id ? { ...f, progress } : f))
          );
        },
      });

      console.log('Upload response:', { fileId: response.data.fileId, filename: fileItem.file.name });
      setFiles((prev) =>
        prev.map((f) => (f.id === fileItem.id ? { ...f, status: 'completed' } : f))
      );
      addToast({
        title: 'Upload Successful',
        description: `${fileItem.file.name} has been encrypted and uploaded securely.`,
        type: 'success',
      });
    } catch (error) {
      console.error('Upload error:', {
        filename: fileItem.file.name,
        message: error.message,
        status: error.response?.status,
        response: error.response?.data,
      });

      // Retry logic (max 2 retries)
      if (!retry && fileItem.retryCount < 2) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileItem.id ? { ...f, status: 'retrying', retryCount: f.retryCount + 1 } : f
          )
        );
        addToast({
          title: 'Retrying Upload',
          description: `Retrying ${fileItem.file.name} (Attempt ${fileItem.retryCount + 2}/3).`,
          type: 'info',
        });
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2s
        await encryptAndUpload({ ...fileItem, retryCount: fileItem.retryCount + 1 }, userEmail, true);
      } else {
        setFiles((prev) =>
          prev.map((f) => (f.id === fileItem.id ? { ...f, status: 'failed' } : f))
        );
        addToast({
          title: 'Upload Failed',
          description: error.response?.data?.message || `Failed to upload ${fileItem.file.name}: ${error.message}`,
          type: 'error',
        });
      }
    }
  };

  const removeFile = (id) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const retryUpload = (fileItem) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === fileItem.id ? { ...f, status: 'pending', progress: 0, retryCount: 0 } : f))
    );
    encryptAndUpload({ ...fileItem, status: 'pending', progress: 0, retryCount: 0 }, localStorage.getItem('userEmail'));
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
      <div
        className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
          isDragOver ? 'border-blue-600 bg-blue-50' : 'border-gray-400'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Upload className="h-10 w-12 text-gray-600 mx-auto mb-2" />
        <h3 className="text-lg font-semibold mb-2">Drop Files Here or Click to Upload</h3>
        <p className="text-sm text-gray-600 mb-4">
          Files will be encrypted with AES-256-GCM before upload
        </p>
        <input
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          id="file-upload"
        />
        <label
          htmlFor="file-upload"
          className="inline-block bg-blue-500 text-white rounded-md cursor-pointer px-4 py-2 hover:bg-blue-700"
        >
          Select Files
        </label>
      </div>

      {files.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Upload Queue</h4>
          {files.map((fileItem) => (
            <div key={fileItem.id} className="border rounded-lg p-4 bg-white shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-3">
                  <FileText className="h-8 w-8 text-gray-500" />
                  <div>
                    <p className="text-sm font-medium">{fileItem.file.name}</p>
                    <p className="text-xs text-gray-500">{formatFileSize(fileItem.file.size)}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {fileItem.status === 'encrypting' && (
                    <Shield className="h-4 w-4 text-blue-500 animate-pulse" />
                  )}
                  {fileItem.status === 'failed' && (
                    <button
                      onClick={() => retryUpload(fileItem)}
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      Retry
                    </button>
                  )}
                  <button
                    onClick={() => removeFile(fileItem.id)}
                    disabled={fileItem.status === 'encrypting' || fileItem.status === 'uploading'}
                    className="p-1 rounded-full hover:bg-gray-200 disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="capitalize">{fileItem.status}</span>
                  <span>{fileItem.progress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full"
                    style={{ width: `${fileItem.progress}%` }}
                  ></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileUpload;