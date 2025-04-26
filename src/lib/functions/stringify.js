import base58 from "bs58";

export function stringify(o, nice) {
	return JSON.stringify(o, (key, value) => {
		if (typeof value === 'bigint') return value.toString();
		if (ArrayBuffer.isView(value)) return [...value];
		return value;
	}, nice ? '\t' : null);
}


export function stringify2(o, nice) {
	return JSON.stringify(o, (key, value) => {
		if (typeof value === 'bigint') return value.toString();
		if (ArrayBuffer.isView(value)) return base58.encode(value);
		return value;
	}, nice ? '\t' : null);
}


export function stringify3(o, nice) {
	return JSON.stringify(o, (key, value) => {
		if (typeof value === 'bigint') return value.toString();
		if (ArrayBuffer.isView(value)) return '[' + [...value].toString() + ']';
		return value;
	}, nice ? '\t' : null);
}
