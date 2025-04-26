import { db, web3conn } from "../globals.js";
import { getUmi } from "../../lib/functions/getUmi.js";
import { querify } from '../../lib/functions/querify.js';
import base58 from 'bs58';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { stringify2 } from '../../lib/functions/stringify.js';
import { TaskManager } from '../../lib/classes/task-manager.js';
import { nanoid } from "nanoid";

const umi = getUmi();
let tasks = new TaskManager(2);

export class Submitter {
	queue = [];
	blockheight = 0;
	blockheightCounter = 0;
	txnCounters = {};
	//checkSignatures = {};
	constructor() {
		this.run(() => this.updateQueue(), 2500);
		this.run(() => this.updateBlockheight(), 2000);
		this.run(() => this.processQueue(), 1000);
		//this.run(() => this.checkStatusses(), 3000);
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
	async updateQueue() {
		let rows = await db.query(`SELECT * FROM sol_txn WHERE status = 'signed'`);
		this.queue = rows;
	}

	async processQueue() {

		for (let row of this.queue) {
			if (this.processing[row.id]) continue;
			this.processing[row.id] = true;

			this.processRow(row).finally(() => this.processing[row.id] = false);
			await new Promise(r => setTimeout(r, 50));
		}
		//if (this.queue.length > 0 && this.blockheight != 0) await new Promise(r => setTimeout(r, 100000)); // REMOVE
	}

	processing = {};
	async processRow(row) {


		let txn = umi.transactions.deserialize(base58.decode(row.serialized_message));
		let index = txn.message.accounts.indexOf(row.sender);
		txn.signatures[index] = base58.decode(row.user_sig);

		await this.submit(row, txn);
	}

	async checkStatus(row, txn) {

		this.txnCounters[row.id] ??= 0;
		this.txnCounters[row.id]++;
		let lastValid = parseInt(row.last_valid_blockheight);
		if (lastValid + 20 < this.blockheight) {
			if (this.txnCounters[row.id]++ % 5 != 0) return;

		} else {
			if (this.txnCounters[row.id]++ % 10 != 1) return;

		}


		try {
			if (row.signature == null || row.signature == '') {
				let sig = await tasks.addTask(async () => {
					let ret = await umi.rpc.sendTransaction(txn, { skipPreflight: true, maxRetries: 0 });
					await new Promise(r => setTimeout(r, 100));
					return ret;
				});

				await db.query(`UPDATE sol_txn SET signature = ${db.escape(base58.encode(sig))} WHERE status = 'signed' AND id = ${db.escape(row.id)}`);
				row.signature = base58.encode(sig);
			}
			let result = await tasks.addTask(async () => {
				let ret = await web3conn.getTransaction(row.signature, { commitment: "finalized", maxSupportedTransactionVersion: 0 });
				await new Promise(r => setTimeout(r, 100));

				return ret;
			});

			if (result == null || result.meta == null) {
				if (lastValid + 100 < this.blockheight) {
					await this.expire(row);
				}
				return;
			}

			if (result.meta.err != null) {
				console.log('Error for', row.signature);
				console.log(result.meta);

				let q = `UPDATE sol_txn SET ${querify({
					ts: result.blockTime,
					txn: stringify2(result.transaction, true),
					status: 'error',
					meta: stringify2(result.meta, true),
					error: stringify2(result.meta.err),
					logs: stringify2(result.meta.logMessages)
				})} WHERE id=${row.id}`;
				row.status = 'error';
				await db.query(q);
				return;
			}

			let queries = [
				`UPDATE sol_txn SET ${querify({
					ts: result.blockTime,
					txn: stringify2(result.transaction, true),
					status: 'finalized',
					meta: stringify2(result.meta, true)
				})} WHERE id=${row.id}`,
			];
			row.status = 'finalized';
			await db.transaction(queries);

		} catch (e) {
			console.error(e);
		}
	}

	async expire(row) {
		this.queue = this.queue.filter(item => item.id != row.id);
		await db.query(`UPDATE sol_txn SET status = 'expired' WHERE status = 'signed' AND id = ${db.escape(row.id)}`);
		this.queue = this.queue.filter(item => item.id != row.id);
	}

	async error(row, logs) {
		this.queue = this.queue.filter(item => item.id != row.id);
		let q = `UPDATE sol_txn SET status = 'error', logs=${db.escape(stringify2(logs, true))} WHERE status = 'signed' AND id = ${db.escape(row.id)}`;
		await db.query(q);
		this.queue = this.queue.filter(item => item.id != row.id);
	}

	async submit(row, txn) {


		let skipPreflight = row.signature != '' && row.signature != null;
		let sig = row.signature == '' ? null : row.signature;
		try {
			sig = await umi.rpc.sendTransaction(txn, { skipPreflight, maxRetries: 0 });
		} catch (e) {
			let errorLogs = e.logs;
			console.error(e);
			console.log(errorLogs);
			if (!existsSync('./txn-errors')) mkdirSync('./txn-errors');
			writeFileSync('./txn-errors/' + nanoid() + '.txt', e.toString());

			if (errorLogs != null && errorLogs.length > 0) {
				await this.error(row, errorLogs);
				return;
			}
		}
		if (sig == null) {
			sig = await umi.rpc.sendTransaction(txn, { skipPreflight: true, maxRetries: 0 });
			await db.query(`UPDATE sol_txn SET signature = ${db.escape(base58.encode(sig))} WHERE status = 'signed' AND id = ${db.escape(row.id)}`);
			row.signature = base58.encode(sig);
		}

		await this.checkStatus(row, txn);
		await new Promise(r => setTimeout(r, 500));

	}
	async updateBlockheight() {
		if (this.queue.length == 0 && this.blockheightCounter++ % 30 != 0) return;
		let blockheight = await web3conn.getBlockHeight({ commitment: 'finalized' });;
		this.blockheight = blockheight;
	}
}