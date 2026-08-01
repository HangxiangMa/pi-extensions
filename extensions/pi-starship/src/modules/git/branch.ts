import { defineModule } from "../types.js";

export const gitBranchModule = defineModule({
	name: "git_branch",
	variables: ["symbol", "branch", "remote_name", "remote_branch"],
	defaults: {
		format: "[ $symbol $branch ]($style)",
		symbol: "🌿",
		style: "fg:git_fg bg:git",
		disabled: false,
	},
	values: ({ runtime }) => {
		const branch = runtime.gitBranchDetails;
		const name = branch?.name ?? runtime.gitBranch;
		if (!name) return undefined;
		return {
			branch: name,
			remote_name: branch?.remoteName ?? "",
			remote_branch: branch?.remoteBranch ?? "",
		};
	},
});
