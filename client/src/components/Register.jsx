import React, { useState, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useToast } from './Toast';
import { AuthContext } from '../App';
import { Mail, User, Lock, Key } from 'lucide-react';

const Register = () => {
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    password: '',
    otp: '',
  });
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [keyData, setKeyData] = useState({});
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { login } = useContext(AuthContext);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value.trim() });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (step === 1) {
        console.log('Register attempt from frontend:', {
          email: formData.email,
          username: formData.username,
          passwordLength: formData.password.length,
        });
        const emailRegex = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@(.+)\.([a-zA-Z]{2,})$/;
        if (!emailRegex.test(formData.email)) {
          addToast({ title: 'Invalid Email', description: 'Please enter a valid email address.', type: 'error' });
          return;
        }
        if (formData.password.length < 8) {
          addToast({ title: 'Weak Password', description: 'Password must be at least 8 characters.', type: 'error' });
          return;
        }
        if (!formData.username) {
          addToast({ title: 'Missing Username', description: 'Username is required.', type: 'error' });
          return;
        }

        // Generate RSA key pair
        const keyPair = await crypto.subtle.generateKey(
          {
            name: 'RSA-OAEP',
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: 'SHA-256',
          },
          true,
          ['encrypt', 'decrypt']
        );

        // Export public key
        const publicKey = await crypto.subtle.exportKey('spki', keyPair.publicKey);
        const base64PublicKey = btoa(String.fromCharCode(...new Uint8Array(publicKey)));

        // Export and encrypt private key
        const privateKey = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const passwordKey = await crypto.subtle.deriveKey(
          {
            name: 'PBKDF2',
            salt,
            iterations: 100000,
            hash: 'SHA-256',
          },
          await crypto.subtle.importKey('raw', new TextEncoder().encode(formData.password), 'PBKDF2', false, ['deriveKey']),
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt']
        );
        const encryptedPrivateKey = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          passwordKey,
          privateKey
        );
        const base64EncryptedPrivateKey = btoa(String.fromCharCode(...new Uint8Array(encryptedPrivateKey)));
        const base64Salt = btoa(String.fromCharCode(...salt));
        const base64Iv = btoa(String.fromCharCode(...iv));

        // Store key data for step 2
        setKeyData({
          publicKey: base64PublicKey,
          encryptedPrivateKey: `${base64EncryptedPrivateKey}:${base64Salt}:${base64Iv}`,
        });

        await axios.post(`${import.meta.env.VITE_BACKEND_URI}/api/auth/register`, {
          email: formData.email,
          username: formData.username,
          password: formData.password,
          publicKey: base64PublicKey,
          encryptedPrivateKey: `${base64EncryptedPrivateKey}:${base64Salt}:${base64Iv}`,
        });
        setStep(2);
        addToast({ title: 'OTP Sent', description: 'An OTP has been sent to your email!', type: 'success' });
      } else {
        console.log('OTP verification attempt from frontend:', { email: formData.email, otp: formData.otp });
        const response = await axios.post(`${import.meta.env.VITE_BACKEND_URI}/api/auth/verify-otp`, {
          email: formData.email,
          otp: formData.otp,
        });
        localStorage.setItem('encryptedPrivateKey', keyData.encryptedPrivateKey);
        login(response.data.token, response.data.user);
        addToast({ title: 'Registration Complete', description: 'Welcome to SecureVault!', type: 'success' });
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Registration error from frontend:', error.response?.data || error.message);
      addToast({
        title: 'Registration Failed',
        description: error.response?.data?.message || 'Registration failed.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
        <h2 className="text-2xl font-bold text-center mb-6">
          {step === 1 ? 'Register for SecureVault' : 'Verify OTP'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {step === 1 ? (
            <>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="Email"
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  placeholder="Username"
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Password"
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <p className="text-sm text-gray-500 mt-1">Password must be at least 8 characters.</p>
            </>
          ) : (
            <div className="relative">
              <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                name="otp"
                value={formData.otp}
                onChange={handleChange}
                placeholder="Enter OTP"
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className={`w-full py-2 px-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {loading ? 'Processing...' : step === 1 ? 'Send OTP' : 'Verify OTP'}
          </button>
        </form>
        {step === 1 && (
          <p className="text-center mt-4 text-sm">
            Already have an account?{' '}
            <Link to="/login" className="text-blue-500 hover:underline">
              Login
            </Link>
          </p>
        )}
      </div>
    </div>
  );
};

export default Register;