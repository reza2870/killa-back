import { signerIdentity } from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { config } from "../../processes/globals.js";
const pool = [];
export function borrowUmi() {
	let ret = getOrCreate();
	returnUmi(ret);
	
	return ret;
}
export function getUmi(wallet) {
	let umi = getOrCreate();
	if (wallet == null) return umi;
	if (typeof wallet == 'string') wallet = { publicKey: wallet };
	umi.use(signerIdentity(wallet, true));
	return umi;
}

function getOrCreate() {
	if (pool.length == 0) return create();
	let ret = pool[pool.length - 1];
	pool.splice(pool.length - 1, 1);
	return ret;


}
export function returnUmi(umi) {
	pool.push(umi);
}

function create() {
	
	let umi =  createUmi(config.sol.rpc_private).use(mplTokenMetadata());
	//umi.rpc.confirmTransaction('', {commitment:'finalized'})
	//umi.rpc.sendTransaction(null, {skipPreflight, ma})
	
	return umi;
}
