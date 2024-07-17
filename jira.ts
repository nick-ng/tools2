import { formatDate, getToolsPath } from './utils/general.ts';
import { colourStatus } from './utils/jira-utils.ts';
import {
	applyJiraIssueTransition,
	assignToJiraIssue,
	displayJiraIssue,
	getJiraBoard,
	getJiraIssue,
	getJiraIssueComments,
	getJiraIssueFromGitBranch,
	getMyJiraUser,
	listAndApplyJiraTransition,
} from './utils/jira.ts';

const JIRA_URL = Deno.env.get('JIRA_URL');
const DEFAULT_MAX_ISSUES = 999;

const getStatusValue = (status: string): number => {
	switch (status) {
		case 'in progress': {
			return 10;
		}
		case 'testing':
		case 'review': {
			return 20;
		}
		case 'done': {
			return 30;
		}
		default:
			return 9999;
	}
};

const getCurrentTicketNumber = (): string => {
	try {
		const jiraTicketNumber = Deno.readTextFileSync(
			`${getToolsPath()}/current.txt`,
		);
		console.info('Current Jira ticket:', jiraTicketNumber);
		return jiraTicketNumber;
	} catch (e) {
		console.info("\ncouldn't read current.txt\n");

		throw e;
	}
};

const displayInfo = (info: string[]): void => {
	for (let i = 0; i < info.length; i++) {
		console.info(info[i]);
	}
};

