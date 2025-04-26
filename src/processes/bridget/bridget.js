import { Server } from "../../lib/classes/server.js";
import { Prepper } from "./prepper.js";
import { MintTxn } from "./mint-txn.js";
import { Signer } from "./signer.js";
import { StakeTxn } from "./stake-txn.js";
import { UnstakeTxn } from "./unstake-txn.js";
import { Sender } from "./sender.js";
import { ethers } from "ethers";
import { config, db } from "../globals.js";



export class Bridget extends Server {
	batchTypes = {
		mint: MintTxn,
		stake: StakeTxn,
		unstake: UnstakeTxn
	};
	constructor(port) {
		super(port);
		this.addRoutes();
	}
	addRoutes() {
		//this.addRoute('prep', async (get, headers, qs) => await this.createBatch(get, headers.authorization, qs).prep());
		//this.addRoute('sign', async (get, headers, qs) => await this.createBatch(get, headers.authorization).sign());
		//this.addRoute('submit', async (get, headers, qs) => await this.createBatch(get, headers.authorization).submit());
		this.addRoute('prep', async (get, headers, qs) => await Prepper.prep(get, headers.authorization, qs));
		this.addRoute('signer', async (get, headers, qs) => await Signer.sign(get, headers.authorization, qs));
		this.addRoute('send', async (get) => await Sender.send(get));
		this.addRoute('eth-sign', async (get) => await this.ethSign(get));
	}
	createBatch(data, ...params) {
		return new this.batchTypes[data.type](data, ...params);
	}
	async getNonce(wallet, type, ids) {
		if (this.bridgeBackContract == null) {
			let rows = await db.query(`SELECT * FROM project WHERE slug = 'bridgeback'`);
			let row = rows[0];
			let abi = JSON.parse(row.abi);
			let address = row.contract_address;
			let rpc = config.eth.rpc_private;
			let provider = new ethers.providers.StaticJsonRpcProvider(rpc);
			this.bridgeBackContract = new ethers.Contract(address, abi, provider);
		}
		let fn = type == 'og' ? 'getNonceAndValidateOGOwnership' : 'getNonceAndValidateCubOwnership';
		try {
			let nonce = await this.bridgeBackContract[fn](wallet, ids);
			return nonce.toNumber();
		} catch (e) {
			console.error(e);
			return -2;
		}

	}
	async ethSign(get) {
		try {
			const ids = get.ids?.split(',').map(item => parseInt(item)) ?? [];
			const nonce = await this.getNonce(get.owner, get.type, ids) + 1;
			const signer = new ethers.Wallet(config.eth.signers[get.type + 's'].key);
			const message = ethers.utils.solidityPack(["uint256[]", "uint256", "address"], [ids, nonce, get.owner]);
			const signature = await signer.signMessage(ethers.utils.arrayify(message));
			return { signature, nonce }
		} catch (e) {
			console.error(e);
			return { error: e.message };
		}
	}
}
