import { querify } from "../../lib/functions/querify.js";
import { db } from "../globals.js";

export class ActionChecker {
	static async checkActions() {
		let rows = await db.query(`SELECT t.* FROM sol_txn t LEFT JOIN sol_token_event e ON e.sol_txn_signature = t.signature WHERE status = 'finalized' AND isnull(e.id) ORDER BY t.eth_token_id, t.ts LIMIT 500`);
		let cubTxns = {};
		let ogTxns = {};
		for (let row of rows) {
			if (row.action.endsWith('Ogs')) {
				row.action = row.action.replace('Ogs', '');
				ogTxns[row.eth_token_id] ??= [];
				ogTxns[row.eth_token_id].push(row);
			} else {
				cubTxns[row.eth_token_id] ??= [];
				cubTxns[row.eth_token_id].push(row);
			}
		}
		let queries = [
			...await this.checkTxns(cubTxns, 19),
			...await this.checkTxns(ogTxns, 1)
		];
		if (queries.length > 0) {
			await db.query(queries.join(';'));
		}
	}
	static async checkTxns(txns, project_id) {
		//let tokens = Object.keys(txns);
		let queries = [];
		for (let eth_id in txns) {
			queries = [...queries, ...await this.processTokenTxns(eth_id, txns[eth_id], project_id)];
		}
		return queries;
	}

	static async processTokenTxns(eth_id, txns, project_id) {
		return txns.map(txn => this.processTxn(eth_id, txn, project_id));
	}

	static processTxn(eth_id, txn, project_id) {
		return /* mysql */ `INSERT INTO sol_token_event SET ${querify({
			ts: txn.ts,
			event_type: txn.action,
			project_id: project_id,
			eth_token_id: eth_id,
			mint: txn.mint,
			eth_txn_identifier: null,
			sol_txn_signature: txn.signature,
			data: JSON.stringify(this.getEventData(eth_id, txn)),
			sol_wallet: txn.sender,
			eth_wallet: txn.eth_wallet
		})}`;

	}

	static getEventData(eth_id, txn) {
		switch (txn.action) {
		}

		return {};
	}
}