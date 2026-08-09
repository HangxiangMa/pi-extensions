import { afterEach, describe, expect, it, vi } from "vitest";
import { TurnBudgetMonitor, type TurnBudgetStop, validateTurnLimits } from "../src/turn-budget.js";

afterEach(() => vi.useRealTimers());

describe("turn budget monitor", () => {
	it("expires after meaningful activity stays idle and resets on completed activity", () => {
		vi.useFakeTimers();
		const stops: TurnBudgetStop[] = [];
		const monitor = new TurnBudgetMonitor({
			idleTimeoutMs: 1_000,
			onExceeded: (stop) => stops.push(stop),
		});

		vi.advanceTimersByTime(900);
		monitor.recordActivity();
		vi.advanceTimersByTime(900);
		expect(stops).toEqual([]);
		vi.advanceTimersByTime(100);
		expect(stops).toEqual([{ reason: "idle_timeout", limit: 1_000 }]);
		monitor.dispose();
	});

	it("allows a terminal answer at the turn limit", () => {
		const stops: TurnBudgetStop[] = [];
		const monitor = new TurnBudgetMonitor({
			maxTurns: 2,
			onExceeded: (stop) => stops.push(stop),
		});

		monitor.recordAssistantTurn("toolUse");
		monitor.recordAssistantTurn("stop");

		expect(stops).toEqual([]);
		monitor.dispose();
	});

	it("stops a non-terminal answer that consumes the last allowed turn", () => {
		const stops: TurnBudgetStop[] = [];
		const monitor = new TurnBudgetMonitor({
			maxTurns: 2,
			onExceeded: (stop) => stops.push(stop),
		});

		monitor.recordAssistantTurn("toolUse");
		monitor.recordAssistantTurn("toolUse");

		expect(stops).toEqual([{ reason: "turn_limit", limit: 2 }]);
		monitor.dispose();
	});

	it("stops before an additional tool call exceeds the configured maximum", () => {
		const stops: TurnBudgetStop[] = [];
		const monitor = new TurnBudgetMonitor({
			maxToolCalls: 2,
			onExceeded: (stop) => stops.push(stop),
		});

		monitor.recordToolCalls(2);
		expect(stops).toEqual([]);
		monitor.recordToolCalls(1);
		expect(stops).toEqual([{ reason: "tool_call_limit", limit: 2 }]);
		monitor.dispose();
	});

	it("validates positive finite integer limits", () => {
		expect(() => validateTurnLimits({ idleTimeoutMs: 0 })).toThrow(/idleTimeoutMs/);
		expect(() => validateTurnLimits({ maxTurns: 1.5 })).toThrow(/maxTurns/);
		expect(validateTurnLimits({ idleTimeoutMs: 50, maxTurns: 3, maxToolCalls: 4 })).toEqual({
			idleTimeoutMs: 50,
			maxTurns: 3,
			maxToolCalls: 4,
		});
	});
});
