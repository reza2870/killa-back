import { createProgrammableNft } from "@metaplex-foundation/mpl-token-metadata";
import { percentAmount } from "@metaplex-foundation/umi";
import { findMetadataPda } from '@metaplex-foundation/mpl-token-metadata';
import { verifyCollectionV1, verifyCreatorV1 } from "@metaplex-foundation/mpl-token-metadata";
import { setComputeUnitLimit, setComputeUnitPrice } from '@metaplex-foundation/mpl-toolbox'

export function fakeSigner(publicKey) {
	return { publicKey, signMessage: () => { }, signTransaction: () => { }, signAllTransactions: () => { } };
}

export async function buildMintOg(umi, token, addresses, blockhash) {
	let mint = fakeSigner(addresses.mint);
	let owner = fakeSigner(addresses.owner);
	let payer = fakeSigner(addresses.owner);
	let authority = fakeSigner(addresses.authority);
	let mainAuthority = fakeSigner(addresses.mainAuthority);
	let collection = addresses.collection;
	
	const metadata = findMetadataPda(umi, { mint: mint.publicKey });

	let builder = createProgrammableNft(umi, {
		metadata,
		mint,
		authority,
		updateAuthority: authority,
		creators: [{ address: mainAuthority.publicKey, share: 100 }],
		name: 'KILLABEAR #' + token,
		uri: 'https://tokens.killabears.com/killabears/solana/' + token,
		tokenOwner: owner.publicKey,
		sellerFeeBasisPoints: percentAmount(4.0), // 5.5%
		isCollection: false,
		collection: {
			key: collection
		}
	});
	//builder = builder.setVersion('legacy')
	builder = builder.add(verifyCollectionV1(umi, {
		metadata,
		collectionMint: collection,
		authority: mainAuthority,
		tokenOwner: owner.publicKey,
	}))


	builder = builder.add(verifyCreatorV1(umi, {
		metadata,
		authority: mainAuthority
	}));

	builder = setComputeUnitPrice(umi, { microLamports: 5_000_000 }).add(setComputeUnitLimit(umi, { units: 5_000_000 })).add(builder);

	builder = builder.setFeePayer(payer);
	if (blockhash) {
		builder = builder.setBlockhash(blockhash);
		return builder.build(umi);
	}
	return builder.buildWithLatestBlockhash(umi);
}