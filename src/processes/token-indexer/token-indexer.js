import { fetchDigitalAssetWithTokenByMint } from '@metaplex-foundation/mpl-token-metadata';
import { db } from "../globals.js";
import { processChunks } from "../../lib/functions/processChunks.js";
import { getUmi } from "../../lib/functions/getUmi.js";
import { querify } from '../../lib/functions/querify.js';


const umi = getUmi();
export class TokenIndexer {
	constructor() {
		this.run(() => this.updateAssets(false), 5000);
		this.run(() => this.updateAssets(true), 15000);
	}

	async run(callback, rate) {
		while (true) {
			try { await callback(); }
			catch (e) { console.error(e); }
			await new Promise(r => setTimeout(r, rate));
		}
	}



	async updateAssets(all = false) {
		if (all) {
			{
				let rows = await db.query(`SELECT * FROM sol_og_token WHERE has_been_minted = 1 ORDER BY rand() DESC LIMIT 100`);
				await processChunks(rows, 10, async (rows) => await this.processAssets(rows, all, 'ogs'));
			}
			let rows = await db.query(`SELECT * FROM sol_token WHERE has_been_minted = 1 ORDER BY rand() DESC LIMIT 100`);
			await processChunks(rows, 10, async (rows) => await this.processAssets(rows, all, 'cubs'));
		} else {
			{
				let rows = await db.query(`SELECT * FROM sol_og_token WHERE has_been_minted = 1 AND token_record_pub_key = '' ORDER BY id DESC`);
				await processChunks(rows, 10, async (rows) => await this.processAssets(rows, all, 'ogs'));
			}

			let rows = await db.query(`SELECT * FROM sol_token WHERE has_been_minted = 1 AND token_record_pub_key = '' ORDER BY id DESC`);
			await processChunks(rows, 10, async (rows) => await this.processAssets(rows, all, 'cubs'));
		}

	}

	async processAssets(rows, all, collection) {
		let queries = [];
		console.log(rows.length, all, collection)
		let table = collection == 'cubs' ? 'sol_token' : 'sol_og_token';
		for (let row of rows) {
			try {


				let res = await fetchDigitalAssetWithTokenByMint(umi, row.mint);

				if (row.token_pub_key != res.token.publicKey || row.token_record_pub_key != res.tokenRecord.publicKey) {
					queries.push(`UPDATE ${table} SET ${querify({
						token_pub_key: res.token.publicKey,
						token_record_pub_key: res.tokenRecord.publicKey,
					})} WHERE id = ${row.id}`);
				}
				await new Promise(r => setTimeout(r, all ? 1000 : 200));

			} catch (e) {
				console.log('token indexer error: ' + row.mint);
			}
			await new Promise(r => setTimeout(r, 500));
		}


		await db.transaction(queries);
		await new Promise(r => setTimeout(r, 1000));

	}


}
