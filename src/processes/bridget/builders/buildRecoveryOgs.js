import { TokenStandard, transferV1, unlockV1 } from "@metaplex-foundation/mpl-token-metadata";
import { setComputeUnitLimit, setComputeUnitPrice } from '@metaplex-foundation/mpl-toolbox'

export function fakeSigner(publicKey) {
	return { publicKey, signMessage: () => { }, signTransaction: () => { }, signAllTransactions: () => { } };
}

export async function buildRecoveryOgs(umi, addresses, blockhash) {
	let mint = addresses.mint;
	let owner = fakeSigner(addresses.owner);
	let payer = fakeSigner(addresses.owner);
	let lockdown = fakeSigner(addresses.lockdown);

	let builder = unlockV1(umi, {
		mint,
		tokenOwner: lockdown.publicKey,
		authority: lockdown,
		tokenStandard: TokenStandard.ProgrammableNonFungible,
	});

	builder = builder.add(transferV1(umi, {
		mint,
		authority: lockdown,
		tokenOwner: lockdown.publicKey,
		destinationOwner: owner.publicKey,
		tokenStandard: TokenStandard.ProgrammableNonFungible,
	}));

	


	builder = setComputeUnitPrice(umi, { microLamports: 5_000_000 }).add(setComputeUnitLimit(umi, { units: 5_000_000 })).add(builder);



	builder = builder.setFeePayer(payer);
	if (blockhash) {
		builder = builder.setBlockhash(blockhash);
		return builder.build(umi);
	}
	return builder.buildWithLatestBlockhash(umi);
}