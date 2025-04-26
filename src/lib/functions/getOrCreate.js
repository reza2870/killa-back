import { existsSync, readFileSync, writeFileSync } from "fs";
import { stringify } from "./stringify.js";

export async function getOrCreate(fn, factory) {
	if (!existsSync(fn)) writeFileSync(fn, stringify(await factory()));
	return JSON.parse(readFileSync(fn).toString());
}
