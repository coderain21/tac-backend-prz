const CryptoJS = require('crypto-js');

function decryptData(encryptedData, key) {
    const [base64Salt, base64Iv, base64Ciphertext] = encryptedData.split('.');
    const salt = CryptoJS.enc.Base64.parse(base64Salt);
    const iv = CryptoJS.enc.Base64.parse(base64Iv);
    const ciphertext = CryptoJS.enc.Base64.parse(base64Ciphertext);

    const derivedKey = CryptoJS.PBKDF2(key, salt, {
        keySize: 256 / 32,
        iterations: 100000
    });

    const decrypted = CryptoJS.AES.decrypt(
        { ciphertext: ciphertext },
        derivedKey,
        {
            iv: iv,
            padding: CryptoJS.pad.Pkcs7,
            mode: CryptoJS.mode.CFB
        }
    );

    return decrypted.toString(CryptoJS.enc.Utf8);
}

const encryptedToken = 'qsGQtn58aS6rmlkAuW0SoA==.8qjr8N9nbkTurNOfoCgU5g==.gF+CipI2/GQ80idALes1MYuXdy+/p3epTTPefKtvJoQ='
const decryptionKey = "INDYAUCTION12345678";

const decryptedToken = decryptData(encryptedToken, decryptionKey);
console.log(decryptedToken);
