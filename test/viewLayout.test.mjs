import assert from "node:assert/strict";
import test from "node:test";
import { getTabViewLayout } from "../services/viewLayout.mjs";

test("sizes the titlebar and page view to the current content view", () => {
	assert.deepEqual(getTabViewLayout({ width: 1920, height: 1040 }), {
		titlebar: { x: 0, y: 0, width: 1920, height: 40 },
		page: { x: 0, y: 40, width: 1920, height: 1000 },
	});
});

test("keeps page height non-negative for very small windows", () => {
	assert.deepEqual(getTabViewLayout({ width: 320, height: 24 }), {
		titlebar: { x: 0, y: 0, width: 320, height: 24 },
		page: { x: 0, y: 24, width: 320, height: 0 },
	});
});
