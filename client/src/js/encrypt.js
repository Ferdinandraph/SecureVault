import axios from 'axios';

async function generateRSAKeyPair() {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  );

  const publicKey = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const privateKey = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

  return {
    publicKey: btoa(String.fromCharCode(...new Uint8Array(publicKey))),
    privateKey: btoa(String.fromCharCode(...new Uint8Array(privateKey))),
  };
}

async function generateAESKey() {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const rawKey = await crypto.subtle.exportKey('raw', key);
  return btoa(String.fromCharCode(...new Uint8Array(rawKey)));
}

async function encryptPrivateKey(privateKey, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const passwordKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  const privateKeyData = Uint8Array.from(atob(privateKey), c => c.charCodeAt(0));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    passwordKey,
    privateKeyData
  );

  return {
    encrypted: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    salt: btoa(String.fromCharCode(...salt)),
    iv: btoa(String.fromCharCode(...iv)),
  };
}

async function encryptFile(file, userEmail) {
  try {
    if (!file) throw new Error('No file provided for encryption');
    const token = localStorage.getItem('token');
    const userResponse = await axios.get(`${import.meta.env.VITE_BACKEND_URI}/api/auth/public-key/${userEmail}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const publicKeyData = userResponse.data.publicKey;

    const publicKey = await crypto.subtle.importKey(
      'spki',
      Uint8Array.from(atob(publicKeyData), c => c.charCodeAt(0)),
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['encrypt']
    );

    const aesKey = await generateAESKey();
    const aesKeyData = Uint8Array.from(atob(aesKey), c => c.charCodeAt(0));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const fileData = await file.arrayBuffer();

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      aesKeyData,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );

    const encryptedData = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      fileData
    );

    const encryptedKey = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      publicKey,
      aesKeyData
    );

    return {
      encrypted: new Blob([encryptedData], { type: 'application/octet-stream' }),
      key: aesKey, // Raw AES key, base64-encoded
      encryptedKey: btoa(String.fromCharCode(...new Uint8Array(encryptedKey))), // RSA-encrypted AES key
      iv: btoa(String.fromCharCode(...iv)),
    };
  } catch (error) {
    throw new Error('File encryption failed: ' + error.message);
  }
}

export { generateRSAKeyPair, generateAESKey, encryptPrivateKey, encryptFile };