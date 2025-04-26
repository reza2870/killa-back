import { fromWeb3JsTransaction, toWeb3JsTransaction } from "@metaplex-foundation/umi-web3js-adapters";
import base58 from "bs58";
import { nanoid } from "nanoid";
import { borrowUmi } from "../../lib/functions/getUmi.js";
import { mode, web3conn } from "../globals.js";
import { writeFileSync } from "fs";
import { stringify2 } from "../../lib/functions/stringify.js";



export class Sender {
	static waiting = {};
	static add(id, data) {

		this.waiting[id] = {
			id,
			action: data.action,
			owner: data.owner,
			tokens: data.tokens,
			lastValidBlockHeight: data.lastValidBlockHeight,
			txns: data.txns,
			signatures: data.signatures
		};
		setTimeout(() => delete this.waiting[id], 1000 * 60 * 10);
		return id;
	}

	static async send(data) {
		const id = data.id;
		const req = this.waiting[id];
		if (!req) return { error: 'txn_not_foun' };
		const sigs = data.sig.split(',').map(sig => base58.decode(sig));
		for (let i = 0; i < sigs.length; i++) {
			req.signatures[i][req.owner] = sigs[i];
		}
		const ret = [];
		let umi = await borrowUmi();
		let log = [];
		for (let i = 0; i < req.txns.length; i++) {
			const accounts = req.txns[i].message.accounts;
			const signatures = req.signatures[i];
			const txn = toWeb3JsTransaction(req.txns[i]);
			for (let signer in signatures) {
				const signature = signatures[signer];
				const index = accounts.indexOf(signer);
				txn.signatures[index] = signature;
			}

			log.push(fromWeb3JsTransaction(txn));
			ret.push(req.txns[i].id);
			this.sendTxn(umi, req.id + ':' + i, fromWeb3JsTransaction(txn), req.lastValidBlockHeight);
		}
		writeFileSync(`temp/${id}/received.json`, stringify2(log, true));
		return ret;
	}
	static async sendTxn(umi, id, txn, lastValidBlockHeight) {

		for (let i = 0; i < 60; i++) {
			break;
			console.log('waiting', i, 60);
			await new Promise(r => setTimeout(r, 1000));
		}
		let blockheight = 0;

		let txnSig;
		let skipPreflight = false;
		while (blockheight < lastValidBlockHeight) {
			try {
				//txnSig = await web3conn.sendRawTransaction(txn, { skipPreflight, maxRetries: 0 });
				txnSig = await umi.rpc.sendTransaction(txn, { skipPreflight, maxRetries: 0 });
				console.log(txnSig);
			} catch (e) {
				if (e.logs != null && e.logs.length > 0) {
					console.error(e.logs);
					break;
				}
				console.error(e);
			}
			skipPreflight = true;
			await new Promise(r => setTimeout(r, mode == 'live' ? 250 : 1000));
			blockheight = await this.getBlockHeight(blockheight)
		}
	}
	static async getBlockHeight(blockheight) {
		try {
			return await web3conn.getBlockHeight({ commitment: 'finalized' });
		} catch (e) {
			console.error(e);
		}
		return blockheight;
	}
}