import { db, mode } from "./src/processes/globals.js";
if(mode != 'staging') {
	console.log('Only works on staging');
	process.exit();
}

await db.query(`TRUNCATE TABLE sol_token`);

await db.query(`TRUNCATE TABLE sol_check_txn`);

await db.query(`UPDATE v3_eth_event SET handled = 0 WHERE name = 'Bridged'`);


console.log('done');
process.exit();