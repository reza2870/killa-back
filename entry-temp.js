import { Keypair } from "@solana/web3.js";
import { recursiveHash } from "../setup/recursiveHash.js";
import { mode } from "./src/processes/globals.js";
import { writeFileSync } from "fs";

let out = [];
for (let i = 1; i <= 3333; i++) {
	const key1 = 'VLoZDup8wq3VWHJY4gzatIiSAxxLCLu_9OLfnS5Hh0-' + mode;
	const key2 = i;

	let mint = Keypair.fromSeed(new Uint8Array(Buffer.from(recursiveHash(key1 + key2, 20), 'hex'))).publicKey.toString();
	out.push(mint)
}

writeFileSync('kb-mints.json', JSON.stringify(out, null, '\t'), 'utf-8');