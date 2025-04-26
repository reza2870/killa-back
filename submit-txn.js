import { createMetadataAccountV3, fetchTokenRecordFromSeeds, fetchDigitalAssetWithTokenByMint, TokenStandard, delegateAuthorityItemV1, delegateCollectionItemV1, delegateCollectionV1, delegateDataItemV1, delegateDataV1, delegateProgrammableConfigItemV1, delegateProgrammableConfigV1 } from '@metaplex-foundation/mpl-token-metadata';
import { getUmi } from "./src/lib/functions/getUmi.js";
import { Signers } from "./src/lib/classes/signers.js";

import { config, db } from "./src/processes/globals.js";
import { writeFileSync } from 'fs';
import { stringify } from './src/lib/functions/stringify.js';
let umi = getUmi(Signers.get('8ge7wgzPXbns452TssmxC2sULXPj2soPQGAohL3eHMby'));
/*
let ret = await delegateCollectionV1(umi, {
	mint: config.sol.collections.cubs,
	authority: Signers.get('8ge7wgzPXbns452TssmxC2sULXPj2soPQGAohL3eHMby'),
	delegate: config.sol.accounts['collectionDelegate'],
	tokenStandard: TokenStandard.ProgrammableNonFungible,
}).sendAndConfirm(umi);
console.log(ret);
*/


let items = [
	{ id: 3384, mint: 'pcXVYwCZ8PuLuKrY5bhYPKP2JaZfu91bokp9JRw9C9S' }, // staked
	{ id: 3385, mint: 'CJDZw9sPq6AZzrbv1PLct13ckNramUYAb34gFhRYKL5W' }, //not staked
]
for(let item of items) {
	let res = await fetchDigitalAssetWithTokenByMint(umi, item.mint);
	writeFileSync('temp/token-data-' + item.id + '.json', stringify(res, true));
	console.log(item.id, res);

}

//createMetadataAccountV3(umi, {})