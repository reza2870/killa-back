import { db, mode } from "../globals.js";
import { readFileSync } from "fs";
import { } from "ethers";
import { TaskManager } from "../../lib/classes/task-manager.js";
import { recursiveHash } from "../../lib/functions/sha256.js";
import { querify } from "../../lib/functions/querify.js";
import { Keypair } from "@solana/web3.js";

let partial2 = readFileSync(`../config/${mode}/cub-mint-partial2.txt`).toString()
export class BridgingVerifyer {
	constructor() {
		this.tasks = new TaskManager(10);
		this.run();
	}
	async run() {
		this.lastId = 0;
		while (true) {
			try {
				await this.checkCubs();
				await this.checkOgs();
			} catch (e) {
				console.error(e);
			}
			await new Promise(r => setTimeout(r, 6000));
		}
	}


	async checkCubs() {
		let rows = await db.query(`SELECT * FROM sol_bridge_event WHERE status = 'verifying'`);
		await Promise.all(rows.map(async row => {
			this.tasks.addTask(async () => {
				let queries = [];
				let tokens = JSON.parse(row.cubs);
				let mintAddresses = JSON.parse(row.mint_addresses)

				let partials1 = JSON.parse(row.partials_1);
				let signers = JSON.parse(row.mint_signers);
				let urls = JSON.parse(row.meta_links);

				for (let i = 0; i < tokens.length; i++) {
					let rows = await db.query(`SELECT * FROM sol_token WHERE eth_token_id = ${db.escape(tokens[i])} AND has_been_minted = 1`);
					if (rows.length > 0) {
						let current = rows[0];
						queries.push(`UPDATE sol_token SET ${querify({
							can_be_recovered_by: row.sol_wallet,
						})}  WHERE id = ${db.escape(current.id)}`);
						continue;
					}
					queries.push(`INSERT INTO sol_token SET ${querify({
						project_id: 19,
						mint: mintAddresses[i],
						mint_secret_partial1: partials1[i],
						mint_secret_partial2: recursiveHash([partials1[i], partial2, mintAddresses[i]], 2),
						mint_secret_enc: signers[i],
						eth_token_id: tokens[i],
						staked: 0,
						stake_ts: 0,
						stake_time: 0,
						has_been_minted: 0,
						can_be_minted_by: row.sol_wallet,
						can_be_recovered_by: '',
						metadata_url: urls[i]
					})}`);
					//console.log(q);
					//await db.query(q);
				}
				queries.push(`UPDATE sol_bridge_event SET status = 'completed' WHERE id = ${db.escape(row.id)}`)
				await db.transaction(queries);
			})
		}))

	}

	async checkOgs() {
		let rows = await db.query(`SELECT * FROM sol_og_bridge_event WHERE status = 'verifying'`);
		await Promise.all(rows.map(async row => {
			this.tasks.addTask(async () => {
				let queries = [];
				let tokens = JSON.parse(row.bears);

				for (let i = 0; i < tokens.length; i++) {
					let rows = await db.query(`SELECT * FROM sol_og_token WHERE eth_token_id = ${db.escape(tokens[i])} AND has_been_minted = 1`);
					if (rows.length > 0) {
						let current = rows[0];
						queries.push(`UPDATE sol_og_token SET ${querify({
							can_be_recovered_by: row.sol_wallet,
						})}  WHERE id = ${db.escape(current.id)}`);
						continue;
					}
					const key1 = 'VLoZDup8wq3VWHJY4gzatIiSAxxLCLu_9OLfnS5Hh0-' + mode;
					const key2 = tokens[i];

					let mint = Keypair.fromSeed(new Uint8Array(Buffer.from(recursiveHash(key1 + key2, 20), 'hex'))).publicKey.toString();
					let metadata_url = 'https://tokens.killabears.com/killabears/solana/' + tokens[i];






					queries.push(`INSERT INTO sol_og_token SET ${querify({
						project_id: 1,
						mint,
						eth_token_id: tokens[i],
						staked: 0,
						stake_ts: 0,
						stake_time: 0,
						has_been_minted: 0,
						can_be_minted_by: row.sol_wallet,
						can_be_recovered_by: '',
						metadata_url
					})}`);
					//console.log(q);
					//await db.query(q);
				}
				queries.push(`UPDATE sol_og_bridge_event SET status = 'completed' WHERE id = ${db.escape(row.id)}`)
				//console.log(queries);
				//process.exit()
				await db.transaction(queries);
			})
		}))

	}







}