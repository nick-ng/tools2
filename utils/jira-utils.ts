import { getDebugPath, writeDebug } from './general.ts';

type JiraContentText = {
	type: 'text';
	text: string;
	marks?: {
		type: string;
	}[];
};

type JiraContentHeading = {
	type: 'heading';
	attrs: { level: number };
	content: JiraContentText[];
};

type JiraContentParagraph = {
	type: 'paragraph';
	content: JiraContentText[];
};

type JiraContentListItem = {
	type: 'listItem';
	content: (JiraContentParagraph | JiraContentBulletList)[];
};

type JiraContentBulletList = {
	type: 'bulletList';
	content: JiraContentListItem[];
};

export type JiraContent = (
	| JiraContentText
	| JiraContentHeading
	| JiraContentParagraph
	| JiraContentListItem
	| JiraContentBulletList
)[];

const parseText = (content: JiraContentText): string => {
	return content.text;
};

const parseHeading = ({ attrs, content }: JiraContentHeading): string => {
	const { level } = attrs;

	return ['\n\n', ''.padStart(level, '#'), ' ', ...content.map(parseText)].join(
		'',
	);
};

const parseParagraph = ({ content }: JiraContentParagraph): string => {
	return ['\n\n', ...content.map(parseText)].join(
		'',
	);
};

let parseBulletList = (_a: JiraContentBulletList) => 'a';

const parseListItem = ({ content }: JiraContentListItem) => {
	return content.map((c) => {
		if (c.type === 'bulletList') {
			return parseBulletList(c).replaceAll('\n', '\n  ');
		} else if (c.type === 'paragraph') {
			return ['\n- ', parseParagraph(c).trim()].join('');
		}
	}).join('');
};

parseBulletList = ({ content }: JiraContentBulletList): string => {
	return content.map(parseListItem).join('');
};

export const descriptionToMarkdown = (
	{ content, type }: { content: JiraContent; type: string },
): string => {
	if (type !== 'doc') {
		writeDebug(
			'description-to-markdown.json',
			JSON.stringify(content, null, '\t'),
		);

		throw new Error(
			`Unexpected Jira descritpion ${type}. See ${getDebugPath()}/.description-to-markdown.json for details.`,
		);
	}

	return content.map((c) => {
		switch (c.type) {
			case 'text': {
				return parseText(c);
			}
			case 'heading': {
				return parseHeading(c);
			}
			case 'paragraph': {
				return parseParagraph(c);
			}
			case 'bulletList': {
				return parseBulletList(c);
			}
			default: {
				throw new Error(`Unexpected Jira content: ${JSON.stringify(c)}`);
			}
		}
	}).join('').trim().replaceAll(/\n{3,}/g, '\n\n');
};
