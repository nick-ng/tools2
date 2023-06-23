export const readInput = async (prompt = 'Enter your text:', trim = false) => {
	console.info(prompt);

	const decoder = new TextDecoder();

	const buf = new Uint8Array(4096);

	const bufBytes = await Deno.stdin.read(buf);

	if (typeof bufBytes !== 'number') {
		throw new Error('something went wrong when getting inputs');
	}

	if (trim) {
		return decoder.decode(buf.subarray(0, bufBytes)).trim();
	}

	return decoder.decode(buf.subarray(0, bufBytes)).replace(/\n$/, '');
};
