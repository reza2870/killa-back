import { fetchAllDigitalAsset } from "@metaplex-foundation/mpl-token-metadata";
import { addresses, config, db } from "../globals.js";
import { processChunks } from "../../lib/functions/processChunks.js";
import { querify } from "../../lib/functions/querify.js";
import { getUmi } from "../../lib/functions/getUmi.js";
import { stringify } from "../../lib/functions/stringify.js";
import { writeFileSync } from "fs";

const url = config.sol.rpc_private;
const umi = getUmi();
export class SolIndexer {
	constructor() {
		this.run(() => this.updateCubAssets(), 5000);
		this.run(() => this.updateOgAssets(), 5000);
		//this.run(() => this.checkVerifications(), 10000);
	}

	async run(callback, rate) {
		while (true) {
			try { await callback(); }
			catch (e) { console.error(e); }
			await new Promise(r => setTimeout(r, rate));
		}
	}



	async updateCubAssets() {
		let rows = await db.query(`SELECT * FROM sol_token`);
		await processChunks(rows, 1000, async (rows) => await this.processCubAssets(rows));
	}

	async updateOgAssets() {
		let rows = await db.query(`SELECT * FROM sol_og_token`);
		await processChunks(rows, 1000, async (rows) => await this.processOgAssets(rows));
	}

	async processCubAssets(rows) {
		let lookup = {};
		for (let row of rows) lookup[row.mint] = row;
		const data = {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 'my-id',
				method: 'getAssetBatch',
				params: {
					ids: rows.map(item => item.mint)
				},
			}),
		};
		const response = await fetch(url, data);
		const { result } = await response.json();
		let queries = [];

		for (let i = 0; i < result.length; i++) {
			let asset = result[i];
			if (asset == null) continue;
			let row = lookup[asset.id];
			//writeFileSync('temp/asset-data-' + row.eth_token_id + '.json', stringify(asset, true));
			let owner = asset.ownership.owner;
			let delegate = asset.ownership.delegate ?? '';

			let updates = {};
			if (row.has_been_minted == 0) {
				updates.has_been_minted = 1;
				updates.can_be_minted_by = '';
			}
			if (row.can_be_recoverred_by != '') {
				if (owner != addresses.lockdown) {
					//console.log('');
					//console.log('resetting recovery', row.eth_token_id);
					//console.log('');
					//updates.can_be_recovered_by = '';
				}
			}
			if (row.owner != owner) updates.owner = owner;
			if (row.staking_delegate != delegate) updates.staking_delegate = delegate;

			if (Object.keys(updates).length > 0) {
				queries.push(`UPDATE sol_token SET ${querify(updates)} WHERE id = ${row.id}`);
			}

		}
		await db.transaction(queries);
		await new Promise(r => setTimeout(r, 4000));

	}

	async processOgAssets(rows) {
		let lookup = {};
		for (let row of rows) lookup[row.mint] = row;
		const data = {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 'my-id',
				method: 'getAssetBatch',
				params: {
					ids: rows.map(item => item.mint)
				},
			}),
		};
		const response = await fetch(url, data);
		const { result } = await response.json();
		let queries = [];

		for (let i = 0; i < result.length; i++) {
			let asset = result[i];
			if (asset == null) continue;
			let row = lookup[asset.id];
			//writeFileSync('temp/asset-data-' + row.eth_token_id + '.json', stringify(asset, true));
			let owner = asset.ownership.owner;
			let delegate = asset.ownership.delegate ?? '';

			let updates = {};
			if (row.has_been_minted == 0) {
				updates.has_been_minted = 1;
				updates.can_be_minted_by = '';
			}
			if (row.can_be_recoverred_by != '') {
				if (owner != addresses.lockdown) {
					updates.can_be_recovered_by = '';
				}
			}
			if (row.owner != owner) updates.owner = owner;
			if (row.staking_delegate != delegate) updates.staking_delegate = delegate;

			if (Object.keys(updates).length > 0) {
				queries.push(`UPDATE sol_og_token SET ${querify(updates)} WHERE id = ${row.id}`);
			}

		}
		await db.transaction(queries);
		await new Promise(r => setTimeout(r, 4000));

	}


}
