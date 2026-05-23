import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { APPS, ALLOWED_APP_IDS, isAppId } from "../src/integrations/registry.js";

describe("integration registry", () => {
  it("every allowed id has a definition", () => {
    for (const id of ALLOWED_APP_IDS) {
      assert.ok(APPS[id], `missing definition for ${id}`);
      assert.equal(APPS[id].id, id);
    }
  });

  it("every definition has a valid transport", () => {
    for (const id of ALLOWED_APP_IDS) {
      const def = APPS[id];
      assert.ok(
        def.transport === "composio" || def.transport === "shortcut",
        `bad transport for ${id}: ${def.transport}`,
      );
      if (def.transport === "composio") {
        assert.ok(def.composioApp, `composio app ${id} missing composioApp slug`);
      }
    }
  });

  it("isAppId narrows correctly", () => {
    assert.equal(isAppId("google_calendar"), true);
    assert.equal(isAppId("not_a_real_app"), false);
    assert.equal(isAppId(""), false);
  });

  it("includes all expected MVP apps", () => {
    const required = [
      "google_calendar",
      "google_contacts",
      "gmail",
      "spotify",
      "apple_calendar",
      "apple_contacts",
      "apple_health",
      "apple_photos",
      "apple_notes",
      "apple_phone_log",
      "apple_screen_time",
    ];
    for (const r of required) {
      assert.ok(isAppId(r), `missing MVP app: ${r}`);
    }
  });
});
