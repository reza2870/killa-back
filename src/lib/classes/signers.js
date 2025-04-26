import { readFileSync } from "fs";
import { basename } from "path";
import { getSignerFromPk } from "../functions/signers.js";

export class Signers {
	static signers = {};
	static get(wallet) {
		return this.signers[wallet] ??= this.loadSigner(wallet)
	}
	static loadSigner(wallet) {
		let json = JSON.parse(readFileSync(`data/signers/${basename(wallet)}.json`).toString());
		return getSignerFromPk(json);
	}
	
}

