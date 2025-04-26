import { config, db } from "../globals.js";
import { ethers } from "ethers";


export class EthBridgeConfirmer {
	static getChainID(network) { switch (network) { case 'homestead': return 1; case 'ropsten': return 3; case 'rinkeby': return 4; case 'goerli': return 5; case 'sepolia': return 11155111; } }
	static {
		this.provider = new ethers.providers.JsonRpcProvider(config.eth.rpc_private, this.getChainID(config.eth.network));
	}
	static async confirmEvents() {
		let rows = await db.query(`
			SELECT
				e1.*,
				(
					SELECT
						id AS last_id
					FROM
						sol_token_event e2
					WHERE
						e2.mint = e1.mint
					ORDER BY
						e2.ts DESC
					LIMIT 1
				) AS last_id
			FROM
				sol_token_event e1
			WHERE
				e1.event_type = 'bridged' AND
				e1.confirmed = 0
			LIMIT 500
		`);
		let idsByHash = {};
		let confirmedIs = new Set();
		for (let row of rows) {
			if (row.id != row.last_id) {
				confirmedIs.add(row.id);
				if (confirmedIs.size >= 20) this.commitConfirmationQueue(confirmedIs, 100);
				continue;
			}
			let hash = row.eth_txn_identifier.split('-')[1];
			idsByHash[hash] ??= [];
			idsByHash[hash].push(row.id);
		}
		for (let hash in idsByHash) {
			let ids = idsByHash[hash];
			console.log('Checking', hash, ids.join(', '));
			try {
				let txn = await this.provider.getTransaction(hash);
				if (txn == null) continue;
				if (txn.confirmations < 4) continue;
				for (let id of ids) {
					confirmedIs.add(id);
					this.commitConfirmationQueue(confirmedIs, 100);
				}
			} catch (e) {
				console.log(e);
			}
		}
		this.commitConfirmationQueue(confirmedIs);

	}
	static async commitConfirmationQueue(ids, limit = 1) {
		if (ids.size >= limit) {
			await db.query(`UPDATE sol_token_event SET confirmed = 1 WHERE id IN (${[...ids].join(',')})`);
			ids.clear();
		}
	}
}
