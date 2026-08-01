import { defineModule } from "./types.js";

export const thinkingModule = defineModule({
	name: "thinking",
	variables: ["symbol", "level"],
	defaults: {
		format: "[$symbol $level ]($style)",
		symbol: "🧠",
		style: "bold purple",
		disabled: false,
	},
	values: ({ runtime }) => ({ level: runtime.thinkingLevel }),
});
