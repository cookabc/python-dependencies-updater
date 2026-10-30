import * as assert from "node:assert";
import { updateLensLabel } from "../../core/lensLabel";
import { UpdateRisk } from "../../types";

const labels = {
	updateTo: "Update to",
	majorUpdate: "Major Update",
	minorUpdate: "Minor Update",
	patchUpdate: "Patch Update",
};

describe("Update lens labels", () => {
	it("describes the update on offer, never the up-to-date state", () => {
		for (const risk of [UpdateRisk.Low, UpdateRisk.Medium, UpdateRisk.High]) {
			const { title, tooltip } = updateLensLabel(risk, "2.0.0", labels);
			assert.ok(
				!tooltip.toLowerCase().includes("up to date"),
				`tooltip must not claim up-to-date: ${tooltip}`,
			);
			assert.ok(
				!title.toLowerCase().includes("up to date"),
				`title must not claim up-to-date: ${title}`,
			);
		}
	});

	it("names the risk level in the tooltip", () => {
		assert.strictEqual(
			updateLensLabel(UpdateRisk.High, "2.0.0", labels).tooltip,
			"Update to 2.0.0 (Major Update)",
		);
		assert.strictEqual(
			updateLensLabel(UpdateRisk.Medium, "1.3.0", labels).tooltip,
			"Update to 1.3.0 (Minor Update)",
		);
		assert.strictEqual(
			updateLensLabel(UpdateRisk.Low, "1.2.4", labels).tooltip,
			"Update to 1.2.4 (Patch Update)",
		);
	});

	it("marks a major update in the title", () => {
		assert.ok(
			updateLensLabel(UpdateRisk.High, "2.0.0", labels).title.includes(
				"Major Update",
			),
		);
		assert.ok(
			!updateLensLabel(UpdateRisk.Low, "1.2.4", labels).title.includes(
				"Major Update",
			),
		);
	});
});
