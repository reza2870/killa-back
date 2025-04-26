import { addresses, db } from "../globals.js";
import { querify } from "../../lib/functions/querify.js";


export class EventConsolidator {
	static lastEventId = 0;
	static eventsPerToken = {
		'1': {},
		'19': {}
	};
	static async consolidateEvents() {
		let rows = await db.query(`SELECT * FROM sol_token_event WHERE id > ${this.lastEventId} ORDER BY id ASC`);
		let updates = { '1': new Set(), '19': new Set() };
		for (let row of rows) {
			this.lastEventId = Math.max(this.lastEventId, row.id);
			this.eventsPerToken[row.project_id][row.eth_token_id] ??= [];
			this.eventsPerToken[row.project_id][row.eth_token_id].push(row);
			updates[row.project_id].add(row.eth_token_id);
		}
		let queries = [
			...await this.checkProject(updates['1'], '1'),
			...await this.checkProject(updates['19'], '19')
		];
		await db.transaction(queries);

	}
	static async checkProject(updatedTokens, projectId) {
		if (updatedTokens.size == 0) return [];
		let staker = projectId == '1' ? addresses['KILLABEARS-staker'] : addresses['KILLACUBS-staker'];
		let tokenRows = await db.query(`SELECT * FROM sol_token_v2 WHERE project_id = ${projectId} AND eth_token_id IN (${[...updatedTokens].join(',')})`);
		let tokenLookup = {};
		for (let row of tokenRows) tokenLookup[row.eth_token_id] = row;

		let queries = [];
		for (let token of updatedTokens) {
			let events = this.eventsPerToken[projectId][token];
			if (events.length == 0) continue;
			let tokenRow = tokenLookup[token];
			let createTokenRow = false;
			let mint;
			let mintedBy = '';
			let lastEvent;
			for (let event of events) {
				if (lastEvent == null || event.ts > lastEvent.ts) lastEvent = event;
				mint ??= event.mint;
				if (event.event_type == 'mint') {
					createTokenRow = tokenRow == null;
					mintedBy = event.sol_wallet;
				}
			}
			if (createTokenRow) {
				queries.push(`INSERT INTO sol_token_v2 SET ${querify({
					project_id: projectId,
					mint: mint,
					eth_token_id: token,
					owner: mintedBy,
					latest_event_id: lastEvent.id,
					latest_event_ts: lastEvent.ts,
					latest_event_type: lastEvent.event_type,
					last_fetched: 0
				})}`);
			} else if (tokenRow != null) {
				let updates = { latest_event_id: lastEvent.id, latest_event_type: lastEvent.event_type, latest_event_ts: lastEvent.ts};
				if (lastEvent.event_type == 'reverse') updates.staking_delegate = updates.owner = addresses.lockdown;
				if (lastEvent.event_type == 'stake') updates.staking_delegate = staker;
				for (let key in updates) if (tokenRow[key] == updates[key]) delete updates[key];
				if (Object.keys(updates).length > 0) {
					updates.last_fetched = 0;
					queries.push(`UPDATE sol_token_v2 SET ${querify(updates)} WHERE id = ${tokenRow.id}`);
				}
			}
		}
		return queries;
	}
}
