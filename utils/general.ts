const CACHE_MAX_AGE_MS = 1000 * 60 * 5; // 5 minutes

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

export const getCachePath = () => `${getToolsPath()}/cache`;
export const CACHE_PATH = `${getToolsPath()}/cache`;

export const writeCache = (filename: string, content: string): void => {
	Deno.mkdirSync(CACHE_PATH, { recursive: true });

	Deno.writeTextFile(
		`${CACHE_PATH}/.${filename}`,
		content,
	);
};

export const readCache = (filename: string): string | null => {
	try {
		const result = Deno.readTextFileSync(
			`${CACHE_PATH}/.${filename}`,
		);

		return result;
	} catch (_e) {
		// noop
	}

	return null;
};

export const fetchAndCacheJson = async (
	fullUrl: string,
	fullInit:
		| (RequestInit)
		| undefined,
	cacheFilename: string,
): Promise<
	{
		status: number;
		// deno-lint-ignore no-explicit-any
		json: () => Promise<any>;
	} | Response
> => {
	const existingResponseString = readCache(cacheFilename);

	if (existingResponseString) {
		try {
			const existingResponse = JSON.parse(existingResponseString) as {
				timestamp: number;
				status: number;
				// deno-lint-ignore no-explicit-any
				body: any;
			};

			if (existingResponse.timestamp > (Date.now() - CACHE_MAX_AGE_MS)) {
				(async () => {
					const res = await fetch(fullUrl, fullInit);

					const newCacheValue = {
						timestamp: Date.now(),
						status: res.status,
						body: await res.json(),
					};

					writeCache(cacheFilename, JSON.stringify(newCacheValue, null, '  '));
				})();

				return {
					status: existingResponse.status,
					json: () => Promise.resolve(existingResponse.body),
				};
			}
		} catch (_e) {
			// noop
		}
	}

	const res = await fetch(fullUrl, fullInit);

	const newCacheValue = {
		timestamp: Date.now(),
		status: res.status,
		body: await res.json(),
	};

	writeCache(cacheFilename, JSON.stringify(newCacheValue, null, '  '));

	return {
		status: newCacheValue.status,
		json: () => Promise.resolve(newCacheValue.body),
	};
};
