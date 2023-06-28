## Instructions

1. Install Deno
2. `.bashrc`:
```
...
# contains TOOLS2_PATH
source ~/.tools2Settings
# contains JIRA_URL, ATLASSIAN_USER, and ATLASSIAN_API_TOKEN
source ~/.jiraSecrets
source <path>/tools2/dot-bash-rc
...
```

## Commands

* jira ticket - Try to find Jira ticket number in git branch
* jira ticket <ticket-number>
* jira ticket <ticket-number> status
  * jira ticket <ticket-number> status:<status-name>
* jira board <board-number>

## Jira API

- [Main API](https://docs.atlassian.com/software/jira/docs/api/REST/9.9.0/)
- [?](https://developer.atlassian.com/cloud/jira/platform/apis/document/nodes/media/)
