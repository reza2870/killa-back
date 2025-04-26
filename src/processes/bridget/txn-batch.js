import { nanoid } from "nanoid";
import { Keypair } from "@solana/web3.js";
import { addresses, config, db, mode, partials2, partials3 } from "../globals.js";
import { Signers } from "../../lib/classes/signers.js";
import { getUmi, returnUmi } from "../../lib/functions/getUmi.js";
import { decrypt, encrypt } from "./encryption.js";
import { recursiveHash, sha256 } from "../../lib/functions/sha256.js";
import { createSignerFromKeypair } from "@metaplex-foundation/umi";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { stringify, stringify3 } from "../../lib/functions/stringify.js";
import { getSignerFromPk } from "../../lib/functions/signers.js";
import { querify } from "../../lib/functions/querify.js";
import base58 from "bs58";

let partial3 = readFileSync(`../config/${mode}/cub-mint-partial3.txt`).toString()
export class TxnBatch {
	static batches = {};
	constructor(data, auth) {

		this.id = nanoid()

		this.auth = auth;
		this.requestId = data.id;
		this.data = data;
		const requestPath = resolve('../../public_html/signing-data/' + this.requestId + '.json');
		this.rawRequest = readFileSync(requestPath).toString();
		this.request = JSON.parse(this.rawRequest);
		this.umi = getUmi(this.request.owner);
		this.theirs = this.request.txns.map(txn => {
			return this.umi.transactions.deserialize(new Uint8Array(txn));
		});

		this.signers = [];
		this.signatures = [];
		TxnBatch.batches[this.id] = this;
	}

	async _remoteSign(type, signatures) {
		let key = this.rawRequest + '-mzZ7RTh3jeRVJY';

		let addr = addresses[type];



		let partial1 = decrypt(this.auth, key);
		let partial2 = partials2[type];
		let partial4 = recursiveHash([partial1, partial2]);



		let qs = `with=${type}&${new URLSearchParams(this.data).toString()}`
		let encrypted = encrypt(partial4, 'tc8BrTCtuc5CW7')

		const url = `${config.sol.signingUrls[type]}?${qs}`;


		let res = await fetch(url, { headers: new Headers({ Authorization: encrypted, }) });
		let data = await res.json();


		for (let i = 0; i < data.length; i++) {
			signatures[i + '-' + addr] = data[i];
		}

	}
	async _signTxn(info) {
		let txn = info.txn;
		let signatures = info.signatures;
		for (let signer of info.signers ?? []) {
			let signed = await signer.signTransaction(txn);
			signatures[signer.publicKey] = signed.signatures[signed.message.accounts.indexOf(signer.publicKey)];
		}
	}

	async submit() {
		try {
			await this._build();
		} catch (e) {
			console.error(e);
			return [''];

		}
		let promises = [];

		let signatures = {};

		promises.push((async () => {
			this.txns ??= [];

			for (let i = 0; i < this.txns.length; i++) {
				let mine = this.txns[i];
				let theirs = this.theirs[i];
				let row = this.rows[i];

				if (row.has_been_minted == '1') continue;
				let combo1 = row.mint_secret_partial1;
				let combo2 = row.mint_secret_partial2;
				let combo3 = recursiveHash([combo1, combo2, partial3, row.mint], 2);

				let key = decrypt(row.mint_secret_enc, combo3);

				let secret = new Uint8Array(Buffer.from(key, 'hex'));

				let mint = getSignerFromPk(secret);


				let sig = await this.verifyAndSign(mine, theirs, mint);
				signatures[i + '-' + mint.publicKey] = sig;
			}
		})());
		for (let signer of this.signers) {
			promises.push((async () => await this._remoteSign(signer, signatures))());
		}
		await Promise.all(promises);
		let txns = [];
		promises = [];
		let before = this.beforeSubmit?.() ?? null;
		for (let i = 0; i < this.txns.length; i++) {
			let txn = this.theirs[i];
			for (let j = 0; j < txn.signatures.length; j++) {

				let addr = txn.message.accounts[j];
				if (addr == this.request.owner) continue;
				let sig = signatures[i + '-' + addr];
				if (!sig) continue;
				txn.signatures[j] = new Uint8Array(sig);
			}
			txns.push(txn);

			promises.push((async () => {
				try {
					let result = await this.umi.rpc.sendTransaction(txn)
					//const blockhash = await this.umi.rpc.getLatestBlockhash();
					//const strategy = { type: 'blockhash', ...blockhash };
					//let confirmation = await this.umi.rpc.confirmTransaction(result, { strategy });
					return result;
				} catch (e) {
					console.error(e);
					return '';
				}
			})());
		}


		let ret = await Promise.all(promises);
		returnUmi(this.umi);
		if (before) {
			before.then(() => this.afterSubmit?.(ret));
		} else {
			this.afterSubmit?.(ret);
		}
		return ret;



	}

