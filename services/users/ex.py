import os
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
import base64
import os

def encrypt_data(data, key):
    salt = os.urandom(16)
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        iterations=100000,
        salt=salt,
        length=32,
        backend=default_backend()
    )
    key_bytes = kdf.derive(key.encode())
    
    iv = os.urandom(16)
    cipher = Cipher(algorithms.AES(key_bytes), modes.CFB(iv), backend=default_backend())
    encryptor = cipher.encryptor()
    
    padder = padding.PKCS7(128).padder()
    padded_data = padder.update(data.encode()) + padder.finalize()
    
    ciphertext = encryptor.update(padded_data) + encryptor.finalize()
    
    encrypted_data = base64.b64encode(salt) + b'.' + base64.b64encode(iv) + b'.' + base64.b64encode(ciphertext)

    return encrypted_data

token = "your_secret_token"
encryption_key = "INDYAUCTION12345678"

encrypted_token = encrypt_data(token, encryption_key)
print(encrypted_token)
print(type(encrypted_token))
