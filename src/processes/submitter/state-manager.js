import { querify } from "../../lib/functions/querify.js";
import { addresses, db } from "../globals.js";

export class StateManager {
	constructor() {
		this.run(() => this.update(), 3000);
	}
	lastIndex = 0;
	txnsPerCub = {}
	txnsPerOg = {}
	async run(callback, rate) {
		while (true) {
			try { await callback(); }
			catch (e) {
				console.error(e);
			}
			await new Promise(r => setTimeout(r, rate));
		}
	}

	async update() {
		await db.transaction([`
			SET @max_update_index := COALESCE((SELECT MAX(update_index) FROM sol_txn), 0) + 1;
			UPDATE sol_txn SET update_index = (@max_update_index := @max_update_index + 1) WHERE update_index IS NULL AND status = 'finalized'
		`]);
		let check = new Set();
		let checkOgs = new Set();
		{
			let rows = await db.query(`SELECT * FROM sol_txn WHERE update_index > ${this.lastIndex} AND error = ''`);
			for (let row of rows) {
				this.lastIndex = Math.max(this.lastIndex, row['update_index']);
				if (row.action.endsWith('Ogs')) {
					this.txnsPerOg[row.eth_token_id] ??= [];
					this.txnsPerOg[row.eth_token_id].push(row);
					checkOgs.add(row.eth_token_id);
				} else {
					this.txnsPerCub[row.eth_token_id] ??= [];
					this.txnsPerCub[row.eth_token_id].push(row);
					check.add(row.eth_token_id);
				}
			}
		}
		if (check.size > 0) {
			let rows = await db.query(`SELECT * FROM sol_token WHERE eth_token_id IN (${db.escapeList([...check])})`);
			let queries = [];
			for (let row of rows) queries = [...queries, ...await this.checkCub(row)];
			if (queries.length > 0) {
				await db.transaction(queries);
			}
		}

		if (checkOgs.size > 0) {
			let rows = await db.query(`SELECT * FROM sol_og_token WHERE eth_token_id IN (${db.escapeList([...checkOgs])})`);
			let queries = [];
			for (let row of rows) queries = [...queries, ...await this.checkOg(row)];
			if (queries.length > 0) {

				await db.transaction(queries);
			}
		}

	}
	async checkCub(cub) {
		let txns = this.txnsPerCub[cub.eth_token_id];

		txns = txns.sort((a, b) => a.ts - b.ts);
		let updates = {};
		for (let txn of txns) {
			let ts = parseInt(txn.ts);
			let action = txn.action;
			if (action == 'mint') {
				updates.can_be_minted_by = '';
				updates.has_been_minted = 1;
				if (cub.can_be_minted_by != '' || cub.has_been_minted != 1) {
					updates.owner = txn.sender;
				}
			}
			if (action == 'stake') {
				updates.can_be_recovered_by = '';
				updates.staked = 1;
				updates.stake_ts = ts;
				updates.locked = 1;
			}
			if (action == 'unstake') {
				updates.can_be_recovered_by = '';
				updates.staked = 0;
				updates.stake_ts = 0;
				updates.locked = 0;
			}

			if (action == 'reverse' || action == 'reverseCubs') {
				updates.owner = addresses.lockdown;
				updates.can_be_recovered_by = '';
			}

			if (action == 'recovery') {
				updates.can_be_recovered_by = '';
				if (cub.can_be_recovered_by != '') {
					updates.owner = txn.sender;
				}
			}



		}
		for (let [key, val] of Object.entries(updates)) {
			if (cub[key] == val) {
				delete updates[key];
				continue;
			}
		}
		if (Object.keys(updates) == 0) return [];
		if (updates.stake_ts != cub.stake_ts) {
			//console.log('new', updates.stake_ts, 'was', cub.stake_ts, updates.stake_ts - cub.stake_ts);
		}
		//console.log(cub.eth_token_id, updates, cub.stake_ts);
		//return [];
		return [
			`UPDATE sol_token SET ${querify(updates)} WHERE id = ${db.escape(cub.id)}`
		];

	}

	async checkOg(og) {
		//console.log(og);
		let txns = this.txnsPerOg[og.eth_token_id];

		txns = txns.sort((a, b) => a.ts - b.ts);
		let updates = {};
		for (let txn of txns) {
			let ts = parseInt(txn.ts);
			let action = txn.action;
			if (action == 'mintOgs') {
				updates.can_be_minted_by = '';
				updates.has_been_minted = 1;
				if (og.can_be_minted_by != '' || og.has_been_minted != 1) updates.owner = txn.sender;
			}
			if (action == 'stakeOgs') {
				updates.staked = 1;
				updates.stake_ts = ts;
				updates.locked = 1;
				updates.can_be_recovered_by = '';
			}
			if (action == 'unstakeOgs') {
				updates.staked = 0;
				updates.stake_ts = 0;
				updates.locked = 0;
				updates.can_be_recovered_by = '';
			}
			if (action == 'reverseOgs') {
				updates.owner = addresses.lockdown;
				updates.can_be_recovered_by = '';
			}
			if (action == 'recoveryOgs') {
				updates.can_be_recovered_by = '';
				if (og.can_be_recovered_by != '') updates.owner = txn.sender;
			}


		}
		for (let [key, val] of Object.entries(updates)) {
			if (og[key] == val) {
				delete updates[key];
				continue;
			}
		}
		if (Object.keys(updates) == 0) return [];
		if (updates.stake_ts != og.stake_ts) {
			//console.log('new', updates.stake_ts, 'was', og.stake_ts, updates.stake_ts - og.stake_ts);
		}
		//console.log(og.eth_token_id, updates, og.stake_ts);
		//return [];
		return [
			`UPDATE sol_og_token SET ${querify(updates)} WHERE id = ${db.escape(og.id)}`
		];

	}
}