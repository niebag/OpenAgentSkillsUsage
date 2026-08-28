import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("release workflow validates and publishes an owner-approved tagged artifact", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /tag:\n\s+description:.*\n\s+required: true/);
  assert.match(workflow, /if: github\.actor == github\.repository_owner/);
  assert.match(workflow, /ref: refs\/tags\/\$\{\{ inputs\.tag \}\}/);
  assert.match(workflow, /node-version: 24/);
  assert.match(workflow, /test "\$RELEASE_TAG" = "v\$PACKAGE_VERSION"/);
  assert.match(workflow, /git tag --points-at HEAD --list "\$RELEASE_TAG"/);
  assert.match(workflow, /run: npm run check/);
  assert.match(workflow, /run: npm test/);
  assert.match(workflow, /id: pack[\s\S]*npm pack --json/);
  assert.match(workflow, /npm publish "\$\{\{ steps\.pack\.outputs\.tarball \}\}" --dry-run/);
  assert.match(workflow, /npm publish "\$\{\{ steps\.pack\.outputs\.tarball \}\}" --provenance --access public/);
  assert.match(workflow, /NODE_AUTH_TOKEN: \$\{\{ secrets\.NPM_TOKEN \}\}/);
  assert.deepEqual(packageJson.repository, {
    type: "git",
    url: "git+https://github.com/niebag/OpenAgentSkillsUsage.git"
  });

  const orderedSteps = [
    "node-version: 24",
    "run: npm run check",
    "run: npm test",
    "name: Pack artifact",
    "name: Validate packed artifact",
    "name: Check package name availability",
    "name: Publish package"
  ];
  const positions = orderedSteps.map((step) => workflow.indexOf(step));
  positions.reduce((previous, position, index) => {
    assert.ok(position > previous, `${orderedSteps[index]} is out of order`);
    return position;
  }, -1);

  const [availability, publish] = positions.slice(-2);
  assert.doesNotMatch(workflow.slice(availability, publish), /\n\s+- name:/);
});
