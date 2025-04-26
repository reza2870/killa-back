import { querify } from "../../lib/functions/querify.js";
import { addresses, db } from "../globals.js";
import { AssetChecker } from "./asset-checker.js";


export class CubStateTracker {

	constructor() {

	}

	async checkTxns(txns) {
		let cubs = Object.keys(txns);
		let queries = [];
		for (let eth_id in txns) {
			let cubTxns = txns[eth_id];
			queries = [...queries, ...await this.processCub(eth_id, cubTxns)];
		}
		console.log(queries.length);
		await db.transaction(queries);
		process.exit();
	}

	async processCub(eth_id, txns) {
		let queries = [];
		for (let txn of txns) {
			let q = this.processTxn(eth_id, txn);
			queries.push(q);
		}
		return queries;
	}

	processTxn(eth_id, txn) {
		console.log(eth_id, txn.action, txn.ts, txn.mint);
		return /* mysql */ `INSERT INTO sol_token_event SET ${querify({
			ts: txn.ts,
			event_type: txn.action,
			project_id: 19,
			eth_token_id: eth_id,
			mint: txn.mint,
			eth_txn_identifier: '',
			sol_txn_signature: txn.signature,
			data: JSON.stringify(this.getEventData(eth_id, txn)),
			sol_wallet: txn.sender,
			eth_wallet: txn.eth_wallet
		})}`;

	}

	getEventData(eth_id, txn) {
		switch (txn.action) {
		}

		return {};
	}
}