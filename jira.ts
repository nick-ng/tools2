import { formatDate, readInput } from './utils/general.ts';
import {
	applyJiraIssueTransition,
	displayJiraIssue,
	getJiraBoard,
	getJiraIssue,
	getJiraIssueComments,
	getJiraIssueFromGitBranch,
	listJiraIssueTransitions,
} from './utils/jira.ts';

const JIRA_URL = Deno.env.get('JIRA_URL');

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
	// @todo(nick-ng): assign yourself to an issue
	switch (Deno.args[0]) {
		case 'board': {
			if (!Deno.args[1]) {
				console.error('Missing board number.');
				console.info('Usage: jira board <board-number>');
				return;
			}

			const { sprint, issuesByStatus } = await getJiraBoard(
				Deno.args[1],
				parseInt(Deno.args[2], 0),
			);

			const msLeft = new Date(sprint.endDate).valueOf() - new Date().valueOf();
			const daysLeft = msLeft / (1000 * 60 * 60 * 24);

			console.info(`\nToday: ${formatDate(new Date())}\n`);

			if (sprint.name) {
				console.info(
					`Sprint: ${sprint.name} (${
						formatDate(new Date(sprint.startDate))
					} - ${formatDate(new Date(sprint.endDate))})`,
				);
			} else {
				console.info(
					`${formatDate(new Date(sprint.startDate))} - ${
						formatDate(new Date(sprint.endDate))
					}`,
				);
			}

			if (sprint.goal) {
				console.info(`Goal: ${sprint.goal}`);
			}

			if (daysLeft > 0) {
				console.info(`Days left: ${daysLeft.toFixed(1)}`);
			} else {
				console.info(`Sprint over (${daysLeft.toFixed(1)} days)`);
			}

			Object.entries(issuesByStatus).sort((a, b) => {
				return getStatusValue(a[0]) - getStatusValue(b[0]);
			}).forEach(([status, issues], i) => {
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
		case 'ticket-number':
		case 'issue-number': {
			const jiraTicketNumber = (await getJiraIssueFromGitBranch())[0];

			console.info(jiraTicketNumber);

			break;
		}
		case 'ticket':
		case 'issue':
		default: {
			let jiraTicketNumber = Deno.args[1];

			if (!jiraTicketNumber) {
				jiraTicketNumber = (await getJiraIssueFromGitBranch())[0];
			}

			displayJiraIssue(await getJiraIssue(jiraTicketNumber));

			const comments = await getJiraIssueComments(jiraTicketNumber);

			if (comments.length > 0) {
				console.info('\nComments - newest first');
				comments.sort((a, b) => {
					return b.createdDate.valueOf() - a.createdDate.valueOf();
				}).forEach(({ author, mdBody, createdDate }) => {
					console.info(
						`${formatDate(createdDate)}: ${author.displayName}`,
					);
					console.info(mdBody, '\n');
				});
			} else {
				console.info('\nNo comments');
			}

			const jiraActionPayload = Deno.args[2] || '';

			const [jiraAction, jiraPayload] = jiraActionPayload.split(':');

			switch (jiraAction) {
				case 'comment':
				case 'comments': {
					switch (jiraPayload) {
						case 'edit':
						case 'rich': {
							const statusCmd = new Deno.Command('open', {
								args: [`${JIRA_URL}/browse/${jiraTicketNumber}`],
							});

							await statusCmd.output();

							break;
						}

						default: {
							break;
						}
					}

					break;
				}
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

				default: {
					// noop
				}
			}
		}
	}
};

main();
