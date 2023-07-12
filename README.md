## Instructions

1. Install Deno
2. Add the following to your `.bashrc`. You will need to define some environment variables.

```
...
# exports TOOLS2_PATH, DEFAULT_ISSUE_PREFIX
source ~/.tools2Settings
# exports JIRA_URL, ATLASSIAN_USER, and ATLASSIAN_API_TOKEN
source ~/.jiraSecrets
source <path-to-this-repo>/dot-bash-rc
...
```

## Commands

- jira help

## Jira API

- [Main API](https://docs.atlassian.com/software/jira/docs/api/REST/9.9.0/)
- [?](https://developer.atlassian.com/cloud/jira/platform/apis/document/nodes/media/)

## Todos

### ToDo Comments

- utils/jira.ts:32: @todo(nick-ng): cache get requests
