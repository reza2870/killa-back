import { querify } from "../../lib/functions/querify.js";
import { db, mode } from "../globals.js";
import { nanoid } from "nanoid";


export class Linker {
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
		this.lastIdCubs = 0;
		this.lastIdOgs = 0;
		while (true) {
			try {
				await this.checkOgs();
				await this.checkCubs();
			} catch (e) {
				console.error(e);
			}
			await new Promise(r => setTimeout(r, 60000));
		}
	}



	async checkCubs() {
		let linkedWallets = await db.query(`SELECT * FROM linked_wallet`);
		let linkIdsByEthWallet = {};
		let linkIdsBySolWallet = {};
		for (let linkedWallet of linkedWallets) {
			if (linkedWallet.type == 'ETH') {
				linkIdsByEthWallet[linkedWallet.wallet] = linkedWallet.link_id;
			} else {
				linkIdsBySolWallet[linkedWallet.wallet] = linkedWallet.link_id;
			}
		}
		let txns = await db.query(`SELECT * FROM v3_eth_event WHERE name = 'Bridged' AND id > ${this.lastIdCubs} ORDER BY id LIMIT 400`);

		let tokens = await db.query(`SELECT * FROM token WHERE project_id = 19`);
		let tokenLookup = {};
		for (let token of tokens) {
			tokenLookup[token.token_id] = token.prev_owner;
		}

		let queries = [];
		for (let txn of txns) {

			this.lastIdCubs = txn.id;

			let args = JSON.parse(txn.args);
			let ids = args.cubs.map(item => parseInt(item.hex));
			let solWallet = args.solanaWallet;
			if (ids[0] == null) {
				continue;
			}

			let ethWallet = tokenLookup[ids[0]];
			if (ethWallet == null) continue;
			if (solWallet == null) continue;

			//console.log(linkIdsByEthWallet[ethWallet], linkIdsBySolWallet[solWallet]);
			//process.exit();
			if (linkIdsBySolWallet[solWallet] != null) continue;
			if (linkIdsByEthWallet[ethWallet] == null) {
				linkIdsByEthWallet[ethWallet] = nanoid();
				queries.push(`INSERT INTO linked_wallet SET ${querify({
					wallet: ethWallet,
					link_id: linkIdsByEthWallet[ethWallet],
					type: 'ETH'
				})}`);
			}
			queries.push(`INSERT INTO linked_wallet SET ${querify({
				wallet: solWallet,
				link_id: linkIdsByEthWallet[ethWallet],
				type: 'SOL'
			})}`);
			linkIdsBySolWallet[solWallet] = linkIdsByEthWallet[ethWallet];

		}
		console.log(queries);
		await db.transaction(queries);

	}

	async checkOgs() {
		let linkedWallets = await db.query(`SELECT * FROM linked_wallet`);
		let linkIdsByEthWallet = {};
		let linkIdsBySolWallet = {};
		for (let linkedWallet of linkedWallets) {
			if (linkedWallet.type == 'ETH') {
				linkIdsByEthWallet[linkedWallet.wallet] = linkedWallet.link_id;
			} else {
				linkIdsBySolWallet[linkedWallet.wallet] = linkedWallet.link_id;
			}
		}
		let txns = await db.query(`SELECT * FROM v3_eth_event WHERE name = 'OgBridged' AND id > ${this.lastIdOgs} ORDER BY id LIMIT 400`);

		let tokens = await db.query(`SELECT * FROM token WHERE project_id = 1`);
		let tokenLookup = {};
		for (let token of tokens) {
			tokenLookup[token.token_id] = token.prev_owner;
		}

		let queries = [];
		for (let txn of txns) {

			this.lastIdOgs = txn.id;

			let args = JSON.parse(txn.args);
			let ids = args.tokens.map(item => parseInt(item.hex));
			let solWallet = args.solanaWallet;
			if (ids[0] == null) {
				continue;
			}

			let ethWallet = tokenLookup[ids[0]];
			if (ethWallet == null) continue;
			if (solWallet == null) continue;

			//console.log(linkIdsByEthWallet[ethWallet], linkIdsBySolWallet[solWallet]);
			//process.exit();
			if (linkIdsBySolWallet[solWallet] != null) continue;
			if (linkIdsByEthWallet[ethWallet] == null) {
				linkIdsByEthWallet[ethWallet] = nanoid();
				queries.push(`INSERT INTO linked_wallet SET ${querify({
					wallet: ethWallet,
					link_id: linkIdsByEthWallet[ethWallet],
					type: 'ETH'
				})}`);
			}
			queries.push(`INSERT INTO linked_wallet SET ${querify({
				wallet: solWallet,
				link_id: linkIdsByEthWallet[ethWallet],
				type: 'SOL'
			})}`);
			linkIdsBySolWallet[solWallet] = linkIdsByEthWallet[ethWallet];

		}
		console.log(queries);
		await db.transaction(queries);

	}



}