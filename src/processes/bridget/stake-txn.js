import { nanoid } from "nanoid";
import { querify } from "../../lib/functions/querify.js";
import { addresses, config, cubstaker, db } from "../globals.js";
import { buildStake } from "./builders/buildStake.js";
import { TxnBatch, fakeSigner } from "./txn-batch.js";
import { TokenStandard, delegateStakingV1, lockV1 } from "@metaplex-foundation/mpl-token-metadata";

export class StakeTxn extends TxnBatch {
	type = 'stake';
	async _build() {
		const tokens = this.request.tokens;

		const rows = await db.query(`SELECT * FROM sol_token WHERE eth_token_id IN (${db.escape(tokens)}) AND staking_pending = 0 AND staked = 0`);

		let mints = {};
		let lookup = {};
		if (rows.length != tokens.length) throw new Error('Oops');
		for (let row of rows) {
			if (row.owner != this.request.owner) continue;
			mints[row.eth_token_id] = row.mint;
			lookup[row.eth_token_id] = row;
		}
		if (Object.keys(mints).length == 0) throw new Error('Oops');

		let ret = [];
		this.payer = this.request.owner;

		let staker = addresses[cubstaker];
		this.signers.push(cubstaker);

		let owner = this.request.owner;
		this.rows = [];
		for (let i = 0; i < tokens.length; i++) {
			let token = this.request.tokens[i];
			let blockhash = this.theirs[i].message.blockhash;
			const mint = mints[token];
			const row = lookup[token];

			this.rows.push(row);

			let addresses = { mint, payer: owner, owner, staker }

			let txn = await buildStake(this.umi, false, row.staking_delegate != staker, addresses, blockhash);



			ret.push(this.duplicate(txn));


		}
		this.txns = ret;
	}
	async beforeSubmit() {
		await super.beforeSubmit?.();
		let queries = [];
		const now = Math.floor(new Date().getTime() / 1000);
		for (let i = 0; i < this.request.tokens.length; i++) {
			let token = this.request.tokens[i];
			const row = this.rows.find(row => row.eth_token_id == token);
			let internalId = nanoid();
			if (row == null) continue;
			let q = `INSERT INTO sol_staking_event SET ${querify({
				ts: now,
				eth_token_id: token,
				mint: row.mint,
				action: 'stake',
				status: 'sending',
				internal_id: internalId,
				owner: this.request.owner,
				signature: '',
				txn_recent_blockhash: this.theirs[i].message.blockhash,
				batch_id: this.id

			})}`;
			queries.push(q);
			queries.push(`UPDATE sol_token SET ${querify({
				staking_pending: 1,
				staking_internal_id: internalId
			})} WHERE eth_token_id = ${db.escape(token)}`)
		}
		await db.transaction(queries);
	}

	async afterSubmit(results) {
		await super.afterSubmit?.(results);
		let queries = [];
		for (let i = 0; i < this.request.tokens.length; i++) {
			let token = this.request.tokens[i];
			const row = this.rows.find(row => row.eth_token_id == token);
			if (row == null) continue;
			let res = results[i];
			let status = res == '' || res == null ? 'error' : 'sent';
			let q = `UPDATE sol_staking_event SET ${querify({ status })} WHERE batch_id = ${db.escape(this.id)} AND eth_token_id = ${db.escape(token)} AND action = 'stake'`;
			queries.push(q);
			if (status == 'error') {
				let q = `UPDATE sol_token SET staking_pending = 0 WHERE eth_token_id = ${db.escape(token)}`;
				queries.push(q);
			}
		}
		await db.transaction(queries);
	}

}