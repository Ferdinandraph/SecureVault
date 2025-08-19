Secure File Storage and Sharing System

This project is a web-based application for secure file storage and sharing with end-to-end encryption (E2EE). It ensures files are encrypted client-side using AES-256-GCM and RSA-OAEP, so the server never accesses plaintext data. Built with React.js, Node.js, and MongoDB, it features user authentication, secure file uploads, sharing via encrypted links, and a modern, intuitive UI styled with Tailwind CSS. The system is designed for security, accessibility, and ease of use, with a focus on a "lovable" user experience inspired by apps like Dropbox and WeTransfer.
Table of Contents

Overview
Features
Technology Stack
System Workflow
MongoDB Schema Design
Setup Instructions
Development Notes
UI Design Approach
Contributing
License

Overview
The Secure File Storage and Sharing System allows users to register, log in, upload encrypted files, share them securely, and manage files via a dashboard. End-to-end encryption ensures privacy, with client-side encryption/decryption using the Web Crypto API. An admin panel provides user oversight and audit logs. The MVP runs locally or on MongoDB Atlas, with optional AWS S3 integration for production.
Objective: Deliver a secure, user-friendly platform for file storage and sharing, prioritizing privacy, minimalism, and accessibility.
Features

User Authentication: Register/login with email, password, and 2FA (email OTP via Nodemailer).
Client-Side Encryption: Files encrypted with AES-256-GCM; keys encrypted with RSA-OAEP.
Secure File Storage: Encrypted files stored on local filesystem (MVP) or AWS S3 (production).
File Sharing: Generate secure links with recipient’s public key for decryption.
User Dashboard: Upload, view, share, and delete files with a clean, responsive UI.
Admin Panel: Monitor users, view audit logs, and manage system settings.
E2EE Security: Server never accesses plaintext files or keys.

Technology Stack

Frontend: React.js, Tailwind CSS (via npm), Axios, React Router DOM.
Backend: Node.js, Express.js, MongoDB (Mongoose), JWT, Bcrypt, Nodemailer, Helmet, Multer, Morgan.
Encryption: Web Crypto API (AES-256-GCM for files, RSA-OAEP for key exchange).
Development Tools: Nodemon (backend dev), Tailwind CSS Forms plugin, Git.
Storage: Local filesystem (MVP), AWS S3 (optional for production).

System Workflow

User Registration:
User signs up with email/password, generates RSA key pair (Web Crypto API).
Public key stored in MongoDB; private key downloaded securely.
2FA enabled via email OTP.


Login:
Authenticate with email/password and OTP; receive JWT token.


File Upload:
User selects file; client-side encrypts with AES-256-GCM.
AES key encrypted with user’s public key, stored in MongoDB.
Encrypted file uploaded to backend/uploads/ (or S3).


File Sharing:
User generates share link with file ID and encrypted AES key (using recipient’s public key).
Recipient decrypts with their private key to access the file.


File Download:
User/recipient downloads encrypted file, decrypts client-side with private key.


Admin Oversight:
Admin views user activity, audit logs, and manages accounts via dashboard.



MongoDB Schema Design
Users
{
  _id: ObjectId,
  email: String (unique, required),
  password: String (hashed, required),
  publicKey: String (required),
  createdAt: Date (default: now)
}

Files
{
  _id: ObjectId,
  ownerId: ObjectId (ref: User),
  filePath: String (disk/S3 path),
  encryptedKey: String (AES key encrypted with publicKey),
  encryptedMetadata: { name: String, size: Number },
  createdAt: Date
}

Shares
{
  _id: ObjectId,
  fileId: ObjectId (ref: File),
  recipientId: ObjectId (ref: User, optional),
  encryptedKey: String (AES key encrypted with recipient’s publicKey),
  shareLink: String (unique),
  expiry: Date (optional),
  createdAt: Date
}

Notes:

Indexes on Users.email and Shares.shareLink for performance.
Encrypted files stored in backend/uploads/ (MVP); metadata and keys in MongoDB.

Setup Instructions
Prerequisites

