import { fetchDigitalAssetWithTokenByMint, fetchAllTokenRecord } from '@metaplex-foundation/mpl-token-metadata';
import { addresses, config, db } from "../globals.js";
import { processChunks } from "../../lib/functions/processChunks.js";
import { getUmi } from "../../lib/functions/getUmi.js";
import { querify } from '../../lib/functions/querify.js';


const umi = getUmi();
let staker = config.sol.accounts.staker;

export class StakingIndexer {
	constructor() {
		this.run(() => this.updateAssets(), 2000);
		this.run(() => this.updateAssets(false), 20000);
	}

	async run(callback, rate) {
		while (true) {
			try { await callback(); }
			catch (e) {

			}
			await new Promise(r => setTimeout(r, rate));
		}
	}



	async updateAssets(pending = true) {
		let now = Math.floor(new Date().getTime() / 1000);
		this.now = now;
		const q = `
			SELECT
				t.*, e.action, e.status, e.ts
			FROM
				sol_token t
			LEFT JOIN
				sol_staking_event e
			ON
				e.internal_id = t.staking_internal_id AND t.staking_pending = 1
			WHERE
				has_been_minted = 1 AND token_record_pub_key != '' AND (
					(
						staking_pending = 0 AND
						last_staking_check < ${now - 60}
					) OR (
						staking_pending = 1 AND
						e.ts < ${now - 10} AND
						(
							last_staking_check < ${now - 10} OR 
							last_staking_check <= e.ts
						)
					)
				)
				AND staking_pending = ${pending ? 1 : 0}
			ORDER BY 
				rand()
			LIMIT 100
		`;
		let rows = await db.query(q);

		await processChunks(rows, 100, async (rows) => {
			try {
				return await this.processAssets(rows);
			} catch (e) {
				if (e.message.includes('The account of type [TokenRecord] was not found at the provided address [')) {
					let parts = e.message.split('The account of type [TokenRecord] was not found at the provided address [');
					parts = parts[1].split(']');
					let addr = parts[0];
					let q = `UPDATE sol_token SET token_record_pub_key='', token_pub_key = '' WHERE token_record_pub_key=${db.escape(addr)} OR token_pub_key = ${db.escape(addr)}`;
					await db.query(q);
					console.log('Removed', addr);
				} else {
					console.error(e);
				}
			}
		});
	}

	async processAssets(rows) {
		let queries = [];
		let lookup = {};
		let tokenRecordKeys = [];
		for (let row of rows) {

			lookup[row.token_record_pub_key] = row;
			tokenRecordKeys.push(row.token_record_pub_key);

		}

		if (tokenRecordKeys.length > 0) {
			let records = await fetchAllTokenRecord(umi, tokenRecordKeys);

			for (let record of records) {

				let row = lookup[record.publicKey]
				let updates = {};
				let locked = record.state == 1;
				let delegate = record.delegate.value ?? '';
				let rightDelegate = delegate == addresses['KILLACUBS-staker'];

				let staked = locked && rightDelegate;
				let stakedVal = staked ? 1 : 0;
				let lockedVal = locked ? 1 : 0;


				let updates_event = {};

				if (row.staking_delegate != delegate) {
					updates.staking_delegate = delegate;
				}
				if (row.staked != stakedVal) {
					updates.staked = stakedVal;
					if (staked) {
						if (row.staking_pending == 1) {
							if (row.action == 'stake') {
								updates.stake_ts = row.ts;
								updates.staking_pending = 0;
								updates_event.status = 'confirmed';
							}
						} else {
							updates.stake_ts = this.now - 300;
						}
					} else {
						if (row.staking_pending == 1) {
							if (row.action == 'unstake') {
								updates_event.status = 'confirmed';
							} else {
								if (this.now - row.ts > 300) {

									updates.staking_pending = 0;
									updates_event.status = 'expired';
								}
							}
						}
					}
				} else {
					if (row.staking_pending == 1) {
						if (staked && row.action == 'stake') {
							updates.staking_pending = 0;
						} else if (!staked && row.action == 'unstake') {
							updates.staking_pending = 0;
						} else if (this.now - row.ts > 300) {
							updates_event.status = 'expired';
							updates.staking_pending = 0;
						}
					}

				}
				if (row.locked != lockedVal) {
					updates.locked = lockedVal;
				}
				//if (row.staking_pending == 1) updates.staking_pending = 0;

				updates.last_staking_check = this.now;


				if (Object.keys(updates).length > 0) {
					queries.push(`UPDATE sol_token SET ${querify(updates)} WHERE id = ${row.id}`);
				}
				if (row.staking_pending && Object.keys(updates_event).length > 0) {
					queries.push(`UPDATE sol_staking_event SET ${querify(updates_event)} WHERE internal_id = ${db.escape(row.staking_internal_id)}`);
				}
			}
		}
		if (queries.length > 0) {
			await db.transaction(queries);
		}
		await new Promise(r => setTimeout(r, 5000));

	}


}
