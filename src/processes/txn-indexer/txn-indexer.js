import { fetchDigitalAssetWithTokenByMint, fetchAllTokenRecord } from '@metaplex-foundation/mpl-token-metadata';
import { addresses, config, cubauth, cubstaker, db } from "../globals.js";
import { processChunks } from "../../lib/functions/processChunks.js";
import { getUmi } from "../../lib/functions/getUmi.js";
import { querify } from '../../lib/functions/querify.js';
import base58 from 'bs58';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { stringify, stringify2 } from '../../lib/functions/stringify.js';
import { sha256 } from '../../lib/functions/sha256.js';
import { TaskManager } from '../../lib/classes/task-manager.js';


const umi = getUmi();

let tasks = new TaskManager(1);

export class TxnIndexer {
	constructor() {
		this.run(() => this.getTxns(), 3000);
	}

	async run(callback, rate) {
		while (true) {
			try { await callback(); }
			catch (e) {
				console.error(e);
			}
			await new Promise(r => setTimeout(r, rate));
		}
	}


	txnsBySignature = {};
	txnsByMessage = {};
	cubsByMint = {};
	lastTxnId = 0;
	async getTxns() {

		let txns = await db.query(`SELECT * FROM sol_txn WHERE id>${this.lastTxnId} ORDER BY id ASC`);
		for (let row of txns) {
			this.txnsBySignature[row.signature] = row;
			this.txnsByMessage[row.msg_hash] = row;
			this.lastTxnId = row.id;
		}

		let cubs = await db.query(`SELECT * FROM sol_token ORDER BY id ASC`);
		for (let row of cubs) {
			this.cubsByMint[row.mint] = row;
		}




		let sigs = [
			...await this.getSignaturesFor(addresses[cubauth]),
			...await this.getSignaturesFor(addresses[cubstaker])
		]

		console.log(sigs.length);

		let map = {};
		for (let sig of sigs) {
			map[sig.signature] = sig;
		}
		sigs = Object.values(map);

		for (let sig of sigs) {
			if (!this.txnsBySignature[sig.signature]) {
				await new Promise(r => setTimeout(r, 30));
				await this.parseTxn(sig.signature, sig.status, sig.ts, sig.err);

			} else {
				let row = this.txnsBySignature[sig.signature];
				let updates = {};

				if (sig.status != row.status) updates.status = sig.status;
				if (sig.err != row.error) updates.error = sig.err;

				if (sig.ts != row.ts) updates.ts = sig.ts;
				if (Object.keys(updates).length > 0) {
					console.log(updates);
					let q = `UPDATE sol_txn SET ${querify(updates)} WHERE id=${db.escape(row.id)}`;
					await this.addQuery(q);
				}
			}
		}

		console.log('ok next');
		await this.checkQueries();
	}

	async parseTxn(sig, status, ts, err) {
		let txn = await umi.rpc.getTransaction(base58.decode(sig));
		writeFileSync('./txns/' + sig + '.json', stringify2(txn, true));
		let ours = false;

		for (let i = 0; i < txn.message.header.numRequiredSignatures; i++) {
			let account = txn.message.accounts[i];

			if (Object.values(addresses).includes(account)) {
				ours = true;
				break;
			}
		}
		if (!ours) return null;
		let mint = null;
		let tokenId = null;
		for (let i = 0; i < txn.message.accounts.length; i++) {
			let account = txn.message.accounts[i];
			if (this.cubsByMint[account]) {
				mint = account;
				tokenId = this.cubsByMint[account].eth_token_id;
			}
		}
		if (mint == null) return;


		let owner = txn.message.accounts[0];
		if (owner == addresses['payer']) {
			for (let item of txn.meta.postTokenBalances) {
				if (item.mint == mint) {
					owner = item.owner;
				}
			}
		}

		if (mint == null) return null;
		let logs = txn.meta.logs;
		let types = [];
		for (let log of logs) {
			if (log == 'Program log: Instruction: MintTo' || log == 'Program log: IX: Create') {
				if (!types.includes('mint')) types.push('mint');
			}

			if (log == 'Program log: IX: Lock') {
				types.push('stake');
			}
			if (log == 'Program log: IX: Unlock') {
				types.push('unstake');
			}
		}
		if (types.length != 1) {
			console.log(logs);
			return null;
		}

		const hash = sha256(Buffer.from(txn.serializedMessage).toString('base64')).toString('hex');
		if (this.txnsByMessage[hash] != null) {

			let q = `UPDATE sol_txn SET ${querify({
				ts,
				signature: sig,
				txn: stringify(txn, true),
				sender: owner,
				msg_hash: hash,
				mint,
				eth_token_id: tokenId,
				status,
				action: types[0],
				error: err
			})} WHERE msg_hash=${db.escape(hash)}`;


			await this.addQuery(q);
		} else {
			let q = `INSERT INTO sol_txn SET ${querify({
				ts,
				signature: sig,
				txn: stringify(txn, true),
				sender: owner,
				msg_hash: hash,
				mint,
				eth_token_id: tokenId,
				status,
				action: types[0],
				error: err
			})}`;
			await this.addQuery(q);
		}

	}

	queries = [];
	async addQuery(q) {
		this.queries.push(q);
		if (this.queries.length >= 20) {
			await this.checkQueries();
		}
	}
	querying = false;
	async checkQueries() {
		if (this.queries.length == 0) return;
		if (this.querying) return;
		this.querying = true;
		console.log(this.queries.length);
		await db.transaction(this.queries);
		this.queries.length = 0;
		this.querying = false;

	}
	currentHighest = {};
	async getSignaturesFor(who) {
		console.log('getting for', who);

		let ret = [];
		let prev = null;
		let prevHighest = this.currentHighest[who];
		let cnt = 0;
		while (true) {
			const requestConfig = {
				'limit': 1000,
			};
			if (prev != null) {
				requestConfig.before = prev.signature;
			}

			let res = await fetch(config.sol.rpc_private, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					'jsonrpc': '2.0',
					'id': 1,
					'method': 'getSignaturesForAddress',
					'params': [
						who,
						requestConfig
					]
				})
			});
			let signatures = await res.json();
			console.log(cnt, requestConfig.before, signatures.result.length);
			if (signatures.result == null) return ret;

			ret = [...ret, ...signatures.result.map(item => ({ signature: item.signature, status: item.confirmationStatus, ts: item.blockTime, err: item.err == null ? '' : stringify(item.err) }))].flat();
			let ended = false;
			if (signatures.result.length == 0 || signatures.length < 1000) ended = true;
			for (let sig of signatures.result) {
				if (prevHighest == null || sig.blockTime > prevHighest.ts) {
					prevHighest = { ts: sig.blockTime, signature: sig.signature };
				}
				if (this.currentHighest[who] != null && sig.blockTime < this.currentHighest[who].ts) {
					ended = true;
				}
				if (prev == null || sig.blockTime < prev.ts) {
					prev = { ts: sig.blockTime, signature: sig.signature };
				}
			}
			cnt++;
			await new Promise(r => setTimeout(r, 100));
			if (ended) break;
		}
		console.log(this.currentHighest[who], prevHighest);
		this.currentHighest[who] = prevHighest;
		return ret;
	}
}
