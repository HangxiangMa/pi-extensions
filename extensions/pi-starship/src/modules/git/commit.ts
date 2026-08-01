import { defineModule } from "../types.js";

const DEFAULT_HASH_LENGTH = 7;

export const gitCommitModule = defineModule({
	name: "git_commit",
	variables: ["symbol", "hash", "tag"],
	defaults: {
		format: "[ ($hash) ]($style)",
		symbol: "",
		style: "green bold",
		disabled: false,
	},
	values: ({ runtime }) => {
		const commit = runtime.gitCommit;
		if (!commit) return undefined;
		return {
			hash: commit.hash.slice(0, DEFAULT_HASH_LENGTH),
			tag: commit.tag ? ` 🏷 ${commit.tag}` : "",
		};
	},
});
