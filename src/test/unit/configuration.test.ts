import * as assert from "assert";
import { validateRegistryUrl } from "../../utils/url-validator";

describe("Configuration Validation", () => {
  it("should allow valid https URL", () => {
    assert.strictEqual(
      validateRegistryUrl("https://pypi.org"),
      "https://pypi.org"
    );
  });

  it("should allow valid http URL", () => {
    assert.strictEqual(
      validateRegistryUrl("http://localhost:8080"),
      "http://localhost:8080"
    );
  });

  it("should reject javascript: scheme", () => {
    assert.strictEqual(
      validateRegistryUrl("javascript:alert(1)"),
      "https://pypi.org"
    );
  });

  it("should reject malformed URLs", () => {
    assert.strictEqual(
      validateRegistryUrl("not-a-url"),
      "https://pypi.org"
    );
  });

  it("should fallback to default for empty string", () => {
    assert.strictEqual(validateRegistryUrl(""), "https://pypi.org");
  });
});
