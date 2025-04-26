import { addresses, cubauth, cubmint, cubstaker, db, mainauth, mode, ogauth, ogmint, ogstaker } from "../globals.js";
import { buildStake } from "./builders/buildStake.js";
import { buildUnstake } from "./builders/buildUnstake.js";
import { buildMint } from "./builders/buildMint.js";
import { buildMintOg } from "./builders/buildMintOg.js";
import { Keypair } from "@solana/web3.js";
import { recursiveHash } from "../../lib/functions/sha256.js";
import { buildStakeOg } from "./builders/buildStakeOg.js";
import { buildUnstakeOg } from "./builders/buildUnstakeOg.js";
import { buildReverseCubs } from "./builders/buildReverseCubs.js";
import { buildReverseOGs } from "./builders/buildReverseOGs.js";
import { buildRecoveryCubs } from "./builders/buildRecoveryCubs.js";
import { buildRecoveryOgs } from "./builders/buildRecoveryOgs.js";


export class Txns {
	static builders = {
		mint: (...params) => Txns.mint(...params),
		stake: (...params) => Txns.stake(...params),
		unstake: (...params) => Txns.unstake(...params),
		mintOgs: (...params) => Txns.mintOgs(...params),
		stakeOgs: (...params) => Txns.stakeOgs(...params),
		unstakeOgs: (...params) => Txns.unstakeOgs(...params),
		reverseCubs: (...params) => Txns.reverseCubs(...params),
		reverseOgs: (...params) => Txns.reverseOgs(...params)
	}
	static async mint(req) {
		const tokens = req.tokens;
		const q = `
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
		`;
		const rows = await db.query(q);
		const ret = [];
		const authority = addresses[cubauth];
		const mainAuthority = addresses[mainauth];
		const collection = addresses[cubmint];
		const lockdown = addresses['lockdown'];
		const umi = req.umi;
		for (let i = 0; i < tokens.length; i++) {
			const row = rows.find(row => row.eth_token_id == tokens[i]);
			if (row == null) return { error: `Token ${tokens[i]} not mintable by ${req.owner} or already minted` };
			if ((row.has_been_minted ?? 0) > 0) {
				const txn = await buildRecoveryCubs(umi, { mint: row.mint, payer: req.owner, owner: req.owner, authority, mainAuthority, collection, lockdown }, req.blockhash);
				ret.push({ txn, type: 'recovery' });
			} else {
				const txn = await buildMint(umi, tokens[i], { mint: row.mint, payer: req.owner, owner: req.owner, authority, mainAuthority, collection }, req.blockhash);
				ret.push({ txn, type: 'mint' });
			}
		}
		return ret;
	}

	static async mintOgs(req) {
		const tokens = req.tokens;
		const q = `
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
					ORDER BY e2.ts DESC LIMIT 1
				) AND
				e1.eth_token_id IN (${db.escape(tokens)})
		`;
		const rows = await db.query(q);
		const ret = [];
		const authority = addresses[ogauth];
		const mainAuthority = addresses[mainauth];
		const collection = addresses[ogmint];
		const lockdown = addresses['lockdown'];
		const umi = req.umi;
		for (let i = 0; i < tokens.length; i++) {
			const row = rows.find(row => row.eth_token_id == tokens[i]);
			if (row == null) return { error: `Token ${tokens[i]} not mintable by ${req.owner} or already minted` };
			const key1 = 'VLoZDup8wq3VWHJY4gzatIiSAxxLCLu_9OLfnS5Hh0-' + mode;
			const key2 = row.eth_token_id;
			const mint = Keypair.fromSeed(new Uint8Array(Buffer.from(recursiveHash(key1 + key2, 20), 'hex'))).publicKey.toString();
			if ((row.has_been_minted ?? 0) > 0) {
				const txn = await buildRecoveryOgs(umi, { mint, payer: req.owner, owner: req.owner, authority, mainAuthority, collection, lockdown }, req.blockhash);
				ret.push({ txn, type: 'recoveryOgs' });
			} else {
				const txn = await buildMintOg(umi, tokens[i], { mint, payer: req.owner, owner: req.owner, authority, mainAuthority, collection }, req.blockhash);
				ret.push({ txn, type: 'mintOgs' });
			}
		}
		return ret;

	}


	static async stake(req) {
		const tokens = req.tokens;
		const q = `SELECT * FROM sol_token_v2 WHERE eth_token_id IN (${db.escape(tokens)}) AND owner = ${db.escape(req.owner)} AND latest_event_type != 'stake' AND latest_event_type != 'reverse' AND project_id = 19`;
		const rows = await db.query(q);
		const ret = [];
		const staker = addresses[cubstaker];
		const umi = req.umi;
		for (let i = 0; i < tokens.length; i++) {
			const row = rows.find(row => row.eth_token_id == tokens[i]);
			if (row == null) return { error: `Token ${tokens[i]} not owned by ${req.owner} or already staked` };
			const txn = await buildStake(umi, row.staking_delegate != staker, { mint: row.mint, payer: req.owner, owner: req.owner, staker }, req.blockhash);
			ret.push({ txn, type: 'stake' });
		}
		return ret;
	}

