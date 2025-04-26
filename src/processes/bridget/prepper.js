import { recursiveHash } from "../../lib/functions/sha256.js";
import { addresses, config, cubauth, db, lockdown, mainauth, mode, ogauth, partials2 } from "../globals.js";
import { decrypt, encrypt } from "./encryption.js";
import { nanoid } from "nanoid";
import { Txns } from "./txns.js";
import { getUmi, returnUmi } from "../../lib/functions/getUmi.js";
import { readFileSync } from "fs";
import base58 from "bs58";
import { Storer } from "./storer.js";
import { getSignerFromPk } from "../../lib/functions/signers.js";
import { Keypair } from "@solana/web3.js";

let partial1 = readFileSync(`../config/${mode}/cub-mint-partial1.txt`).toString()
let partial2 = readFileSync(`../config/${mode}/cub-mint-partial2.txt`).toString()
let partial3 = readFileSync(`../config/${mode}/cub-mint-partial3.txt`).toString()
let cubSigners = JSON.parse(readFileSync(`../config/${mode}/cub-mint-enc.json`).toString());
export class Prepper {
	static requiredSigners = {
		stake: ['staker'],
		unstake: ['staker'],
		mint: ['cubAuthority', 'mainAuthority', 'mint', 'lockdown'],
		mintOgs: ['ogAuthority', 'mainAuthority', 'mintOg', 'lockdown'],
		stakeOgs: ['ogStaker'],
		unstakeOgs: ['ogStaker'],
		reverseCubs: ['lockdown'],
		reverseOgs: ['lockdown'],
	}
	static signers = {
		cubAuthority: (...params) => this.remoteSign(cubauth, ...params),
		ogAuthority: (...params) => this.remoteSign(ogauth, ...params),
		mainAuthority: (...params) => this.remoteSign(mainauth, ...params),
		lockdown: (...params) => this.remoteSign(lockdown, ...params),
		staker: (...params) => this.remoteSign('KILLACUBS-staker', ...params),
		ogStaker: (...params) => this.remoteSign('KILLABEARS-staker', ...params),
		mint: (...params) => this.signMint(...params),
		mintOg: (...params) => this.signMintOg(...params)
	}
	static async prep(get, auth, qs) {
		process.stdout.write("\u001b[3J\u001b[2J\u001b[1J"); console.clear();
		const action = get.type;
		const tokens = get.ids.split(',');
		const owner = get.owner;
		const ethWallet = get['eth-wallet'];


		const umi = getUmi(owner);

		let { blockhash, lastValidBlockHeight } = await umi.rpc.getLatestBlockhash({ commitment: 'finalized' });

		//blockhash = 'BLjWnaG6D1xL2XCvJPUk3Pb1dr7iTDa3foarweih5oQE';

		const id = nanoid();
		const req = { action, tokens, owner, auth, qs, blockhash, umi, id, ethWallet }
		//mkdirSync('temp/' + id);
		const txns = await Txns.builders[action](req);
		if (txns.error != null) return txns;
		if (txns == null || txns.length == 0) return { error: 1 };
		const serialized = txns.map(txn => {
			return base58.encode(umi.transactions.serialize(txn.txn));
		});
		//writeFileSync(`temp/${id}/txns-serialized.json`, stringify2(serialized, true));
		//writeFileSync(`temp/${id}/txns-umi.json`, stringify2(txns, true));
		returnUmi(umi);

		req.txns = txns;
		this.sign(id, req, txns, lastValidBlockHeight);
		return { id, txns: serialized };
	}
	static async sign(id, data, txns, lastValidBlockHeight) {
		const signatures = txns.map(_ => ({}));
		signatures.length = txns.length;

		const promises = this.requiredSigners[data.action].map(signer => this.signers[signer](data, signatures));
		try {
			await Promise.all(promises);
			await Storer.add(id, { txns, signatures, action: data.action, owner: data.owner, ethWallet: data.ethWallet, tokens: data.tokens, lastValidBlockHeight })
		} catch (e) {
			console.error(e);
		}
	}
	static async remoteSign(signer, req, signatures) {
		const key = req.qs + '-mzZ7RTh3jeRVJY';
		const addr = addresses[signer];
		const partial1 = decrypt(req.auth, key);
		const partial2 = partials2[signer];
		const partial4 = recursiveHash([partial1, partial2]);

		const qs = `signer=${addr}&type=${escape(req.action)}&ids=${escape(req.tokens.join(','))}&owner=${escape(req.owner)}&id=${req.id}&blockhash=${req.blockhash}`;
		const encrypted = encrypt(partial4, 'tc8BrTCtuc5CW7')

		const url = `${config.sol.signingUrlsV2[signer]}?${qs}`.split('${port}').join(config.sol.port);

		const res = await fetch(url, { headers: new Headers({ Authorization: encrypted, }) });
		const data = await res.json();

		for (let i = 0; i < data.length; i++) {
			if (data[i] == null) continue;
			const sig = base58.decode(data[i]);
			signatures[i][addr] = sig;
		}
	}
	static async signMintOg(req, signatures) {
		let tokens = req.tokens;
		const rows = await db.query(`
			SELECT
				e1.*, t.id AS has_been_minted
			FROM
				sol_token_event e1
			LEFT JOIN
				sol_token_v2 t ON e1.eth_token_id = t.eth_token_id AND e1.project_id = t.project_id
			WHERE
				e1.event_type = 'bridged' AND e1.confirmed = 1 AND e1.project_id = 1 AND
				e1.sol_wallet = ${db.escape(req.owner)} AND
				e1.id = (
					SELECT id FROM sol_token_event e2
					WHERE e2.eth_token_id = e1.eth_token_id AND e1.project_id = e2.project_id
					ORDER BY ts DESC LIMIT 1
				) AND
				e1.eth_token_id IN (${db.escape(tokens)})
			`);
		for (let i = 0; i < tokens.length; i++) {
			const row = rows.find(row => row.eth_token_id == tokens[i]);

			if (row == null) return { error: `Token ${tokens[i]} not mintable by ${req.owner}` };
			if ((row.has_been_minted ?? 0) > 0) continue;
			const key1 = 'VLoZDup8wq3VWHJY4gzatIiSAxxLCLu_9OLfnS5Hh0-' + mode;
			const key2 = tokens[i];

			let keypair = Keypair.fromSeed(new Uint8Array(Buffer.from(recursiveHash(key1 + key2, 20), 'hex')));
			let signer = getSignerFromPk(keypair.secretKey);
			const txn = req.txns[i];
			const publicKey = "" + signer.publicKey.toString();
			let index = txn.txn.message.accounts.indexOf(publicKey);

			let signed = await signer.signTransaction(txn.txn);

			signatures[i][publicKey] = signed.signatures[index];
		}
	}
	static async signMint(req, signatures) {
		let tokens = req.tokens;
		const rows = await db.query(`
			SELECT
				e1.*, t.id AS has_been_minted
			FROM
				sol_token_event e1
			LEFT JOIN
				sol_token_v2 t ON e1.eth_token_id = t.eth_token_id AND e1.project_id = t.project_id
			WHERE
				e1.event_type = 'bridged' AND e1.confirmed = 1 AND e1.project_id = 19 AND
				e1.sol_wallet = ${db.escape(req.owner)} AND
				e1.id = (
					SELECT id FROM sol_token_event e2
					WHERE e2.eth_token_id = e1.eth_token_id AND e1.project_id = e2.project_id
					ORDER BY ts DESC LIMIT 1
				) AND
				e1.eth_token_id IN (${db.escape(tokens)})
			`);
		for (let i = 0; i < tokens.length; i++) {
			const row = rows.find(row => row.eth_token_id == tokens[i]);

			if (row == null) return { error: `Token ${tokens[i]} not mintable by ${req.owner}` };
			if ((row.has_been_minted ?? 0) > 0) continue;
			let combo1 = recursiveHash([partial1, row.mint], 2);
			let combo2 = recursiveHash([combo1, partial2, row.mint], 2);

			let combo3 = recursiveHash([combo1, combo2, partial3, row.mint], 2);


			let key = decrypt(cubSigners[row.mint], combo3);


			let secret = new Uint8Array(Buffer.from(key, 'hex'));
			const txn = req.txns[i];
			let signer = getSignerFromPk(secret);
			let index = txn.txn.message.accounts.indexOf(row.mint);

			let signed = await signer.signTransaction(txn.txn);

			signatures[i][row.mint] = signed.signatures[index];


		}

	}


}

