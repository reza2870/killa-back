import { addresses, config, cubauth, cubmint, cubstaker, db, mainauth, maincreator, mode } from "../globals.js";
import { TxnBatch, fakeSigner } from "./txn-batch.js";
import { getSignerFromPk } from "../../lib/functions/signers.js";
import { TokenStandard, createProgrammableNft, delegateStakingV1, lockV1, createMetadataAccountV3 } from "@metaplex-foundation/mpl-token-metadata";
import { percentAmount } from "@metaplex-foundation/umi";
import { findMetadataPda } from '@metaplex-foundation/mpl-token-metadata';
import { verifyCollectionV1, verifyCreatorV1 } from "@metaplex-foundation/mpl-token-metadata";
import { recursiveHash } from "../../lib/functions/sha256.js";
import { readFileSync } from "fs";
import { decrypt } from "./encryption.js";
import { moveMessagePortToContext } from "worker_threads";

let partial3 = readFileSync(`../config/${mode}/cub-mint-partial3.txt`).toString()
export class MintTxn extends TxnBatch {
	type = 'mint';
	fakeSigner(publicKey) {
		return { publicKey, signMessage: () => { }, signTransaction: () => { }, signAllTransactions: () => { } };
	}
	async _build() {
		const tokens = this.request.tokens;
		const rows = await db.query(`SELECT * FROM sol_token WHERE eth_token_id IN (${db.escape(tokens)})`);
		let mints = {};
		this.tokenRows = rows;
		let lookup = {};
		for (let row of rows) {
			mints[row.eth_token_id] = fakeSigner(row.mint);
			lookup[row.eth_token_id] = row;

			if (row.can_be_minted_by != this.request.owner) continue;
			
			
		}
		if (Object.keys(mints).length == 0) return [];

		
		this.signers.push(cubauth);
		this.signers.push(mainauth);
		let authority = fakeSigner(cubauth);
		let mainAuthority = fakeSigner(mainauth);
		let owner = { publicKey: this.request.owner };
		let ret = [];
		this.rows = [];
		for (let i = 0; i < tokens.length; i++) {
			let token = this.request.tokens[i];
			let blockhash = this.theirs[i].message.blockhash;
			const mint = mints[token];
			this.rows.push(lookup[token]);
			const metadata = findMetadataPda(this.umi, { mint: mint.publicKey });
			let builder = createProgrammableNft(this.umi, {
				metadata,
				mint,
				authority,
				updateAuthority: authority,
				creators: [{ address: mainAuthority.publicKey, share: 100 }],
				name: 'KILLACUB #' + token,
				uri: 'https://tokens.killabears.com/cubs/solana/' + token,
				tokenOwner: owner.publicKey,
				sellerFeeBasisPoints: percentAmount(4.0), // 5.5%
				isCollection: false,

				collection: {
					key: addresses[cubmint]
				}
			});
			builder = builder.add(verifyCollectionV1(this.umi, {
				metadata,
				collectionMint: addresses[cubmint],
				authority: mainAuthority,
				tokenOwner: owner.publicKey,
			}))
			builder = builder.add(verifyCreatorV1(this.umi, {
				metadata,
				authority: mainAuthority
			}));
			builder = builder.setFeePayer(owner);
			builder = builder.setBlockhash(blockhash);
			let txn = builder.build(this.umi);
			ret.push(this.duplicate(txn));
			//if (!this.verifyTransaction(this.theirs[i], this.duplicate(txn))) return false;
		}
		this.txns = ret;

	}
}