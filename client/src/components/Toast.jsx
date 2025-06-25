import React, { createContext, useContext, useState, useEffect } from 'react';
import { CheckCircle, X, AlertTriangle, Info } from 'lucide-react';

const ToastContext = createContext();

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = ({ title, description, type = 'success' }) => {
    const id = Math.random().toString(36).substring(2);
    setToasts((prev) => [...prev, { id, title, description, type }]);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-50">
        {toasts.map((toast) => (
          <Toast key={toast.id} {...toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

const Toast = ({ id, title, description, type, onClose }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300); // Match animation duration
    }, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const getIcon = () => {
    switch (type) {
      case 'error':
        return <AlertTriangle className="h-6 w-6 text-red-500" />;
      case 'info':
        return <Info className="h-6 w-6 text-blue-500" />;
      default:
        return <CheckCircle className="h-6 w-6 text-green-500" />;
    }
  };

  const getBorderColor = () => {
    switch (type) {
      case 'error':
        return 'border-red-500';
      case 'info':
        return 'border-blue-500';
      default:
        return 'border-green-500';
    }
  };

  return (
    <div
      className={`pointer-events-auto bg-white rounded-lg shadow-xl p-6 max-w-sm w-full flex items-start space-x-4 transform transition-all duration-300 ${
        isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
      } border-l-4 ${getBorderColor()}`}
    >
      {getIcon()}
      <div className="flex-1">
        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
        <p className="text-sm text-gray-600">{description}</p>
      </div>
      <button
        onClick={() => {
          setIsVisible(false);
          setTimeout(onClose, 300);
        }}
        className="p-1 rounded-full hover:bg-gray-100"
      >
        <X className="h-4 w-4 text-gray-500" />
      </button>
    </div>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};