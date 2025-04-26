import { querify } from "../../lib/functions/querify.js";
import { db, mode } from "../globals.js";
import { readFileSync } from "fs";
import { recursiveHash } from "../../lib/functions/sha256.js";

let addresses = JSON.parse(readFileSync(`../config/${mode}/cub-mint-addresses.json`).toString());
let signers = JSON.parse(readFileSync(`../config/${mode}/cub-mint-enc.json`).toString());
let partial1 = readFileSync(`../config/${mode}/cub-mint-partial1.txt`).toString()

export class BridgingChecker {
	constructor() {
		this.run();
		//this.test();
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
		while (true) {
			try {
				await this.checkCubs();
				await this.checkOGs();
			} catch (e) {
				console.error(e);
			}
			await new Promise(r => setTimeout(r, 5000));
		}
	}

	

	async checkCubs() {
		let rows = await db.query(`SELECT * FROM v3_eth_event WHERE name = 'Bridged' AND handled = 0`);
		let queries = [];
		for (let row of rows) {


			let args = JSON.parse(row.args);
			let ids = args.cubs.map(item => parseInt(item.hex));
			let solWallet = args.solanaWallet;

			if(ids.length == 0) continue;

			let ethWallet = (await db.query(`SELECT * FROM token WHERE token_id = ${ids[0]} AND project_id = 19`))[0].prev_owner;
			let mintAddresses = ids.map(id => addresses[id]);
			let mintSecrets = ids.map(id => signers[addresses[id]]);
			let partials1 = mintAddresses.map(addr => recursiveHash([partial1, addr], 2));


			queries.push(`UPDATE v3_eth_event SET handled = 1 WHERE id = ${row.id}`);
			queries.push(`INSERT INTO sol_bridge_event SET ${querify({
				txn: row.identifier,
				eth_wallet: ethWallet,
				sol_wallet: solWallet,
				cubs: JSON.stringify(ids),
				mint_addresses: JSON.stringify(mintAddresses),
				mint_signers: JSON.stringify(mintSecrets),
				partials_1: JSON.stringify(partials1),
				status: 'uploading'
			})}`)

		}
		await db.transaction(queries);
	}

	async checkOGs() {
		let rows = await db.query(`SELECT * FROM v3_eth_event WHERE name = 'OGBridged' AND handled = 0`);
		let queries = [];
		for (let row of rows) {


			let args = JSON.parse(row.args);
			let ids = args.tokens.map(item => parseInt(item.hex));
			let solWallet = args.solanaWallet;

			if(ids.length == 0) continue;

			let ethWallet = (await db.query(`SELECT * FROM token WHERE token_id = ${ids[0]} AND project_id = 1`))[0].prev_owner;
			
			


			queries.push(`UPDATE v3_eth_event SET handled = 1 WHERE id = ${row.id}`);
			queries.push(`INSERT INTO sol_og_bridge_event SET ${querify({
				txn: row.identifier,
				eth_wallet: ethWallet,
				sol_wallet: solWallet,
				bears: JSON.stringify(ids),
				status: 'verifying'
			})}`)

		}
		await db.transaction(queries);
	}



}