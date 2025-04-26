import { db } from "../../processes/globals.js";

export function querify(o) {
	let ret = [];
	for (let key in o) {
		let val = o[key];
		ret.push(`${db.escapeId(key)}=${db.escape(val)}`);
	}
	return ret.join(',');
}
