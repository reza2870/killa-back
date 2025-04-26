import { processChunks } from "../../lib/functions/processChunks.js";
import { config } from "../globals.js";



export class AssetChecker {
	static async checkAssets(mints, delay = 1000) {
		let results = {};
		await processChunks(mints, 1000, async (mints) => await this.fetchData(mints, results, delay));
		return results;
	}
	static async fetchData(mints, results, delay = 1000) {
		const url = config.sol.rpc_private;
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
					ids: mints
				},
			}),
		};
		console.log('Fetching', mints.length);
		const response = await fetch(url, data);
		const { result } = await response.json();

		for (let asset of result) {
			if (asset == null) continue;
			results[asset.id] = asset;
		}
		await new Promise(r => setTimeout(r, delay));

	}
}
