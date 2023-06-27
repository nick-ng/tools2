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

const MONTHS = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec',
];

export const formatDate = (date: Date) =>
	`${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;

export const getToolsPath = () => {
	return Deno.env.get('TOOLS2_PATH');
};

export const getDebugPath = () => `${getToolsPath()}/debug`;

export const writeDebug = (
	filename: string,
	message: string,
): void => {
	const debugPath = getDebugPath();

	Deno.mkdirSync(debugPath, { recursive: true });

	Deno.writeTextFileSync(
		`${debugPath}/.${filename}`,
		message,
	);
};
