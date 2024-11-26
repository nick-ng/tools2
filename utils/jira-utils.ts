import { getDebugPath, writeDebug } from './general.ts';

type JiraContentText = {
	type: 'text';
	text: string;
	marks?: {
		type: string;
		attrs: {
			[key: string]: string;
		};
	}[];
};

type JiraContentInlineCard = {
	type: 'inlineCard',
	attrs: {
		url: string
	}
}

type JiraContentHeading = {
	type: 'heading';
	attrs: { level: number };
	content: JiraContentText[];
};

type JiraContentParagraph = {
	type: 'paragraph' | 'codeBlock';
	content: JiraContentText[];
};

type JiraContentListItem = {
	type: 'listItem';
	content:
		(JiraContentParagraph | JiraContentBulletList | JiraContentOrderedList)[];
};

type JiraContentBulletList = {
	type: 'bulletList';
	content: JiraContentListItem[];
};

type JiraContentOrderedList = {
	type: 'orderedList';
	content: JiraContentListItem[];
};

type JiraContentMediaSingle = {
	type: 'mediaSingle';
	content: {
		type: string;
		attrs: {
			id: string;
			type: string;
			collection: string;
			width: number;
			height: number;
		};
	}[];
};

type JiraContentMediaGroup = {
	type: 'mediaGroup';
	content: {
		type: string;
		attrs: {
			id: string;
			type: string;
			collection: string;
			width?: number;
			height?: number;
		};
	}[];
};

type JiraContentRule = {
	type: 'rule'; // <hr />
};

export type JiraContent = (
	| JiraContentText
	| JiraContentInlineCard
	| JiraContentHeading
	| JiraContentParagraph
	| JiraContentListItem
	| JiraContentBulletList
	| JiraContentOrderedList
	| JiraContentMediaSingle
	| JiraContentMediaGroup
	| JiraContentRule
)[];

export const colourUrl = (url: string): string => {
	return `\x1b[4m\x1b[36m${url}\x1b[0m`;
};

export const colourStatus = (status: string): string => {
	switch (status.toLowerCase()) {
		case 'in progress': {
			return `\x1b[1m\x1b[34m${status}\x1b[0m`;
		}
		case 'done': {
			return `\x1b[32m${status}\x1b[0m`;
		}
		case 'testing':
		case 'review': {
			return `\x1b[1m\x1b[33m${status}\x1b[0m`;
		}
		case 'blocked': {
			return `\x1b[31m${status}\x1b[0m`;
		}
		default: {
			return `\x1b[1m\x1b[90m${status}\x1b[0m`;
		}
	}
};

let parseContent = (_c: JiraContent[number]): string => '';

const parseText = (content: JiraContentText): string => {
	const httpHrefAttr = content.marks?.find((m) => m.type === 'link')?.attrs
		?.href;

	if (httpHrefAttr) {
		if (httpHrefAttr === content?.text) {
			return colourUrl(httpHrefAttr);
		}

		return `[${content?.text}](${colourUrl(httpHrefAttr)}`;
	}

	return content?.text || '';
};

const parseInlineCard = (content: JiraContentInlineCard): string => {
	return `(${content.attrs.url})`
}

const parseHeading = ({ attrs, content }: JiraContentHeading): string => {
	const { level } = attrs;

	return ['\n\n', ''.padStart(level, '#'), ' ', ...content.map(parseContent)].join(
		'',
	);
};

const parseParagraph = (
	{ content }: JiraContentParagraph,
): string => {
	return ['\n\n', ...content.map(parseContent)].join(
		'',
	);
};

let parseBulletList = (_a: JiraContentBulletList) => '';
let parseOrderedList = (_a: JiraContentOrderedList) => '';

const parseListItem = (c: JiraContentListItem, i?: number) => {
	const { content } = c;
	return content.map((c, j) => {
		if (c.type === 'bulletList') {
			return parseBulletList(c).replaceAll('\n', '\n  ');
		} else if (c.type === 'orderedList') {
			return parseOrderedList(c).replaceAll('\n', '\n  ');
		} else {
			if (typeof i === 'number') {
				if (j === 0) {
					return ['\n', i, '. ', parseContent(c).trim()].join('');
				}

				return [
					'\n  ',
					''.padStart(i.toString().length, ' '),
					parseContent(c).trim(),
				].join('');
			}
			return ['\n- ', parseContent(c).trim()].join('');
		}
	}).join('');
};

parseBulletList = (
	{ content }: JiraContentBulletList | JiraContentOrderedList,
): string => {
	return content.map((listItem) => parseListItem(listItem)).join('');
};

parseOrderedList = ({ content }: JiraContentOrderedList): string => {
	return content.map((listItem, i) => parseListItem(listItem, i + 1)).join('');
};

const parseMediaSingle = (
	{ content }: JiraContentMediaSingle | JiraContentMediaGroup,
): string => {
	// blob:https://JIRA_URL/<?-uuid>#media-blob-url=true&id=<content[0].attrs.id>&contextId=<?-int>&collection=

	return content.map((c) => {
		if (
			typeof c.attrs.width === 'number' || typeof c.attrs.height === 'number'
		) {
			return '\n\n_picture-goes-here_\n\n';
		}

		return '\n\n_file-goes-here_\n\n';
	}).join('\n');
};

parseContent = (c: JiraContent[number]) => {
	switch (c.type) {
		case 'text': {
			return parseText(c);
		}
		case 'inlineCard': {
			return parseInlineCard(c)
		}
		case 'heading': {
			return parseHeading(c);
		}
		case 'paragraph':
		case 'codeBlock': {
			return parseParagraph(c);
		}
		case 'bulletList': {
			return parseBulletList(c);
		}
		case 'orderedList': {
			return parseOrderedList(c);
		}
		case 'mediaGroup':
		case 'mediaSingle': {
			return parseMediaSingle(c);
		}
		case 'rule': {
			return `\n\n${''.padStart(80, '-')}\n\n`;
		}
		default: {
			return `\n\n${JSON.stringify(c, null, '  ')}\n\n`;
		}
	}
};

export const descriptionToMarkdown = async (
	p?: { content: JiraContent; type: string } | null,
): Promise<string> => {
	if (!p) {
		return 'No description.';
	}

	const { content, type } = p;
	if (type !== 'doc') {
		writeDebug(
			'description-to-markdown.json',
			JSON.stringify(content, null, '\t'),
		);

		throw new Error(
			`Unexpected Jira descritpion ${type}. See ${getDebugPath()}/.description-to-markdown.json for details.`,
		);
	}

	try {
		const parsedContent = await Promise.all(content.map(parseContent));
		return parsedContent.join('').trim().replaceAll(/\n{3,}/g, '\n\n');
	} catch (e) {
		writeDebug(
			'description-to-markdown-unexpected.json',
			JSON.stringify(content, null, '\t'),
		);

		throw e;
	}
};
