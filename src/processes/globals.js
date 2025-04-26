import { resolve } from "path";
import { getConfig } from "../lib/classes/config-manager.js";
import { DBManager } from '../lib/classes/db-manager.mjs';
import { existsSync, readFileSync } from "fs";
import { Connection } from "@solana/web3.js";

export let mode = process.argv[2];
if (mode == null) {
	console.log('Please provide a mode');
	process.exit();
}

export let config = getConfig(mode, resolve('../config'));
export let db = new DBManager(config.db, 2);

export let partials2 = existsSync(`../config/${mode}/partials2.json`) ? JSON.parse(readFileSync(`../config/${mode}/partials2.json`)) : {}
export let partials3 = existsSync(`../config/${mode}/partials3.json`) ? JSON.parse(readFileSync(`../config/${mode}/partials3.json`)) : {}
export let addresses = existsSync(`../config/${mode}/addresses.json`) ? JSON.parse(readFileSync(`../config/${mode}/addresses.json`)) : {}
export let web3conn = new Connection(config.sol.rpc_private, "finalized");

export let cubauth = 'KILLACUBS-authority';
export let cubstaker = 'KILLACUBS-staker';
export let cubmint = 'KILLACUBS-mint';

export let ogauth = 'KILLABEARS-authority';
export let ogstaker = 'KILLABEARS-staker';
export let ogmint = 'KILLABEARS-mint';

export let mainauth = 'main-authority';
export let maincreator = 'main-creator';

export let lockdown = 'lockdown';