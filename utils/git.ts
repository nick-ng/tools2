export const getCurrentBranch = async (): Promise<string> => {
	const statusCmd = new Deno.Command('git', {
		args: ['status'],
	});

	const { stdout } = await statusCmd.output();
	const statusStr = new TextDecoder().decode(stdout);

	const parts = statusStr.split('\n');

	const branchPart = parts.find((p) => p.startsWith('On branch '));

	if (!branchPart) {
		console.error("Couldn't get Git branch name.");
		return '';
	}

	return branchPart.replace('On branch ', '');
};
