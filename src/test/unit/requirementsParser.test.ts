import * as assert from "assert";
import { parse, parseDocument } from "../../core/parser";

describe("Requirements Parser", () => {
  describe("parse", () => {
    it("should parse package==version", () => {
      const result = parse("flask==2.0.0", 0);
      assert.ok(result);
      assert.strictEqual(result.packageName, "flask");
      assert.strictEqual(result.versionSpecifier, "==2.0.0");
    });

    it("should parse package>=version", () => {
      const result = parse("requests>=2.28.0", 0);
      assert.ok(result);
      assert.strictEqual(result.packageName, "requests");
      assert.strictEqual(result.versionSpecifier, ">=2.28.0");
    });

    it("should parse package with extras", () => {
      const result = parse("uvicorn[standard]==0.20.0", 0);
      assert.ok(result);
      assert.strictEqual(result.packageName, "uvicorn");
      assert.strictEqual(result.versionSpecifier, "==0.20.0");
    });

    it("should parse package without version specifier", () => {
      const result = parse("flask", 0);
      assert.ok(result);
      assert.strictEqual(result.packageName, "flask");
      assert.strictEqual(result.versionSpecifier, "");
    });

    it("should skip comment lines", () => {
      assert.strictEqual(parse("# flask==2.0.0", 0), null);
    });

    it("should skip empty lines", () => {
      assert.strictEqual(parse("", 0), null);
      assert.strictEqual(parse("   ", 0), null);
    });

    it("should skip editable installs", () => {
      assert.strictEqual(
        parse("-e git+https://github.com/user/repo.git", 0),
        null,
      );
    });

    it("should skip requirements file references", () => {
      assert.strictEqual(parse("-r base.txt", 0), null);
    });

    it("should skip pip options", () => {
      assert.strictEqual(parse("--index-url https://pypi.org/simple", 0), null);
    });

    it("should skip local paths", () => {
      assert.strictEqual(parse("./local-package", 0), null);
      assert.strictEqual(parse("/absolute/path", 0), null);
    });

    it("should skip URL-based dependencies", () => {
      assert.strictEqual(parse("https://example.com/package.tar.gz", 0), null);
    });

    it("should skip git protocol URLs", () => {
      assert.strictEqual(parse("git://github.com/user/repo.git", 0), null);
      assert.strictEqual(
        parse("git+https://github.com/user/repo.git", 0),
        null,
      );
    });

    it("should set correct line number", () => {
      const result = parse("flask==2.0.0", 5);
      assert.ok(result);
      assert.strictEqual(result.line, 5);
    });

    it("should parse package with inline comment", () => {
      const result = parse("fastapi==0.128.0  # this is a comment", 0);
      assert.ok(result);
      assert.strictEqual(result.packageName, "fastapi");
      assert.strictEqual(result.versionSpecifier.trim(), "==0.128.0");
    });

    it("should parse package with environment markers", () => {
      const result = parse("holidays==0.89 ; python_version >= '3.12'", 0);
      assert.ok(result);
      assert.strictEqual(result.packageName, "holidays");
      assert.strictEqual(result.versionSpecifier.trim(), "==0.89");
    });

    it("should parse package with both extras and inline comment", () => {
      const result = parse("uvicorn[standard]==0.20.0 # web server", 0);
      assert.ok(result);
      assert.strictEqual(result.packageName, "uvicorn");
      assert.strictEqual(result.versionSpecifier.trim(), "==0.20.0");
    });
  });

  describe("parseDocument", () => {
    it("should parse multiple dependencies", () => {
      const content = "flask==2.0.0\nrequests>=2.28.0\ndjango==4.0";
      const result = parseDocument(content);
      assert.strictEqual(result.length, 3);
      assert.strictEqual(result[0].packageName, "flask");
      assert.strictEqual(result[1].packageName, "requests");
      assert.strictEqual(result[2].packageName, "django");
    });

    it("should skip comments and empty lines", () => {
      const content =
        "# comment\nflask==2.0.0\n\n# another comment\nrequests>=2.28.0";
      const result = parseDocument(content);
      assert.strictEqual(result.length, 2);
    });

    it("should handle empty document", () => {
      assert.strictEqual(parseDocument("").length, 0);
    });
  });
});
