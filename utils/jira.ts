import { descriptionToMarkdown, JiraContent } from './jira-utils.ts';

import { getCurrentBranch } from './git.ts';
import { getToolsPath, writeDebug } from './general.ts';

export type JiraIssue = {
	key: string;
	fields: {
		status: { name: string };
		summary: string;
		description: { type: string; content: JiraContent };
		assignee: { displayName: string };
	};
};

export type JiraSprint = {
	state: string;
	id: string;
	name: string;
	goal: string;
	startDate: string;
	endDate: string;
};

export type MyJiraStatus = {
	status: string;
	summary: string;
	assignee?: string;
	key: string;
};

const JIRA_URL = Deno.env.get('JIRA_URL');

if (!JIRA_URL) {
	throw new Error('JIRA_URL not set.');
}

// @todo(nick-ng): cache get requests
const jiraFetch = (
	url: string,
	init?:
		| (RequestInit)
		| undefined,
) => {
	const jiraCookie = Deno.env.get('JIRA_COOKIE');
	const atlassianUser = Deno.env.get('ATLASSIAN_USER');
	const atlassianAPIToken = Deno.env.get('ATLASSIAN_API_TOKEN');

	let authSet = false;
	const extraHeaders: { [k: string]: string } = {};

	if (atlassianUser && atlassianAPIToken) {
		const basicAuthString = btoa(`${atlassianUser}:${atlassianAPIToken}`);

		extraHeaders['Authorization'] = `Basic ${basicAuthString}`;

		authSet = true;
	} else if (jiraCookie) {
		console.info('Using Jira Cookie');
		extraHeaders['Cookie'] = jiraCookie;

		authSet = true;
	}

	if (!init?.headers && !authSet) {
		throw new Error(
			'ATLASSIAN_USER and/or ATLASSIAN_API_TOKEN  not set. https://id.atlassian.com/manage-profile/security/api-tokens',
		);
	}

	return fetch(url, {
		...init,
		headers: init?.headers
			? { ...init.headers, ...extraHeaders }
			: extraHeaders,
	});
};

export const getJiraIssueFromGitBranch = async (): Promise<string[]> => {
	const gitBranch = await getCurrentBranch();

	const matches = gitBranch.match(/\w+-\d+/g);

	return matches || [];
};

export const getJiraIssue = async (
	ticketHumanId: string,
): Promise<JiraIssue> => {
	const url = `${JIRA_URL}/rest/api/3/issue/${ticketHumanId.toUpperCase()}`; // ?fields=summary,description,issuetype,status

	const res = await jiraFetch(url, {
		method: 'GET',
	});

	if (res.status !== 200) {
		console.error('res', res);

		throw new Error('Unexpected response from Jira');
	}

	const jiraJson = (await res.json()) as JiraIssue;

	writeDebug('issue.json', JSON.stringify(jiraJson, null, '\t'));

	return jiraJson;
};

export const displayJiraIssue = (jiraIssue: JiraIssue): void => {
	const { fields } = jiraIssue;
	console.info(
		`Ticket No.: ${jiraIssue.key} - ${JIRA_URL}/browse/${jiraIssue.key}`,
	);
	console.info(
		'Assignee:',
		fields.assignee?.displayName
			? fields.assignee?.displayName
			: 'Not assigned',
	);
	console.info('Status:', fields.status.name);
	console.info('Summary:', fields.summary);
	console.info(
		`Description:\n${descriptionToMarkdown(fields.description)}`,
	);

	Deno.writeTextFileSync(
		`${getToolsPath()}/.tmp.txt`,
		`${JIRA_URL}/browse/${jiraIssue.key}`,
	);

	// const clipboardCmd = new Deno.Command('xclip', {
	// 	args: [
	// 		'-selection',
	// 		'clipboard',
	// 		'-i',
	// 		`${TOOLS_PATH}/.tmp.txt`,
	// 	],
	// });

	// await clipboardCmd.output();
};

export const listJiraIssueTransitions = async (
	issueHumanId: string,
): Promise<{ id: string; name: string }[]> => {
	const url = `${JIRA_URL}/rest/api/2/issue/${issueHumanId}/transitions`;
	const res = await jiraFetch(url, { method: 'GET' });

	const resJson = await res.json() as {
		transitions: { id: string; name: string }[];
	};

	writeDebug(
		`issueTransition-${issueHumanId}.json`,
		JSON.stringify(resJson, null, '\t'),
	);

	return resJson.transitions;
};

