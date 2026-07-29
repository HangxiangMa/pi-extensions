import assert from "node:assert/strict";
import test from "node:test";
import {
	canonicalizeLocale,
	canonicalizeTimeZone,
	DEFAULT_STAMP_SETTINGS,
	formatStampLabel,
} from "../src/format.js";

const BEFORE_MIDNIGHT_UTC = Date.UTC(2026, 6, 29, 23, 59, 58);
const AFTER_MIDNIGHT_UTC = Date.UTC(2026, 6, 30, 0, 1, 2);
const UTC_ENV = { localTimeZone: "UTC" } as const;

test("formatStampLabel preserves the invariant Phase 1 default", () => {
	assert.equal(
		formatStampLabel(AFTER_MIDNIGHT_UTC, undefined, DEFAULT_STAMP_SETTINGS, UTC_ENV),
		"00:01:02",
	);
	assert.equal(
		formatStampLabel(AFTER_MIDNIGHT_UTC, BEFORE_MIDNIGHT_UTC, DEFAULT_STAMP_SETTINGS, UTC_ENV),
		"2026-07-30 · 00:01:02",
	);
});

test("formatStampLabel supports hour cycle, seconds, and date context", () => {
	assert.equal(
		formatStampLabel(
			AFTER_MIDNIGHT_UTC,
			undefined,
			{
				...DEFAULT_STAMP_SETTINGS,
				hourCycle: "12h",
				showSeconds: false,
			},
			UTC_ENV,
		),
		"12:01 AM",
	);
	assert.equal(
		formatStampLabel(
			AFTER_MIDNIGHT_UTC,
			undefined,
			{
				...DEFAULT_STAMP_SETTINGS,
				dateContext: "always",
			},
			UTC_ENV,
		),
		"2026-07-30 · 00:01:02",
	);
	assert.equal(
		formatStampLabel(
			AFTER_MIDNIGHT_UTC,
			BEFORE_MIDNIGHT_UTC,
			{
				...DEFAULT_STAMP_SETTINGS,
				dateContext: "never",
			},
			UTC_ENV,
		),
		"00:01:02",
	);
});

test("day changes use the selected time zone rather than elapsed duration", () => {
	const taipei = { ...DEFAULT_STAMP_SETTINGS, timeZone: "Asia/Taipei" } as const;
	assert.equal(formatStampLabel(AFTER_MIDNIGHT_UTC, BEFORE_MIDNIGHT_UTC, taipei), "08:01:02");

	const losAngeles = { ...DEFAULT_STAMP_SETTINGS, timeZone: "America/Los_Angeles" } as const;
	assert.equal(formatStampLabel(AFTER_MIDNIGHT_UTC, BEFORE_MIDNIGHT_UTC, losAngeles), "17:01:02");

	const dateLineBefore = Date.UTC(2026, 6, 29, 9, 59, 58);
	const dateLineAfter = Date.UTC(2026, 6, 29, 10, 0, 2);
	const kiritimati = { ...DEFAULT_STAMP_SETTINGS, timeZone: "Pacific/Kiritimati" } as const;
	assert.equal(
		formatStampLabel(dateLineAfter, dateLineBefore, kiritimati),
		"2026-07-30 · 00:00:02",
	);
});

test("system and explicit locales use Intl formatting with bounded semantic options", () => {
	const settings = {
		...DEFAULT_STAMP_SETTINGS,
		hourCycle: "12h" as const,
		locale: "system",
		timeZone: "UTC",
	};
	assert.equal(
		formatStampLabel(AFTER_MIDNIGHT_UTC, undefined, settings, { systemLocale: "en-US" }),
		"12:01:02 AM",
	);
	const localized = formatStampLabel(
		AFTER_MIDNIGHT_UTC,
		undefined,
		{ ...settings, locale: "fr-FR", dateContext: "always" },
		{ systemLocale: "en-US" },
	);
	assert.ok(localized);
	assert.match(localized, /2026.*12:01:02\sAM/u);
});

test("locale and time-zone values canonicalize or reject exactly", () => {
	assert.equal(canonicalizeLocale("invariant"), "invariant");
	assert.equal(canonicalizeLocale("system"), "system");
	assert.equal(canonicalizeLocale("EN-us"), "en-US");
	assert.equal(canonicalizeLocale("not_a_locale"), undefined);
	assert.equal(canonicalizeTimeZone("local"), "local");
	assert.equal(canonicalizeTimeZone("utc"), "UTC");
	assert.equal(canonicalizeTimeZone("Asia/Taipei"), "Asia/Taipei");
	assert.equal(canonicalizeTimeZone("Moon/Base"), undefined);
});

test("formatStampLabel rejects invalid timestamps", () => {
	assert.equal(formatStampLabel(Number.NaN, undefined, DEFAULT_STAMP_SETTINGS, UTC_ENV), undefined);
	assert.equal(
		formatStampLabel(Number.POSITIVE_INFINITY, undefined, DEFAULT_STAMP_SETTINGS, UTC_ENV),
		undefined,
	);
	assert.equal(formatStampLabel(10 ** 20, undefined, DEFAULT_STAMP_SETTINGS, UTC_ENV), undefined);
});