const main = async () => {
	const info: string[] = [];
	let jiraTicketNumber = Deno.args[1];

	if (!jiraTicketNumber || jiraTicketNumber === 'link-only') {
		const matches = await getJiraIssueFromGitBranch();
		if (matches.length > 0) {
			jiraTicketNumber = matches[0];
			info.push(
				`Jira ticket number from git branch: ${jiraTicketNumber.toUpperCase()}`,
			);
		} else {
			jiraTicketNumber = getCurrentTicketNumber();
		}
	} else if (jiraTicketNumber.toLowerCase() === 'curr') {
		jiraTicketNumber = getCurrentTicketNumber();
	} else if (
		jiraTicketNumber.match(/^\d+$/) && Deno.env.get('DEFAULT_ISSUE_PREFIX')
	) {
		jiraTicketNumber = `${
			Deno.env.get('DEFAULT_ISSUE_PREFIX')
		}-${jiraTicketNumber}`;
	}

	switch (Deno.args[0]) {
		case 'l':
		case 'link': {
			if (Deno.args[1] !== 'link-only' && Deno.args[2] !== 'link-only') {
				displayInfo(info);
			}

			if (jiraTicketNumber) {
				console.info(`${JIRA_URL}/browse/${jiraTicketNumber}`);
			}

			break;
		}
		case 'b':
		case 'board': {
			if (!Deno.args[1]) {
				console.error('Missing board number.');
				console.info(
					'Usage: jira board <board-number> <sprint-adjustment> <max-issues-per-category>',
				);
				return;
			}

			const { sprint, issuesByStatus } = await getJiraBoard(
				Deno.args[1],
				parseInt(Deno.args[2], 10),
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

			let maxIssues = parseInt(Deno.args[3], 10);
			if (isNaN(maxIssues)) {
				maxIssues = DEFAULT_MAX_ISSUES;
			}

			Object.entries(issuesByStatus).sort((a, b) => {
				return getStatusValue(a[0].toLowerCase()) -
					getStatusValue(b[0].toLowerCase());
			}).forEach(([status, issues]) => {
				console.info(`\n${colourStatus(status)}`);
				const tempIssues = status !== 'In Progress'
					? issues.slice(0, maxIssues)
					: issues;
				tempIssues.forEach((issue) => {
					let line = `- ${issue.key}: ${issue.summary} ${
						issue.assignee ? `- ${issue.assignee}` : ''
					}`;

					if (issue.labels.length > 0) {
						const labels = issue.labels.join(', ');
						line = `- ${issue.key} (${labels}): ${issue.summary} ${
							issue.assignee ? `- ${issue.assignee}` : ''
						}`;
					}

					console.info(
						line,
					);
				});

				if ((issues.length - tempIssues.length) !== 0) {
					console.info(`+${issues.length - tempIssues.length} more`);
				}
			});
			return;
		}
		case 'ticket-number':
		case 'issue-number': {
			console.info(jiraTicketNumber);

			break;
		}
		case 'i':
		case 'ticket':
		case 'issue': {
			displayJiraIssue(await getJiraIssue(jiraTicketNumber));

			const jiraActionPayload = Deno.args[2] || '';

			const [jiraAction, jiraPayload] = jiraActionPayload.split(':');

			const comments = await getJiraIssueComments(jiraTicketNumber);

			switch (jiraAction) {
				case 'c':
				case 'comment':
				case 'comments': {
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
				case 'set':
				case 'setcurrent':
				case 'set-current': {
					Deno.writeTextFileSync(
						`${getToolsPath()}/current.txt`,
						jiraTicketNumber.toUpperCase(),
					);
					break;
				}
				case 'a':
				case 'assign': {
					let changeStatus = false;
					if (['me'].includes(jiraPayload)) {
						const me = await getMyJiraUser();

						await assignToJiraIssue(jiraTicketNumber, me.accountId);

						Deno.writeTextFileSync(
							`${getToolsPath()}/current.txt`,
							jiraTicketNumber.toUpperCase(),
						);

						changeStatus = true;
					}

					if (['not-me', 'no-one', 'noone'].includes(jiraPayload)) {
						await assignToJiraIssue(jiraTicketNumber);

						changeStatus = true;
					}

					if (changeStatus) {
						const result = await listAndApplyJiraTransition(jiraTicketNumber);
						if (result === '0') {
							// nothing
						} else if (result) {
							console.info(
								`${jiraTicketNumber} is now "${colourStatus(result)}"`,
							);
						} else {
							console.error(
								`Error when updating status of ${jiraTicketNumber}`,
							);
						}
					}

					return;
				}
				case 'status': {
					if (!jiraPayload) {
						const result = await listAndApplyJiraTransition(jiraTicketNumber);

						if (result) {
							console.info(`${jiraTicketNumber} is now "${result}"`);
							if (result.toLowerCase() === 'done') {
								// @todo(nick-ng): animate the carousel horse moving across the screen. `tput cols` gets the width of the terminal
								console.info('🎠');
							}
						} else {
							console.error(
								`Error when updating status of ${jiraTicketNumber}`,
							);
						}
					}

					if (jiraPayload) {
						const result = await applyJiraIssueTransition(
							jiraTicketNumber,
							jiraPayload,
						);
						if (result) {
							console.info(`${jiraTicketNumber} is now "${result}"`);
							if (result.toLowerCase() === 'done') {
								console.info('🎠');
							}
						} else {
							console.error(
								`Error when updating status of ${jiraTicketNumber}`,
							);
						}
					}

					return;
				}
				default: {
					if (comments.length > 0) {
						console.info(
							`\nType \`jira i ${
								Deno.args[1]
							} c\` to see ${comments.length} comments`,
						);
					} else {
						console.info(`\nNo comments`);
					}
				}
			}
			break;
		}
		case 'help':
		default: {
			console.info("Nick 3's Jira CLI\n");
			console.info('Commands');
			console.info('- jira i <issue-key> set: Set "curr" alias');
			console.info('  - Use "curr" in-place of <issue-key>');
			console.info('- jira i <issue-key>: Jira issue');
			console.info(
				'  - jira i <issue-key> assign:[me, no-one]: Assign Jira issue to yourself or unassign Jira issue',
			);
			console.info(
				'  - jira i <issue-key> status: Change status of Jira issue',
			);
			console.info('- jira b <board-number>: Jira board');
			console.info(
				'- jiralink: Copy link to current Jira issue to clipboard. Current Jira issue detected from git branch name',
			);
		}
	}
};

main();