	async verifyAndSign(mine, theirs, signer) {
		let instr1 = this.getInstructions(mine, signer.publicKey);
		let instr2 = this.getInstructions(mine, signer.publicKey);
		let index = theirs.message.accounts.indexOf(signer.publicKey);

		if (instr1 != instr2) {
			throw new Error('Instruction mismatch');
		}
		try {
			let signed = await signer.signTransaction(theirs);
			return signed.signatures[index];
		} catch (e) {
			console.error(e);
			console.log('')
			console.log('')
			console.log(theirs);
			console.log('')
			console.log('')
			console.log(signer.publicKey)
			console.log('')
			console.log('')
			return '';
		}

	}
	getInstructions(txn, addr) {
		let index = txn.message.accounts.indexOf(addr);
		let ret = [];
		for (let instruction of txn.message.instructions) {
			if (instruction.accountIndexes.includes(index)) {
				let program = txn.message.accounts[instruction.programIndex];
				let acts = instruction.accountIndexes.map(id => txn.message.accounts[id]);
				ret.push({ program, data: instruction.data, acts });
			}
		}



		return stringify(ret.sort());
	}


	async sign() {
		try {
			await this._build();

			let key = 'tc8BrTCtuc5CW7';
			let partial4 = decrypt(this.auth, key);
			let partial3 = partials3[this.data.with];
			let seed = recursiveHash([partial3, partial4]);

			let kp = Keypair.fromSeed(new Uint8Array(Buffer.from(seed, 'hex')))
			kp = { secretKey: kp.secretKey, publicKey: '' + kp.publicKey }
			let signer = createSignerFromKeypair(this.umi, kp);
			let ret = [];
			for (let i = 0; i < this.txns.length; i++) {
				let mine = this.txns[i];
				let theirs = this.theirs[i];
				ret.push(await this.verifyAndSign(mine, theirs, signer));
			}
			//console.log(ret, this.data.with, this.txns.length);
			returnUmi(this.umi);
			return ret;
		} catch (e) {
			console.error(e);
			return [];
		}

	}

	duplicate(txn) {
		return this.umi.transactions.deserialize(this.umi.transactions.serialize(txn));
	}
	async beforeSubmit() {
		let queries = [];
		const now = Math.floor(new Date().getTime() / 1000);
		for (let i = 0; i < this.request.tokens.length; i++) {
			let token = this.request.tokens[i];
			let row = this.rows.find(row => row.eth_token_id == token);
			let txn = this.theirs[i];
			if (row == null) continue;
			const hash = sha256(Buffer.from(txn.serializedMessage).toString('base64')).toString('hex');
			let q = `INSERT INTO sol_txn SET ${querify({
				ts: now,
				signature: '_' + nanoid(),
				txn: stringify(txn, true),
				sender: this.request.owner,
				msg_hash: hash,
				mint: row.mint,
				eth_token_id: token,
				status: 'new',
				action: this.type,
				error: ''
			})}`;
			queries.push(q);


		}
		await db.transaction(queries);
	}
	async afterSubmit(results) {

		let queries = [];
		for (let i = 0; i < this.request.tokens.length; i++) {
			let token = this.request.tokens[i];
			const row = this.rows.find(row => row.eth_token_id == token);
			let txn = this.theirs[i];
			if (row == null) continue;
			const hash = sha256(Buffer.from(txn.serializedMessage).toString('base64')).toString('hex');
			let res = results[i];
			if (res == '' || res == null) {
				let q = `UPDATE sol_txn SET status = 'error', error='error' WHERE msg_hash=${db.escape(hash)}`;
				queries.push(q);
			} else {
				let q = `UPDATE sol_txn SET ${querify({
					signature: base58.encode(res),
					status: 'sent',
				})} WHERE msg_hash=${db.escape(hash)}`;
				queries.push(q);
			}

		}
		console.log(queries);
		await db.transaction(queries);
	}
}

export function fakeSigner(publicKey) {
	if (addresses[publicKey] != null) publicKey = addresses[publicKey];
	return { publicKey, signMessage: () => { }, signTransaction: () => { }, signAllTransactions: () => { } };
}