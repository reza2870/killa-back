import { stringify } from "./stringify.js";
import { createHash } from "crypto";

export function sha256(s) {
	if (typeof (s) != 'string') s = stringify(s);
	return createHash('sha256').update(s).digest('hex');
}
export function recursiveHash(s, n = 10) {
	if (typeof s != 'string') {
		s = JSON.stringify(s);
	}
	for (let i = 0; i < n; i++) {
		s = sha256(s);
	}
	return s;
}
