export async function processChunks(array, size, processChunk) {
	// Function to split the array into chunks
	array = (typeof (array) != 'array') ? [...array] : array;
	const chunkArray = (array, size) => {
		const chunks = [];
		for (let i = 0; i < array.length; i += size) {
			chunks.push(array.slice(i, i + size));
		}
		return chunks;
	};


	// Split the array into chunks
	const chunks = chunkArray(array, size);

	// Process each chunk asynchronously using the provided callback
	for (const chunk of chunks) {
		await processChunk(chunk);
	}
}
