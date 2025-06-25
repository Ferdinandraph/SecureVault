import React from 'react';
import { Shield, Menu, X } from 'lucide-react';
import { Link } from 'react-router-dom';

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center space-x-2">
          <Shield className="h-8 w-8 text-blue-600" />
          <span className="text-2xl font-bold text-default-font">SecureVault</span>
        </Link>
        <nav className="hidden md:flex items-center space-x-6">
          <Link to="/" className="text-gray-600 hover:text-blue-600 text-sm font-medium">
            Home
          </Link>
          <Link to="/login" className="text-gray-600 hover:text-blue-600 text-sm font-medium">
            Login
          </Link>
          <Link to="/register" className="text-gray-600 hover:text-blue-600 text-sm font-medium">
            Register
          </Link>
          <Link to="/login">
            <button className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 text-sm">
              Get Started
            </button>
          </Link>
        </nav>
        <button className="md:hidden text-gray-600" onClick={toggleMenu}>
          {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>
      {isMenuOpen && (
        <div className="md:hidden bg-white border-t border-gray-200">
          <nav className="flex flex-col items-center space-y-4 py-4">
            <Link to="/" className="text-gray-600 hover:text-blue-600 text-sm font-medium" onClick={toggleMenu}>
              Home
            </Link>
            <Link to="/login" className="text-gray-600 hover:text-blue-600 text-sm font-medium" onClick={toggleMenu}>
              Login
            </Link>
            <Link to="/register" className="text-gray-600 hover:text-blue-600 text-sm font-medium" onClick={toggleMenu}>
              Register
            </Link>
            <Link to="/login" onClick={toggleMenu}>
              <button className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 text-sm">
                Get Started
              </button>
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
};

export default Header;