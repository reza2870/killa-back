import { Keypair } from "@solana/web3.js";
import { getUmi, returnUmi } from "../../lib/functions/getUmi.js";
import { recursiveHash } from "../../lib/functions/sha256.js";
import { addresses, partials3 } from "../globals.js";

import { decrypt } from "./encryption.js";
import { createSignerFromKeypair } from "@metaplex-foundation/umi";

import { Txns } from "./txns.js";
import base58 from "bs58";

export class Signer {

	static async sign(get, auth, qs) {
		const action = get.type;
		const tokens = get.ids.split(',');
		const owner = get.owner;

		let umi = getUmi(owner);
		const req = { umi, action, tokens, owner, auth, qs, signer: get.signer, blockhash: get.blockhash }

		let txns = await Txns.builders[action](req);
		if (txns.error != null) return txns;
		let signer = this.getSigner(req);

		try {
			let signed = [];
			for (let txn of txns) {
				
				const accounts = txn.txn.message.accounts;
				
				const requiredSigners = txn.txn.message.header.numRequiredSignatures;
				const index = accounts.indexOf(get.signer);
				if (index == -1 || index >= requiredSigners) {
					signed.push(null);
					continue;
				}
				let signedMessage = await signer.signTransaction(txn.txn);
				signed.push(base58.encode(signedMessage.signatures[index]));
			}
			//let signed = await signer.signAllTransactions(txns.map(txn => txn.txn));
			returnUmi(umi);

			//writeFileSync(`temp/${get.id}/signed-${req.signer}.json`, stringify2(signed, true));
			//return signed.map(txn => base58.encode(txn.signatures[txn.message.accounts.indexOf(get.signer)]));
			return signed;

		} catch (e) {
			console.log(e);
			return { error: 'Failed to sign' };

		}


	}
	static getSigner(req) {
		const key = 'tc8BrTCtuc5CW7';
		const partial4 = decrypt(req.auth, key);
		const type = Object.entries(addresses).find(entry => entry[1] == req.signer);

		const partial3 = partials3[type[0]];
		const seed = recursiveHash([partial3, partial4]);
		const kp = Keypair.fromSeed(new Uint8Array(Buffer.from(seed, 'hex')))

		return createSignerFromKeypair(req.umi, { secretKey: kp.secretKey, publicKey: '' + kp.publicKey });

	}

}