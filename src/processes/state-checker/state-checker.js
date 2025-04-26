import { db, mode } from "../globals.js";
import { ActionChecker } from "./action-checker.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { EthEventChecker } from "./eth-event-checker.js";
import { EthBridgeConfirmer } from "./eth-bridge-confirmer.js";
import { EventConsolidator } from "./event-consolidator.js";
import { TokenChecker } from "./token-checker.js";
export let cubAddresses = JSON.parse(readFileSync(`../config/${mode}/cub-mint-addresses.json`).toString());
export class StateChecker {
	constructor() {
		this.lastIndex = 0;
		if(!existsSync('state-logs')) mkdirSync('state-logs');
		this.run(() => this.update(), 4000);
	}
	async run(callback, rate) {
		while (true) {
			try { await callback(); }
			catch (e) { console.error(e); }
			await new Promise(r => setTimeout(r, rate));
		}
	}

	async try(title, callback, fn) {
		console.log(title);
		try {
			await callback();
		} catch (e) {
			console.error(e);
			writeFileSync('state-logs/' + fn + '-' + new Date().getTime() + '.txt', e.stack);
		}
	}

	async update() {
		console.log('--------');
		console.log('Updating');
		console.log('--------');
		await this.try('Checking Events', async () => await EthEventChecker.checkEvents(), 'check-events');
		await this.try('Confirming Events', async () => await EthBridgeConfirmer.confirmEvents(), 'confirm-events');
		await this.try('Checking Actions', async () => await ActionChecker.checkActions(), 'check-actions');
		await this.try('Consolidating Events', async () => await EventConsolidator.consolidateEvents(), 'consolidate-events');
		await this.try('Checking Tokens', async () => await TokenChecker.checkTokens(), 'check-tokens');
		console.log('Done');
		console.log('');
	}

}

class Tester {
	static async Test() {
		let oldRows = await db.query(`SELECT * FROM sol_token`);
		let newRows = await db.query(`SELECT * FROM sol_token_v2 WHERE project_id = 19`);
		let oldMap = {};

		for (let row of oldRows) {
			oldMap[row.eth_token_id] = row;
		}
		for (let row of newRows) {
			let oldRow = oldMap[row.eth_token_id];
			if (oldRow == null) {
				console.log('Missing', row.eth_token_id);
				continue;
			}
			if (row.mint != oldRow.mint) console.log('Mint mismatch', row.eth_token_id, row.mint, oldRow.mint);
			if (oldRow.staked == 1) {
				if (row.latest_event_type != 'stake') console.log('staking mismatch 1', row.eth_token_id, row.latest_event_type);
				if (row.latest_event_ts != oldRow.stake_ts) console.log('stake ts mismatch 1', row.eth_token_id, row.latest_event_ts, oldRow.stake_ts);
			} else {
				if (row.latest_event_type == 'stake') console.log('staking mismatch 2', row.eth_token_id, row.latest_event_type);

			}
			if (row.owner != oldRow.owner) console.log('Owner mismatch', row.eth_token_id, row.owner, oldRow.owner);
		}

	}
}