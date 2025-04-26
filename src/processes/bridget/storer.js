import { fromWeb3JsTransaction, toWeb3JsTransaction } from "@metaplex-foundation/umi-web3js-adapters";
import base58 from "bs58";
import { nanoid } from "nanoid";
import { borrowUmi } from "../../lib/functions/getUmi.js";
import { db, mode, web3conn } from "../globals.js";
import { writeFileSync } from "fs";
import { stringify2 } from "../../lib/functions/stringify.js";
import { querify } from "../../lib/functions/querify.js";
import { sha256 } from "../../lib/functions/sha256.js";



export class Storer {
	static waiting = {};
	static async add(id, data) {
		let umi = borrowUmi();
		let queries = [];
		
		for (let i = 0; i < data.txns.length; i++) {
			const accounts = data.txns[i].txn.message.accounts;
			const signatures = data.signatures[i];
			const txn = toWeb3JsTransaction(data.txns[i].txn);
			for (let signer in signatures) {
				const signature = signatures[signer];
				const index = accounts.indexOf(signer);
				txn.signatures[index] = signature;
			}
			const serialized_message = base58.encode(umi.transactions.serialize(fromWeb3JsTransaction(txn)));
			let project_id = data.action.endsWith('Ogs') ? '1' : '19';
			let q = `INSERT INTO sol_txn SET ${querify({
				ts: Math.floor(new Date().getTime() / 1000),
				sender: data.owner,
				eth_token_id: data.tokens[i],
				eth_wallet: data.ethWallet ?? '',
				msg_hash: sha256(serialized_message),
				status: 'unsigned',
				action: data.txns[i].type,
				serialized_message,
				batch_id: id,
				batch_index: i,
				last_valid_blockheight: data.lastValidBlockHeight
			})}, mint = (SELECT mint FROM sol_token_event WHERE eth_token_id = ${db.escape(data.tokens[i])} AND project_id = ${project_id} LIMIT 1)`;
			queries.push(q);
		}
		//process.exit();
		await db.transaction(queries);
		return id;
	}


}