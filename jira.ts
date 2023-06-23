import { readInput } from './utils/general.ts';
import { descriptionToMarkdown } from './utils/jira-utils.ts';
import {
	applyJiraIssueTransition,
	getJiraBoard,
	getJiraIssueFromGitBranch,
	getJiraTicket,
	listJiraIssueTransitions,
} from './utils/jira.ts';

const getStatusValue = (status: string): number => {
	switch (status) {
		case 'In Progress': {
			return 10;
		}
		case 'Review': {
			return 20;
		}
		case 'Done': {
			return 30;
		}
		default:
			return 9999;
	}
};

const main = async () => {
	switch (Deno.args[0]) {
		case 'board': {
			if (!Deno.args[1]) {
				console.error('Missing board number.');
				console.info('Usage: jira board <board-number>');
				return;
			}
			const result = await getJiraBoard(Deno.args[1]);
			Object.entries(result).sort((a, b) => {
				return getStatusValue(a[0]) - getStatusValue(b[0]);
			}).forEach(([status, issues]) => {
				console.info(`\n${status}`);
				issues.forEach((issue) => {
					console.info(
						`- ${issue.key}: ${issue.summary} ${
							issue.assignee ? `- ${issue.assignee}` : ''
						}`,
					);
				});
			});
			return;
		}
		case 'ticket':
		case 'issue':
		default: {
			let jiraTicketNumber = Deno.args[1];

			if (!jiraTicketNumber) {
				jiraTicketNumber = await getJiraIssueFromGitBranch();
			}

			const jiraActionPayload = Deno.args[2] || '';

			const [jiraAction, jiraPayload] = jiraActionPayload.split(':');

			switch (jiraAction) {
				case 'status': {
					let payload = jiraPayload;

					if (!payload) {
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
							return;
						}

						payload = transitions[parseInt(temp, 10) - 1].name;
					}

					if (payload) {
						const result = await applyJiraIssueTransition(
							jiraTicketNumber,
							payload,
						);
						if (result) {
							console.info(`${jiraTicketNumber} is now "${result}"`);
						} else {
							console.error(
								`Error when updating status of ${jiraTicketNumber}`,
							);
						}
					}

					return;
				}
				case 'get':
				default: {
					const jiraTicket = await getJiraTicket(jiraTicketNumber);

					console.info('Ticket No.:', jiraTicket.key);
					console.info('Status:', jiraTicket.fields.status.name);
					console.info('Summary:', jiraTicket.fields.summary);
					console.info(
						`Description:
${descriptionToMarkdown(jiraTicket.fields.description)}`,
					);
				}
			}
		}
	}
};

main();
