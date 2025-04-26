import { existsSync, readFileSync } from "fs";
import { join } from "path";
export function getConfig(mode, path) {
	let order = ['global', 'live', 'staging', 'dev'];
	let ret = {};
	for (let item of order) {
		let overrides = existsSync(join(path, item + '.json')) ? JSON.parse(readFileSync(join(path, item + '.json'))) : {};
		applyOverrides(ret, overrides);
		if (item == mode) break;
	}
	return ret;
}
function applyOverrides(source, overrides) {
	for (const key in overrides) {
		if (typeof overrides[key] === 'object' && !Array.isArray(overrides[key]) && overrides[key] !== null) {
			if (!source[key]) {
				source[key] = {};
			}
			applyOverrides(source[key], overrides[key]);
		} else {
			source[key] = overrides[key];
		}
	}
}