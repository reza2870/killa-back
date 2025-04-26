import { db } from "../globals.js";
import { AssetChecker } from "./asset-checker.js";
import { querify } from "../../lib/functions/querify.js";


export class TokenChecker {
	static async checkTokens() {
		let rows = await db.query(`SELECT * FROM sol_token_v2 WHERE latest_event_type != '' AND latest_event_type != 'reverse' AND last_fetched < UNIX_TIMESTAMP() - 120 ORDER BY last_fetched ASC LIMIT 500`);
		let tokensByMint = {};
		let mints = new Set();
		for (let row of rows) {
			tokensByMint[row.mint] = row;
			mints.add(row.mint);
		}
		let queries = [];
		let results = await AssetChecker.checkAssets(mints, 0);
		for (let mint in results) {
			let asset = results[mint];
			let token = tokensByMint[mint];
			let updates = {
				owner: asset.ownership.owner,
				staking_delegate: asset.ownership.delegate ?? '',
				last_fetched: Math.floor(Date.now() / 1000)
			};
			let q = `UPDATE sol_token_v2 SET ${querify(updates)} WHERE id = ${token.id}`;
			queries.push(q);
		}
		await db.transaction(queries);
	}
}
