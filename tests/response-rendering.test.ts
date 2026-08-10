import assert from "node:assert/strict";
import test from "node:test";
import { transformAssistantMarkdown } from "../response.ts";

test("user markdown remains unchanged", () => {
  assert.equal(transformAssistantMarkdown("hello", "user", false), "hello");
});

test("streaming response gets an opening divider without a premature ending", () => {
  const rendered = transformAssistantMarkdown("partial", "assistant", true);
  assert.match(rendered, /POD 042 \/ RESPONSE/);
  assert.match(rendered, /partial/);
  assert.doesNotMatch(rendered, /END TRANSMISSION/);
});

test("final response has an explicit end transmission divider", () => {
  const rendered = transformAssistantMarkdown("complete", "assistant", false);
  assert.match(rendered, /POD 042 \/ RESPONSE/);
  assert.match(rendered, /END TRANSMISSION/);
});

test("thinking remains intact because the response card owns its tactical label", () => {
  const rendered = transformAssistantMarkdown("inspect state", "assistant-thinking", true);
  assert.equal(rendered, "inspect state");
  assert.doesNotMatch(rendered, /END TRANSMISSION/);
});
