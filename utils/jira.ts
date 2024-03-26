import {
	colourStatus,
	colourUrl,
	descriptionToMarkdown,
	JiraContent,
} from './jira-utils.ts';

import { getCurrentBranch } from './git.ts';
import {
	fetchAndCacheJson,
	getToolsPath,
	readInput,
	writeDebug,
} from './general.ts';

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
	labels: string[];
};

const jiraFetch = (
	route: string,
	init?:
		| (RequestInit)
		| undefined,
) => {
	const jiraUrl = Deno.env.get('JIRA_URL');

	if (!jiraUrl) {
		throw new Error('JIRA_URL not set.');
	}

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

	const fullUrl = `${jiraUrl}${route.startsWith('/') ? '' : '/'}${route}`;
	const fullInit = {
		...init,
		headers: init?.headers
			? { ...init.headers, ...extraHeaders }
			: extraHeaders,
	};

	if (!init || init.method === 'GET') {
		const cacheFilename = route.replaceAll(/[^a-z0-9\-_]/ig, '+').replace(
			/^\+/,
			'',
		);

		return fetchAndCacheJson(fullUrl, fullInit, cacheFilename);
	}

	return fetch(fullUrl, fullInit);
};

export const getJiraIssueFromGitBranch = async (): Promise<string[]> => {
	const gitBranch = await getCurrentBranch();

	const matches = gitBranch.match(/\w+-\d+/g);

	return matches || [];
};

export const getJiraIssue = async (
	ticketHumanId: string,
): Promise<JiraIssue> => {
	const res = await jiraFetch(
		`/rest/api/3/issue/${ticketHumanId.toUpperCase()}`, // ?fields=summary,description,issuetype,status
		{
			method: 'GET',
		},
	);

	if (res.status !== 200) {
		console.error('res', res);

		throw new Error('Unexpected response from Jira');
	}

	const jiraJson = (await res.json()) as JiraIssue;

	writeDebug('issue.json', JSON.stringify(jiraJson, null, '\t'));

	return jiraJson;
};

export const displayJiraIssue = async (jiraIssue: JiraIssue): Promise<void> => {
	const jiraUrl = Deno.env.get('JIRA_URL');
	const { fields } = jiraIssue;
	console.info(
		`Ticket No.: ${jiraIssue.key} - ${
			colourUrl(`${jiraUrl}/browse/${jiraIssue.key}`)
		}`,
	);
	console.info(
		'Assignee:',
		fields.assignee?.displayName
			? fields.assignee?.displayName
			: 'Not assigned',
	);
	console.info('Status:', colourStatus(fields.status.name));
	console.info('Summary:', fields.summary);
	console.info(
		`Description:\n${await descriptionToMarkdown(fields.description)}`,
	);

	Deno.writeTextFileSync(
		`${getToolsPath()}/.tmp.txt`,
		`${jiraUrl}/browse/${jiraIssue.key}`,
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
	issueKey: string,
): Promise<{ id: string; name: string }[]> => {
	const res = await jiraFetch(`/rest/api/2/issue/${issueKey}/transitions`, {
		method: 'GET',
	});

	const resJson = await res.json() as {
		transitions: { id: string; name: string }[];
	};

	writeDebug(
		`issueTransition-${issueKey}.json`,
		JSON.stringify(resJson, null, '\t'),
	);

	return resJson.transitions;
};

export const applyJiraIssueTransition = async (
	issueKey: string,
	transitionNameOrId: string,
	skipValidation = false,
): Promise<false | string> => {
	let transitionId = transitionNameOrId;
	let transitionName = '';

	if (!skipValidation) {
		const validTransitions = await listJiraIssueTransitions(issueKey);

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

		transitionId = desiredTransitions[0].id;
		transitionName = desiredTransitions[0].name;
	}

	const route = `/rest/api/3/issue/${issueKey}/transitions`;

	const res = await jiraFetch(route, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			transition: {
				id: transitionId,
			},
		}),
	});

	if (res.status === 204) {
		return transitionName || transitionId;
	}

	if (res instanceof Response) {
		console.error('res.text()', await res.text());
	}

	console.error('res', res);
	console.error('route', route);
	console.error('desiredTransitions', {
		id: transitionId,
		name: transitionName,
	});
	throw new Error();
};

