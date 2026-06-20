"""Encrypt ARI credentials for D1 seeding. Usage: python seed-credentials.py <email> <password> <key>"""
import json
import os
import sys
from base64 import b64encode

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def encrypt_text(plain: str, secret: str) -> str:
    key = secret.encode("utf-8").ljust(32, b"0")[:32]
    iv = os.urandom(12)
    aes = AESGCM(key)
    cipher = aes.encrypt(iv, plain.encode("utf-8"), None)
    return f"{b64encode(iv).decode()}.{b64encode(cipher).decode()}"


if __name__ == "__main__":
    email, password, enc_key = sys.argv[1:4]
    print(json.dumps({
        "emailEnc": encrypt_text(email, enc_key),
        "passEnc": encrypt_text(password, enc_key),
    }))
