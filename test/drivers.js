import assert from "assert";
import path from "path";
import { getPostgratorEnd } from "./test-util.js";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const migrationPattern = path.join(__dirname, "./migrations/*");

function getQuotedSchemaTable(postgrator) {
  if (postgrator.config.driver === "pg") {
    return postgrator.config.schemaTable
      .split(".")
      .map((value) => `"${value}"`)
      .join(".");
  }
  return postgrator.config.schemaTable;
}

driverExecQuery(() => {
  return getPostgratorEnd({
    migrationPattern,
    driver: "pg",
    database: "postgrator",
  });
}, "Driver: pg");

driverExecQuery(() => {
  return getPostgratorEnd({
    migrationPattern,
    driver: "pg",
    database: "postgrator",
    schemaTable: "postgrator.schemaversion",
  });
}, "Driver: pg (with schemaTable)");

driverExecQuery(() => {
  return getPostgratorEnd({
    migrationPattern,
    driver: "pg",
    database: "postgrator",
    schemaTable: "postgrator.SchemaVersion",
  });
}, "Driver: pg (with capital schemaTable)");

driverExecQuery(() => {
  return getPostgratorEnd({
    migrationPattern,
    driver: "pg",
    database: "postgrator",
    currentSchema: "postgrator",
  });
}, "Driver: pg (with currentSchema)");

driverExecQuery(() => {
  return getPostgratorEnd({
    migrationPattern,
    driver: "mssql",
    database: "master",
  });
}, "Driver: mssql");

driverExecQuery(() => {
  return getPostgratorEnd({
    migrationPattern,
    driver: "mysql",
    database: "postgrator",
  });
}, "Driver: mysql");

driverExecQuery(() => {
  return getPostgratorEnd({
    migrationPattern,
    driver: "sqlite3",
    schemaTable: "versions",
  });
}, "Driver: sqlite3");

function driverExecQuery(factoryFunction, label) {
  describe(label, () => {
    let postgrator;
    let end = () => {};

    before(async () => {
      const result = await factoryFunction();
      postgrator = result.postgrator;
      end = result.end;
    });

    after(async () => {
      await postgrator.runQuery(
        `DROP TABLE ${getQuotedSchemaTable(postgrator)}`
      );
      await end();
    });

    it("Returns 0 for database version before init", async function () {
      const result = await postgrator.getDatabaseVersion();
      assert.strictEqual(result, 0);
    });

    it("Migrates multiple versions up (000 -> 002)", function () {
      return postgrator
        .migrate("002")
        .then(() => postgrator.runQuery("SELECT name FROM person"))
        .then((results) => {
          assert.strictEqual(results.rows.length, 1);
        });
    });

    it("Handles current version", function () {
      return postgrator.migrate("002").then((migrations) => {
        assert.strictEqual(migrations.length, 0);
      });
    });

    it("Has migration details in schema table", function () {
      return postgrator
        .runQuery(
          `SELECT version, name, md5, run_at 
            FROM ${getQuotedSchemaTable(postgrator)}
            WHERE version = 2`
        )
        .then((results) => {
          assert.strictEqual(results.rows[0].name, "some-description");
          assert(results.rows[0].run_at);
          assert(results.rows[0].md5);
        });
    });

    it("Migrates one version up (002 -> 003", function () {
      return postgrator
        .migrate("003")
        .then(() => postgrator.runQuery("SELECT name FROM person"))
        .then((results) => {
          assert.strictEqual(results.rows.length, 3);
        });
    });

    it("Migrates generated SQL", function () {
      // using this to demo that you use environment variables to generate sql
      process.env.TEST_NAME = "aesthete";
      return postgrator
        .migrate("005")
        .then(() => postgrator.runQuery("SELECT name, age FROM person"))
        .then((result) => {
          assert.strictEqual(result.rows.length, 5);
          assert.strictEqual(result.rows[4].name, process.env.TEST_NAME);
        });
    });

    it("Checksums generated SQL", function () {
      process.env.TEST_ANOTHER_NAME = "sop";
      return postgrator
        .migrate("006")
        .then(() => postgrator.runQuery("SELECT name, age FROM person"))
        .then((result) => {
          assert.strictEqual(result.rows.length, 6);
          assert.strictEqual(result.rows[4].name, process.env.TEST_NAME);
          assert.strictEqual(
            result.rows[5].name,
            process.env.TEST_ANOTHER_NAME
          );
        });
    });

    it('Migrates to "max"', function () {
      return postgrator
        .migrate("max")
        .then(() => postgrator.runQuery("SELECT name, age FROM person"))
        .then((result) => {
          assert.strictEqual(result.rows.length, 6);
        });
    });

    it("Migrates down to 000", function () {
      return postgrator.migrate("00");
    });

    it("Migrates to latest without input", function () {
      return postgrator
        .migrate()
        .then(() => postgrator.runQuery("SELECT name, age FROM person"))
        .then((result) => {
          assert.strictEqual(result.rows.length, 6);
        });
    });

    it("Migrates down to 000 again", function () {
      return postgrator.migrate("00");
    });

    it("Errors on invalid md5 check", function () {
      return postgrator
        .migrate("003")
        .then(() =>
          postgrator.runQuery(
            `UPDATE ${getQuotedSchemaTable(
              postgrator
            )} SET md5 = 'baddata' WHERE version = 2`
          )
        )
        .then(() => postgrator.migrate("006"))
        .catch((error) => {
          assert(error);
          return postgrator.getDatabaseVersion();
        })
        .then((version) => assert.strictEqual(version, 3));
    });

    it("Migrates down to 000 again", function () {
      return postgrator.migrate("00");
    });

    it("Skips checksum validation if turned off", function () {
      postgrator.config.validateChecksums = false;
      return postgrator
        .migrate("003")
        .then(() =>
          postgrator.runQuery(
            `UPDATE ${getQuotedSchemaTable(
              postgrator
            )} SET md5 = 'baddata' WHERE version = 2`
          )
        )
        .then(() => postgrator.migrate("006"))
        .catch((error) => assert.ifError(error))
        .then(() => postgrator.getDatabaseVersion())
        .then((version) => assert.strictEqual(version, 6));
    });

    it("Migrates down to 000 again", function () {
      return postgrator.migrate("00");
    });
  });
}
