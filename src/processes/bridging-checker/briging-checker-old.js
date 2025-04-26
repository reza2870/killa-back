import { generateSigner } from "@metaplex-foundation/umi";
import { getUmi } from "../../lib/functions/getUmi.js";
import { db } from "../globals.js";

export class BridgingChecker {
	constructor() {
		this.run();
	}
	buildQuery(o) {
		let ret = [];
		for (let key in o) {
			let val = o[key];
			ret.push(`${db.escapeId(key)}=${db.escape(val)}`);
		}
		return ret.join(',');
	}
	async run() {
		let umi = getUmi();
		this.lastId = 0;
		while (true) {
			try {
				await this.check(umi);
			} catch (e) {
				console.error(e);
			}
			await new Promise(r => setTimeout(r, 5000));
		}
	}



	async check(umi) {
		let rows = await db.query(`SELECT * FROM v3_eth_event WHERE name = 'Bridged' AND id > ${this.lastId} AND handled = 0 ORDER BY id`);
		let queries = [];
		for (let row of rows) {


			let args = JSON.parse(row.args);
			let ids = args.cubs.map(item => parseInt(item.hex));
			let wallet = args.solanaWallet;
			queries.push(`UPDATE v3_eth_event SET handled = 1 WHERE id = ${row.id}`);
			for (let id of ids) {

				let sol_cub = await db.query(`SELECT * FROM sol_token WHERE eth_token_id = ${id} AND project_id = ${row.project_id}`)[0];

				if (sol_cub == null) {
					let mint = generateSigner(umi);
					let mint_secret = JSON.stringify([...mint.secretKey]);
					mint = mint.publicKey;
					queries.push(`INSERT INTO sol_token SET ${this.buildQuery({
						project_id: row.project_id,
						mint,
						mint_secret,
						eth_token_id: id,
						staked: 0,
						stake_ts: 0,
						stake_time: 0,
						has_been_minted: 0,
						can_be_minted_by: wallet,
						can_be_recovered_by: ''
					})}`);
				} else {
					queries.push(`UPDATE sol_token SET ${this.buildQuery({
						staked: 0,
						stake_ts: 0,
						stake_time: 0,
						can_be_minted_by: '',
						can_be_recovered_by: 'wallet'
					})} WHERE id = ${sol_cub.id}`);
				}
			}

			this.lastId = row.id;
		}
		await db.transaction(queries);
	}



}