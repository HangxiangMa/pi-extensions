import { defineModule } from "./types.js";

export const providerModule = defineModule({
	name: "provider",
	variables: ["symbol", "provider"],
	defaults: {
		format: "[$symbol $provider ]($style)",
		symbol: "🔌",
		style: "bold blue",
		disabled: false,
	},
	values: ({ runtime }) => (runtime.model ? { provider: runtime.model.provider } : undefined),
});
