import { TokenStandard, delegateStakingV1, lockV1 } from "@metaplex-foundation/mpl-token-metadata";
import { setComputeUnitLimit, setComputeUnitPrice } from '@metaplex-foundation/mpl-toolbox'

export function fakeSigner(publicKey) {
	return { publicKey, signMessage: () => { }, signTransaction: () => { }, signAllTransactions: () => { } };
}

export async function buildStake(umi, setDelegate, addresses, blockhash) {
	let mint = addresses.mint;
	let owner = fakeSigner(addresses.owner);
	let payer = fakeSigner(addresses.owner);
	let staker = fakeSigner(addresses.staker);
	let builder = lockV1(umi, {
		mint,
		tokenOwner: owner.publicKey,
		authority: staker,
		tokenStandard: TokenStandard.ProgrammableNonFungible,
	});
	//builder = builder.setVersion('legacy')
	if (setDelegate) {
		builder = delegateStakingV1(umi, {
			mint: mint,
			tokenOwner: owner.publicKey,
			authority: owner,
			delegate: staker.publicKey,
			tokenStandard: TokenStandard.ProgrammableNonFungible,
		}).add(builder);
	}


	builder = setComputeUnitPrice(umi, { microLamports: 5_000_000 }).add(setComputeUnitLimit(umi, { units: 5_000_000 })).add(builder);



	builder = builder.setFeePayer(payer);
	if (blockhash) {
		builder = builder.setBlockhash(blockhash);
		return builder.build(umi);
	}
	return builder.buildWithLatestBlockhash(umi);
}