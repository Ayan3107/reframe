import assert from "node:assert/strict";
import test from "node:test";
import { getContentAddress, isExistingUpload } from "../lib/content-address.mjs";
import { filterCloudinaryObjectLabels } from "../lib/cloudinary-labels.mjs";

test("the same file bytes receive the same secret-keyed Cloudinary ID", () => {
  const previousSecret = process.env.CLOUDINARY_API_SECRET;
  process.env.CLOUDINARY_API_SECRET = "unit-test";
  try {
    const first = getContentAddress(Buffer.from("same image bytes"));
    const second = getContentAddress(Buffer.from("same image bytes"));
    const different = getContentAddress(Buffer.from("different image bytes"));

    assert.equal(first, second);
    assert.notEqual(first, different);
    assert.match(first, /^[a-f0-9]{64}$/);
  } finally {
    if (previousSecret === undefined) delete process.env.CLOUDINARY_API_SECRET;
    else process.env.CLOUDINARY_API_SECRET = previousSecret;
  }
});

test("Cloudinary existing responses are recognized without treating new uploads as duplicates", () => {
  assert.equal(isExistingUpload({ existing: true }), true);
  assert.equal(isExistingUpload({ existing: "True" }), true);
  assert.equal(isExistingUpload({ existing: false }), false);
  assert.equal(isExistingUpload({ existing: "false" }), false);
  assert.equal(isExistingUpload(null), false);
});

test("Cloudinary system analysis tags are not presented as detected objects", () => {
  assert.deepEqual(
    filterCloudinaryObjectLabels([" person ", "iqa-analysis", "PERSON", "coco", "captioning", "snake"]),
    ["person", "snake"],
  );
  assert.deepEqual(filterCloudinaryObjectLabels(null), []);
});