export const listAndApplyJiraTransition = async (jiraTicketNumber: string) => {
	const transitions = await listJiraIssueTransitions(
		jiraTicketNumber,
	);

	const prompt = [
		'Choose a new status:',
		...transitions.map((transition, i) => {
			return `${i + 1}: ${transition.name}`;
		}),
		'0: Do nothing',
	].join('\n');

	const temp = await readInput(prompt, true);

	if (temp === '0') {
		return '0';
	}

	const { id: newTransitionId, name: newTransitionName } =
		transitions[parseInt(temp, 10) - 1];

	const result = await applyJiraIssueTransition(
		jiraTicketNumber,
		newTransitionId,
		true,
	);

	return result ? newTransitionName : false;
};

export const getMyJiraUser = async () => {
	const res = await jiraFetch('/rest/api/2/myself', { method: 'GET' });

	const resJson = await res.json() as {
		name: string;
		displayName: string;
		accountId: string;
		emailAddress: string;
	};

	writeDebug('my-jira-user.json', JSON.stringify(resJson, null, '  '));

	return resJson;
};

export const assignToJiraIssue = async (
	issueKey: string,
	assigneeAccountId?: string,
): Promise<false | string> => {
	const route = `/rest/api/2/issue/${issueKey}/assignee`;
	const res = await jiraFetch(route, {
		method: 'PUT',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			accountId: assigneeAccountId || null,
		}),
	});

	if (res.status === 204) {
		return 'ok';
	}

	if (res instanceof Response) {
		console.error('res.text()', await res.text());
	}

	console.error('res', res);
	console.error('route', route);
	console.error('assigneeName', assigneeAccountId);
	throw new Error();
};

const commentBodyToMd = (text: string): string => {
	return text
		.replace(/{{/g, '`').replace(/}}/g, '`') // unformatted text"
		.replace(/{noformat}/g, '```') // code blocks
		.replace(/\[.+\|.+\|?.*\]/g, (match) => {
			const [name, url] = match.replace(/^\[/, '').replace(/\]$/, '').split(
				'|',
			);

			if (name !== url) {
				return `[${name}](${colourUrl(url)}`;
			}

			return colourUrl(url);
		}); // URLs
};

export const getJiraIssueComments = async (ticketNumber: string) => {
	const res1 = await jiraFetch(`/rest/api/2/issue/${ticketNumber}/comment`, {
		method: 'GET',
	});
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
		mdBody: commentBodyToMd(c.body),
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
		const url =
			`/rest/agile/1.0/board/${boardId}/sprint?startAt=${i}&maxResults=${limit}`;
		const sprintsRes = await jiraFetch(url, { method: 'GET' });
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

		// console.info(`Trying page ${i + 1} of sprints.`);

		await (new Promise((resolve) => {
			setTimeout(resolve, 90);
		}));
	}

	if (!activeSprint) {
		throw new Error("Couldn't find active sprint.");
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

	const sprintIssuesRes = await jiraFetch(
		`/rest/agile/1.0/board/${boardId}/sprint/${interestedSprint.id}/issue`, // ?fields=summary,assignee,status
		{ method: 'GET' },
	);
	const sprintIssues = await sprintIssuesRes.json() as {
		issues: {
			key: string;
			fields: {
				summary: string;
				assignee: null | { displayName: string };
				status: { name: string };
				labels: string[];
			};
		}[];
	};

	writeDebug('sprint-issues.json', JSON.stringify(sprintIssues, null, '\t'));

	const issuesByStatus: {
		[k: string]: MyJiraStatus[];
	} = {};

	for (let i = 0; i < sprintIssues.issues.length; i++) {
		const { key, fields } = sprintIssues.issues[i];
		const { summary, assignee, status, labels } = fields;

		if (!issuesByStatus[status.name]) {
			issuesByStatus[status.name] = [];
		}

		issuesByStatus[status.name].push({
			status: status.name,
			summary,
			assignee: assignee?.displayName,
			key,
			labels,
		});
	}

	return { sprint: interestedSprint, issuesByStatus };
};
