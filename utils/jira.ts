import type { JiraContent } from './jira-utils.ts';

import { getCurrentBranch } from './git.ts';

export type JiraIssue = {
	key: string;
	fields: {
		status: { name: string };
		summary: string;
		description: { type: string; content: JiraContent };
	};
};

const JIRA_URL = Deno.env.get('JIRA_URL');

if (!JIRA_URL) {
	throw new Error('JIRA_URL not set.');
}

const DEBUG_PATH = '/home/nickthree/gits/tools2/';

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

export const getJiraIssueFromGitBranch = async (): Promise<string> => {
	const gitBranch = await getCurrentBranch();

	const branchParts = gitBranch.split('/');

	const jiraTicket = branchParts.find((b) => b.match(/\w+-\d+/));

	if (!jiraTicket) {
		throw new Error(
			`Can't figure out Jira ticket from branch name: ${gitBranch}`,
		);
	}

	return jiraTicket;
};

export const getJiraTicket = async (
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

	Deno.writeTextFile(
		`${DEBUG_PATH}.issue.json`,
		JSON.stringify(jiraJson, null, '\t'),
	);

	return jiraJson;
};

export const listJiraIssueTransitions = async (
	issueHumanId: string,
): Promise<{ id: string; name: string }[]> => {
	const url = `${JIRA_URL}/rest/api/2/issue/${issueHumanId}/transitions`;
	const res = await jiraFetch(url, { method: 'GET' });

	const resJson = await res.json() as {
		transitions: { id: string; name: string }[];
	};

	Deno.writeTextFile(
		`${DEBUG_PATH}.issueTransition-${issueHumanId}.json`,
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

export const getJiraBoard = async (boardId: string) => {
	let activeSprint: { state: string; id: string } | undefined = undefined;

	const limit = 50;

	for (let i = 0; i < limit * 1000; i += limit) {
		const url1 =
			`${JIRA_URL}/rest/agile/1.0/board/${boardId}/sprint?start=${i}&limit=${limit}`;

		const sprintsRes = await jiraFetch(url1, { method: 'GET' });
		const sprints = await sprintsRes.json() as {
			values: { state: string; id: string }[];
		};

		Deno.writeTextFile(
			`${DEBUG_PATH}.sprints${i.toString().padStart(4, '0')}.json`,
			JSON.stringify(sprints, null, '\t'),
		);

		activeSprint = sprints.values.find((s) => s.state === 'active');

		if (activeSprint) {
			break;
		}

		console.info(`Trying page ${i + 1} of sprints.`);
	}

	if (!activeSprint) {
		throw new Error('Couldn\'t find active sprint.');
	}

	const url2 =
		`${JIRA_URL}/rest/agile/1.0/board/${boardId}/sprint/${activeSprint.id}/issue`; // ?fields=summary,assignee,status

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

	Deno.writeTextFile(
		`${DEBUG_PATH}.sprint-issues.json`,
		JSON.stringify(sprintIssues, null, '\t'),
	);

	const issuesByStatus: {
		[k: string]: {
			status: string;
			summary: string;
			assignee?: string;
			key: string;
		}[];
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

	return issuesByStatus;
};
