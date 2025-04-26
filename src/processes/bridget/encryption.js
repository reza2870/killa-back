import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

export function decrypt(text, password) {
	let textParts = text.split(':');
	let iv = Buffer.from(textParts.shift(), 'hex');
	let encryptedText = Buffer.from(textParts.join(':'), 'hex');

	// Hash the password to ensure it's 256 bits (32 bytes) long
	let hashedPassword = createHash('sha256').update(password).digest();

	let decipher = createDecipheriv('aes-256-cbc', hashedPassword, iv);
	let decrypted = decipher.update(encryptedText);

	decrypted = Buffer.concat([decrypted, decipher.final()]);

	return decrypted.toString();
}
const AES_METHOD = 'aes-256-cbc';
const IV_LENGTH = 16; // For AES, this is always 16, checked with php

export function encrypt(text, password) {
	let hashedPassword = createHash('sha256').update(password).digest();
	if (process.versions.openssl <= '1.0.1f') {
		throw new Error('OpenSSL Version too old, vulnerability to Heartbleed')
	}

	let iv = randomBytes(IV_LENGTH);
	let cipher = createCipheriv(AES_METHOD, Buffer.from(hashedPassword), iv);
	let encrypted = cipher.update(text);

	encrypted = Buffer.concat([encrypted, cipher.final()]);

	return iv.toString('hex') + ':' + encrypted.toString('hex');
}