	static async unstake(req) {
		const tokens = req.tokens;
		const q = `SELECT * FROM sol_token_v2 WHERE eth_token_id IN (${db.escape(tokens)}) AND owner = ${db.escape(req.owner)} AND latest_event_type = 'stake' AND project_id = 19`;
		const rows = await db.query(q);
		const ret = [];
		const staker = addresses[cubstaker];
		const umi = req.umi;
		for (let i = 0; i < tokens.length; i++) {
			const row = rows.find(row => row.eth_token_id == tokens[i]);
			if (row == null) return { error: `Token ${tokens[i]} not owned by ${req.owner} or not staked` };
			const txn = await buildUnstake(umi, { mint: row.mint, payer: req.owner, owner: req.owner, staker }, req.blockhash);
			ret.push({ txn, type: 'unstake' });
		}
		return ret;
	}


	static async stakeOgs(req) {
		const tokens = req.tokens;
		const q = `SELECT * FROM sol_token_v2 WHERE eth_token_id IN (${db.escape(tokens)}) AND owner = ${db.escape(req.owner)} AND latest_event_type != 'stake' AND latest_event_type != 'reverse' AND project_id = 1`;
		const rows = await db.query(q);
		const ret = [];
		const staker = addresses[ogstaker];
		const umi = req.umi;
		for (let i = 0; i < tokens.length; i++) {
			const row = rows.find(row => row.eth_token_id == tokens[i]);
			if (row == null) return { error: `Token ${tokens[i]} not owned by ${req.owner} or already staked` };
			const txn = await buildStakeOg(umi, row.staking_delegate != staker, { mint: row.mint, payer: req.owner, owner: req.owner, staker }, req.blockhash);
			ret.push({ txn, type: 'stakeOgs' });
		}
		return ret;
	}

	static async unstakeOgs(req) {
		const tokens = req.tokens;
		const q = `SELECT * FROM sol_token_v2 WHERE eth_token_id IN (${db.escape(tokens)}) AND owner = ${db.escape(req.owner)} AND latest_event_type = 'stake' AND project_id = 1`;
		const rows = await db.query(q);
		const ret = [];
		const staker = addresses[ogstaker];
		const umi = req.umi;
		for (let i = 0; i < tokens.length; i++) {
			const row = rows.find(row => row.eth_token_id == tokens[i]);
			if (row == null) return { error: `Token ${tokens[i]} not owned by ${req.owner} or not staked` };
			const txn = await buildUnstakeOg(umi, { mint: row.mint, payer: req.owner, owner: req.owner, staker }, req.blockhash);
			ret.push({ txn, type: 'unstakeOgs' });
		}
		return ret;
	}


	static async reverseCubs(req) {
		const tokens = req.tokens;
		const q = `SELECT * FROM sol_token_v2 WHERE eth_token_id IN (${db.escape(tokens)}) AND owner = ${db.escape(req.owner)} AND latest_event_type != 'stake' AND latest_event_type != 'reverse' AND project_id = 19`;
		const rows = await db.query(q);
		const ret = [];
		const lockdown = addresses['lockdown'];
		const umi = req.umi;
		for (let i = 0; i < tokens.length; i++) {
			const row = rows.find(row => row.eth_token_id == tokens[i]);
			if (row == null) return { error: `Token ${tokens[i]} not owned by ${req.owner} or staked` };
			const txn = await buildReverseCubs(umi, { mint: row.mint, payer: req.owner, owner: req.owner, lockdown }, req.blockhash);
			ret.push({ txn, type: 'reverse' });
		}
		return ret;
	}

	static async reverseOgs(req) {
		const tokens = req.tokens;
		const q = `SELECT * FROM sol_token_v2 WHERE eth_token_id IN (${db.escape(tokens)}) AND owner = ${db.escape(req.owner)} AND latest_event_type != 'stake' AND latest_event_type != 'reverse' AND project_id = 1`;
		const rows = await db.query(q);
		const ret = [];
		const lockdown = addresses['lockdown'];
		const umi = req.umi;
		for (let i = 0; i < tokens.length; i++) {
			const row = rows.find(row => row.eth_token_id == tokens[i]);
			if (row == null) return { error: `Token ${tokens[i]} not owned by ${req.owner} or staked` };
			const txn = await buildReverseOGs(umi, { mint: row.mint, payer: req.owner, owner: req.owner, lockdown }, req.blockhash);
			ret.push({ txn, type: 'reverseOgs' });
		}
		return ret;
	}
}