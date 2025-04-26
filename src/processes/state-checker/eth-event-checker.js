import { querify } from "../../lib/functions/querify.js";
import { db, mode } from "../globals.js";
import { recursiveHash } from "../../lib/functions/sha256.js";
import { Keypair } from "@solana/web3.js";
import { cubAddresses } from "./state-checker.js";


export class EthEventChecker {
	static async checkEvents() {
		await this.checkProject(1, 'OGBridged', 'tokens');
		await this.checkProject(19, 'Bridged', 'cubs');
	}
	static async checkProject(projectId, eventName, tokenType) {
		let rows = await db.query(`SELECT eth.* FROM v3_eth_event eth LEFT JOIN sol_token_event e ON e.eth_txn_identifier = eth.identifier WHERE e.id IS NULL AND eth.name = '${eventName}' ORDER BY eth.ts`);
		let queries = [];
		for (let row of rows) {
			let args = JSON.parse(row.args);
			let ids = args[tokenType].map(item => parseInt(item.hex));
			let solWallet = args.solanaWallet;

			if (ids.length == 0) continue;
			for (let id of ids) {
				queries.push(this.getQuery(id, row, projectId, solWallet));
			}
		}
		await db.transaction(queries);
	}
	static getMintAddress(eth_id, project_id) {
		if (project_id == 19) return cubAddresses[eth_id];
		const key1 = 'VLoZDup8wq3VWHJY4gzatIiSAxxLCLu_9OLfnS5Hh0-' + mode;
		const key2 = eth_id;
		return Keypair.fromSeed(new Uint8Array(Buffer.from(recursiveHash(key1 + key2, 20), 'hex'))).publicKey.toString();
	}
	static getQuery(eth_id, txn, project_id, sol_wallet) {
		const mint = this.getMintAddress(eth_id, project_id);
		const eth_wallet = '';
		return /* mysql */ `INSERT INTO sol_token_event SET ${querify({
			ts: txn.ts,
			event_type: 'bridged',
			project_id: project_id,
			eth_token_id: eth_id,
			mint,
			eth_txn_identifier: txn.identifier,
			sol_txn_signature: null,
			data: JSON.stringify(this.getEventData(eth_id, mint, txn)),
			sol_wallet,
			eth_wallet
		})}`;
	}
	static getEventData(eth_id, txn) {
		switch (txn.action) {
		}

		return {};
	}
}