export const applyJiraIssueTransition = async (
	issueHumanId: string,
	transitionNameOrId: string,
): Promise<false | string> => {
	const validTransitions = await listJiraIssueTransitions(issueHumanId);

	const desiredTransitions = validTransitions.filter((t) =>
		t.id === transitionNameOrId ||
		t.name.toUpperCase().startsWith(transitionNameOrId.toUpperCase())
	);

	if (desiredTransitions.length === 0) {
		console.error(`${transitionNameOrId} does not match a valid transition.`);
		return false;
	}

	if (desiredTransitions.length > 1) {
		console.error(`${transitionNameOrId} matches too many transitions.`);
		desiredTransitions.forEach((t) => console.info(t.name));
		return false;
	}

	const url = `${JIRA_URL}/rest/api/3/issue/${issueHumanId}/transitions`;

	const res = await jiraFetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			transition: {
				id: desiredTransitions[0].id,
			},
		}),
	});

	if (res.status === 204) {
		return desiredTransitions[0].name;
	}

	console.error('res.text()', await res.text());
	console.error('res', res);
	console.error('url', url);
	console.error('desiredTransitions', desiredTransitions);
	throw new Error();
};

const getMDBody = (text: string): string => {
	return text.replace(/{{/g, '`').replace(/}}/g, '`');
};

export const getJiraIssueComments = async (ticketNumber: string) => {
	const url1 = `${JIRA_URL}/rest/api/2/issue/${ticketNumber}/comment`;

	const res1 = await jiraFetch(url1, { method: 'GET' });
	const res1Json = await res1.json() as {
		comments: {
			author: { displayName: string };
			body: string;
			created: string;
		}[];
	};

	writeDebug('issue-comments.json', JSON.stringify(res1Json, null, '\t'));

	return res1Json.comments.map((c) => ({
		...c,
		createdDate: new Date(c.created),
		mdBody: getMDBody(c.body),
	}));
};

export const getJiraBoard = async (
	boardId: string,
	sprintAdjustment = 0,
): Promise<{
	sprint: JiraSprint;
	issuesByStatus: { [status: string]: MyJiraStatus[] };
}> => {
	let activeSprint: JiraSprint | undefined = undefined;

	const checkAllSprints = !isNaN(sprintAdjustment) && sprintAdjustment !== 0;

	const limit = 50;

	const allSprints: JiraSprint[] = [];

	for (let i = 0; i < limit * 1000; i += limit) {
		const url1 =
			`${JIRA_URL}/rest/agile/1.0/board/${boardId}/sprint?start=${i}&limit=${limit}`;

		const sprintsRes = await jiraFetch(url1, { method: 'GET' });
		const sprints = await sprintsRes.json() as {
			values: JiraSprint[];
		};

		writeDebug(
			`sprints${i.toString().padStart(4, '0')}.json`,
			JSON.stringify(sprints, null, '\t'),
		);

		if (checkAllSprints) {
			sprints.values.forEach((sprint) => {
				if (!allSprints.map((s) => s.id).includes(sprint.id)) {
					allSprints.push(sprint);
				}
			});
		}

		activeSprint = sprints.values.find((s) => s.state === 'active');

		if (activeSprint) {
			break;
		}

		console.info(`Trying page ${i + 1} of sprints.`);
	}

	if (!activeSprint) {
		throw new Error('Couldn\'t find active sprint.');
	}

	let interestedSprint = activeSprint;

	if (checkAllSprints) {
		allSprints.sort((a, b) => {
			const aDate = new Date(a.startDate);
			const bDate = new Date(b.startDate);

			return aDate.valueOf() - bDate.valueOf();
		});

		const indexOfActiveSprint = allSprints.findIndex((s) =>
			s.id === (activeSprint as JiraSprint).id
		);

		interestedSprint = allSprints[indexOfActiveSprint + sprintAdjustment];
	}

	const url2 =
		`${JIRA_URL}/rest/agile/1.0/board/${boardId}/sprint/${interestedSprint.id}/issue`; // ?fields=summary,assignee,status

	const sprintIssuesRes = await jiraFetch(url2, { method: 'GET' });
	const sprintIssues = await sprintIssuesRes.json() as {
		issues: {
			key: string;
			fields: {
				summary: string;
				assignee: null | { displayName: string };
				status: { name: string };
			};
		}[];
	};

	writeDebug('sprint-issues.json', JSON.stringify(sprintIssues, null, '\t'));

	const issuesByStatus: {
		[k: string]: MyJiraStatus[];
	} = {};

	for (let i = 0; i < sprintIssues.issues.length; i++) {
		const { key, fields } = sprintIssues.issues[i];
		const { summary, assignee, status } = fields;

		if (!issuesByStatus[status.name]) {
			issuesByStatus[status.name] = [];
		}

		issuesByStatus[status.name].push({
			status: status.name,
			summary,
			assignee: assignee?.displayName,
			key,
		});
	}

	return { sprint: interestedSprint, issuesByStatus };
};
