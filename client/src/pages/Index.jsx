import React from 'react';
import { Shield, Lock, Users, Key, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-gray-100 flex flex-col">
      <Header />
      <main className="flex-grow">
        <div className="container mx-auto px-4 py-16">
          <div className="text-center mb-12">
            <div className="flex items-center justify-center mb-6">
              <Shield className="h-16 w-16 text-blue-600" />
            </div>
            <h1 className="text-5xl font-bold mb-6">SecureVault</h1>
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
              End-to-end encrypted file storage and sharing platform. 
              Your files are encrypted on your device before upload - we never see your data.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Link to="/login">
                <button className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 flex items-center justify-center text-lg min-w-[150px]">
                  Get Started
                  <ArrowRight className="ml-2 h-4 w-4" />
                </button>
              </Link>
              <button className="border border-gray-300 text-gray-600 px-6 py-3 rounded-lg hover:bg-gray-100 text-lg min-w-[150px]">
                Learn More
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
            <div className="border rounded-lg bg-white shadow-sm">
              <div className="p-6">
                <Lock className="h-12 w-12 text-blue-600 mb-4" />
                <h4 className="text-lg font-semibold mb-2">End-to-End Encryption</h4>
                <p className="text-sm text-gray-500">
                  AES-256-GCM encryption happens on your device. We never have access to your plaintext files.
                </p>
              </div>
            </div>
            <div className="border rounded-lg bg-white shadow-sm">
              <div className="p-6">
                <Key className="h-12 w-12 text-blue-600 mb-4" />
                <h4 className="text-lg font-semibold mb-2">Zero-Knowledge</h4>
                <p className="text-sm text-gray-500">
                  Your encryption keys are derived from your password. Only you can decrypt your files.
                </p>
              </div>
            </div>
            <div className="border rounded-lg bg-white shadow-sm">
              <div className="p-6">
                <Users className="h-12 w-12 text-blue-600 mb-4" />
                <h4 className="text-lg font-semibold mb-2">Secure Sharing</h4>
                <p className="text-sm text-gray-500">
                  Share files securely with public key cryptography. Recipients get their own encrypted copy.
                </p>
              </div>
            </div>
            <div className="border rounded-lg bg-white shadow-sm">
              <div className="p-6">
                <Shield className="h-12 w-12 text-blue-600 mb-4" />
                <h4 className="text-lg font-semibold mb-2">2FA Protection</h4>
                <p className="text-sm text-gray-500">
                  Email-based two-factor authentication adds an extra layer of security to your account.
                </p>
              </div>
            </div>
          </div>

          <div className="border rounded-lg bg-white shadow-lg mb-16">
            <div className="text-center p-6">
              <h4 className="text-3xl font-bold mb-4">Military-Grade Security</h4>
              <p className="text-lg text-gray-500">Built with the highest security standards in mind</p>
            </div>
            <div className="p-6">
              <div className="grid md:grid-cols-3 gap-8">
                <div className="text-center">
                  <div className="bg-blue-50 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                    <Lock className="h-8 w-8 text-blue-600" />
                  </div>
                  <h4 className="font-semibold mb-2">Client-Side Encryption</h4>
                  <p className="text-sm text-gray-500">
                    Files are encrypted in your browser before upload using AES-256-GCM
                  </p>
                </div>
                <div className="text-center">
                  <div className="bg-blue-50 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                    <Key className="h-8 w-8 text-blue-600" />
                  </div>
                  <h4 className="font-semibold mb-2">Key Management</h4>
                  <p className="text-sm text-gray-500">
                    Your encryption keys are never stored on our servers
                  </p>
                </div>
                <div className="text-center">
                  <div className="bg-blue-50 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                    <Shield className="h-8 w-8 text-blue-600" />
                  </div>
                  <h4 className="font-semibold mb-2">Audit Trail</h4>
                  <p className="text-sm text-gray-500">
                    Complete audit logs for all file access and sharing activities
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="text-center">
            <div className="border rounded-lg bg-white shadow-sm max-w-2xl mx-auto">
              <div className="p-6 text-center">
                <h4 className="text-2xl font-bold mb-4">Ready to Secure Your Files?</h4>
                <p className="text-sm text-gray-500">
                  Join thousands of users who trust SecureVault with their most sensitive data
                </p>
              </div>
              <div className="p-6 pt-0 flex justify-center">
                <Link to="/login">
                  <button className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 flex items-center justify-center text-lg">
                    Start Using SecureVault
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Index;