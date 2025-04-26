import { config, db } from "../globals.js";
import { readFileSync, writeFileSync } from "fs";
import { NFTStorage, File } from 'nft.storage'
import mime from 'mime'
import { TaskManager } from "../../lib/classes/task-manager.js";
import { readFile } from "fs/promises";
import { basename } from "path";
import { RateLimitedTaskManager } from "../../lib/classes/RateLimitedTaskManager.js";
import { sha256 } from "../../lib/functions/sha256.js";
let metaCache = JSON.parse(readFileSync('data/meta-cache.json').toString());

const NFT_STORAGE_KEY = config.nft_storage_key;
export class BridgingUploader {
	constructor() {
		this.tasks = new RateLimitedTaskManager(10, 25000);
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
		this.lastId = 0;
		this.handling = new Set();
		while (true) {
			try {
				await this.check();
			} catch (e) {
				console.error(e);
			}
			await new Promise(r => setTimeout(r, 8000));
		}
	}
	async fileFromPath(filePath) {
		const content = await readFile(filePath)
		const type = mime.getType(filePath)
		return new File([content], basename(filePath), { type })
	}
	async fileFromURL(url) {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Network response was not ok for ${url}`);
		}
		const blob = await response.blob();
		const filename = url.split('/').pop();
		const type = blob.type;
		return new File([blob], filename, { type });
	}

	async storeNFT(url) {
		try {
			const file = url.startsWith('http') ? await this.fileFromURL(url) : await this.fileFromPath(url);
			const nftstorage = new NFTStorage({ token: NFT_STORAGE_KEY })
			return await nftstorage.storeBlob(file)
		} catch (e) {
			console.error(e);
			return null;
		}
	}

	async check() {

		while (this.handling.length > 20) {
			await new Promise(r => setTimeout(r, 100));
		}
		let rows = await db.query(`SELECT * FROM sol_bridge_event WHERE status = 'uploading'`);

		rows = rows.filter(row => !this.handling.has(row.id));

		rows.map(row => this.handling.add(row.id))
		rows.map(async row => {

			try {
				let tokens = JSON.parse(row.cubs);

				/*
								const metas = await Promise.all(tokens.map(async (token) => (await fetch('https://tokens.killabears.com/cubs/meta/cub-' + token + '-0')).json()));
								let promises = [];
								for (let i = 0; i < tokens.length; i++) {
									let meta = metas[i]
									let copy = JSON.parse(JSON.stringify(meta));
									copy.image = copy.image.split('?')[0];
									let metahash = sha256(JSON.stringify(copy));
									let token = tokens[i];
									if (metaCache[metahash]) {
										promises.push(metaCache[metahash]);
										continue;
									}
									promises.push(this.tasks.addTask(async () => {
										let res = await this.storeNFT(meta.image)
										if (res == null) return null;
										meta.image = `ipfs://${res}`
										writeFileSync('temp/' + token + '.json', JSON.stringify(meta));
										const url = await this.storeNFT('temp/' + token + '.json');
										if (url == null) return null;
										return `ipfs://${url}`
									}))
				
								}
								
								let res = await Promise.all(promises);
								*/

				let res = tokens.map(token => 'https://tokens.killabears.com/cubs/solana/' + token);

				//if (res.includes(null)) return;
				let q = `UPDATE sol_bridge_event SET meta_links = ${db.escape(JSON.stringify(res))}, status = 'verifying' WHERE id = ${db.escape(row.id)}`;

				await db.transaction([q]);
			} catch (e) {
				console.error(e);
			}
			this.handling.delete(row.id);
		})

	}



}