Node.js and npm: Install LTS version from nodejs.org. Verify: node -v, npm -v.
MongoDB: Install Community Edition from mongodb.com or use MongoDB Atlas. Verify: mongod --version. Optional: Use MongoDB Compass for GUI.
Git: Install from git-scm.com. Verify: git --version.
Browser: Chrome/Firefox for Web Crypto API support.
Code Editor: VS Code with extensions (JavaScript, React, Tailwind CSS, MongoDB).

Project Setup

Clone Repository:
git clone https://github.com/yourusername/secure-file-storage.git
cd secure-file-storage


Set Up Backend:
cd backend
npm init -y
npm install express mongoose jsonwebtoken bcrypt helmet multer nodemailer morgan
npm install -D nodemon


Create .env in backend/:PORT=5000
MONGO_URI=mongodb://localhost:27017/secure_file_storage
JWT_SECRET=your_jwt_secret
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_email_app_password


Generate JWT_SECRET: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))".
Use app-specific password for EMAIL_PASS (e.g., Gmail app password).
Update package.json:"scripts": {
  "start": "node server.js",
  "dev": "nodemon server.js"
}




Set Up Frontend:
cd ../frontend
npx create-react-app . --template typescript
npm install axios react-router-dom tailwindcss @tailwindcss/forms
npx tailwindcss init -p


Update tailwind.config.js:module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: { extend: {} },
  plugins: [require("@tailwindcss/forms")],
};


Update src/index.css:@tailwind base;
@tailwind components;
@tailwind utilities;




Project Structure:
secure-file-storage/
├── backend/
│   ├── config/
│   │   └── db.js
│   ├── models/
│   │   ├── User.js
│   │   ├── File.js
│   │   └── Share.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── files.js
│   │   └── shares.js
│   ├── middleware/
│   │   └── auth.js
│   ├── uploads/
│   ├── .env
│   └── server.js
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Login.tsx
│   │   │   ├── Register.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   └── FileUpload.tsx
│   │   ├── pages/
│   │   │   ├── Home.tsx
│   │   │   ├── Auth.tsx
│   │   │   └── Share.tsx
│   │   ├── App.tsx
│   │   ├── index.tsx
│   │   └── index.css
│   └── package.json
└── .gitignore


.gitignore:node_modules/
.env
frontend/build
backend/uploads




Run Application:

Backend: cd backend && npm run dev (runs on http://localhost:5000).
Frontend: cd frontend && npm start (runs on http://localhost:3000).
Test MongoDB connection with Compass.
Verify Web Crypto API in browser console (e.g., crypto.subtle.generateKey).



Development Notes

Authentication: Implement POST /api/auth/register, POST /api/auth/login, and POST /api/auth/2fa in routes/auth.js. Use JWT middleware for protected routes.
Encryption: Use Web Crypto API in frontend for AES-256-GCM (file encryption) and RSA-OAEP (key encryption). Store private keys client-side (user downloads).
File Storage: Save encrypted files in backend/uploads/ for MVP. Use Multer for uploads. Plan for AWS S3 in production.
MongoDB: Create schemas with Mongoose (models/User.js, File.js, Share.js). Index email and shareLink for performance.

UI Design Approach
To achieve a "lovable" UI, the frontend uses Tailwind CSS for a clean, modern, and accessible design inspired by apps like Dropbox and WeTransfer.

Principles:
Minimalism: Simple forms, ample white space, clear CTAs (e.g., "Upload", "Share").
Accessibility: High contrast, ARIA labels, keyboard navigation.
Responsiveness: Tailwind’s utilities (e.g., sm:, md:) ensure mobile/desktop compatibility.


Components:
Login/Register: Centered card with email, password, OTP inputs, styled with Tailwind’s @tailwindcss/forms.
Dashboard: Grid/list view for files, with upload/share/delete buttons.
File Upload: Drag-and-drop area with progress bar.
Share Page: Minimal download button with expiry info.


Inspiration: Sourced from Tailwind UI, Flowbite, or Tailblocks for reusable components. Customize with blue/gray palette for a professional look.

Contributing
Contributions are welcome! To contribute:

Fork the repository.
Create a feature branch: git checkout -b feature/your-feature.
Commit changes: git commit -m "Add your feature".
Push to branch: git push origin feature/your-feature.
Open a pull request.

License
This project is licensed under the MIT License. See LICENSE for details.
