import type { DelegationContract } from "./delegation-contract.js";

export interface VerificationRiskInput {
	contract?: DelegationContract;
	integrationOwner: boolean;
	requiredCapabilities: string[];
}

export function requiresIndependentVerification(input: VerificationRiskInput): boolean {
	return (
		input.contract?.admission?.verificationRequired === true ||
		input.requiredCapabilities.some((capability) =>
			["security-review", "security-implementation", "security-baseline"].includes(capability),
		) ||
		(input.integrationOwner && input.contract?.sideEffectPolicy !== "read-only")
	);
}
