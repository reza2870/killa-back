import { createSignerFromKeypair } from "@metaplex-foundation/umi";
import { getOrCreate } from "./getOrCreate.js";
import { borrowUmi, getUmi } from "./getUmi.js";
import { Keypair } from "@solana/web3.js";
export async function getSigner(name) {
	let data = await getOrCreate(`./data/${name}.json`, () => {
		return serializeSigner(generateSigner(borrowUmi()));
	});
	return getSignerFromPk(data.secretKey);
}

export function getSignerFromPk(pk) {
	const secretKey = Uint8Array.from(pk);
	const keypair = borrowUmi().eddsa.createKeypairFromSecretKey(secretKey);
	const ret = createSignerFromKeypair(borrowUmi(), keypair);
	return ret;
}
export function getSignerFromPkString(pk) {
	const secretKey = new Uint8Array(Buffer.from(pk, 'base64'));
	const keypair = borrowUmi().eddsa.createKeypairFromSecretKey(secretKey);
	const ret = createSignerFromKeypair(borrowUmi(), keypair);
	return ret;
}

export function serializeSigner(signer) {
	signer ??= generateSigner(borrowUmi());
	return { publicKey: signer.publicKey, secretKey: [...signer.secretKey] };
}

export function encodeBuffer(pk) {
	if (typeof (pk) == 'array') pk = new Uint8Array(pk);
	return Buffer.from(pk).toString('base64');
}

export function decodeBuffer(s) {
	return new Uint8Array(Buffer.from(s, 'base64')).slice(0, 64);
}