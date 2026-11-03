import { test } from "node:test";
import assert from "node:assert/strict";
import {
  creditNames,
  planPeopleSync,
  planIsEmpty,
  renameInCredit,
  type CreditRow,
  type LinkRecord,
  type PersonRecord,
} from "./peopleRecords.ts";
import { buildDirectoryFromPeople } from "./photographers.ts";
import { cardWithDefaults, mergeCard, readCard } from "./photographerMeta.ts";

const OWN = { photographer: "roster", model: "model" } as const;
const ids = () => {
  let n = 0;
  return () => `new-${++n}`;
};
const row = (over: Partial<CreditRow> & { id: string }): CreditRow => ({
  type: "roster",
  photographer: null,
  model: null,
  ...over,
});
const person = (over: Partial<PersonRecord> & { id: string; name: string }): PersonRecord => ({
  kind: "photographer",
  city: null,
  ig: null,
  link: null,
  card: {},
  ...over,
});

// The rule that moved photographers out of Campaign (2026-11-02): a credit on a
// Campaign image must never make a card. If it did, the next credited Campaign
// upload would put a photographer "under campaign" again.
test("a credit outside the directory tags only people who already exist", () => {
  const plan = planPeopleSync({
    rows: [row({ id: "c1", type: "editorial", photographer: "Mac Scott" })],
    people: [],
    links: [],
    ownTypes: OWN,
    newId: ids(),
  });
  assert.equal(plan.create.length, 0);
  assert.equal(plan.add.length, 0);

  const tagged = planPeopleSync({
    rows: [row({ id: "c1", type: "editorial", photographer: "mac scott " })],
    people: [person({ id: "p1", name: "Mac Scott" })],
    links: [],
    ownTypes: OWN,
    newId: ids(),
  });
  assert.deepEqual(tagged.add, [{ reference_id: "c1", person_id: "p1", role: "photographer" }]);
});

// A directory row IS the person, so a new name there makes their record — with
// the city most of their own rows give, which is what files them on the page.
test("a directory's own row creates the person, based where most of their rows say", () => {
  const plan = planPeopleSync({
    rows: [
      row({ id: "r1", photographer: "Jamie Heath", location: "Sydney", photographer_ig: "https://www.instagram.com/jamie_heath/" }),
      row({ id: "r2", photographer: "Jamie Heath", location: "Sydney" }),
      row({ id: "r3", photographer: "Jamie Heath", location: "Paris", link: "https://jamieheath.com" }),
    ],
    people: [],
    links: [],
    ownTypes: OWN,
    newId: ids(),
    legacyCards: { photographer: { "jamie heath": { group: "Movement" } } },
  });
  assert.equal(plan.create.length, 1);
  const p = plan.create[0];
  assert.equal(p.city, "Sydney");
  assert.equal(p.ig, "https://www.instagram.com/jamie_heath/");
  assert.equal(p.link, "https://jamieheath.com");
  assert.deepEqual(p.card, { group: "Movement" });
  assert.equal(plan.add.length, 3);
});

// A model row's `photographer` is who took the picture. It must tag that
// photographer if they have a record, and must never create one.
test("a model row makes the model, and only tags its photographer", () => {
  const plan = planPeopleSync({
    rows: [row({ id: "m1", type: "model", model: "Alexandra Agoston", photographer: "Chris Colls" })],
    people: [person({ id: "cc", name: "Chris Colls" })],
    links: [],
    ownTypes: OWN,
    newId: ids(),
  });
  assert.deepEqual(plan.create.map((p) => [p.kind, p.name]), [["model", "Alexandra Agoston"]]);
  assert.deepEqual(
    plan.add.map((l) => [l.person_id, l.role]).sort(),
    [["cc", "photographer"], ["new-1", "model"]]
  );
});

// Restoring a person's rows from Trash must bring their card back, not start a
// stranger with the same name.
test("a removed person comes back rather than being made again", () => {
  const plan = planPeopleSync({
    rows: [row({ id: "r1", photographer: "Sam Rock" })],
    people: [person({ id: "old", name: "Sam Rock", deleted_at: "2026-11-01T00:00:00Z" })],
    links: [],
    ownTypes: OWN,
    newId: ids(),
  });
  assert.deepEqual(plan.revive, ["old"]);
  assert.equal(plan.create.length, 0);
  assert.deepEqual(plan.add, [{ reference_id: "r1", person_id: "old", role: "photographer" }]);
});

// Restoring a Campaign picture of someone removed from the directory must not
// bring them back (a Campaign credit never makes a card) — nor lose the tag, or
// restoring the person later would find their Campaign pictures missing.
test("a tag to a removed person is kept, not revived and not dropped", () => {
  const plan = planPeopleSync({
    rows: [row({ id: "c1", type: "editorial", photographer: "Sam Rock" })],
    people: [person({ id: "old", name: "Sam Rock", deleted_at: "2026-11-01T00:00:00Z" })],
    links: [{ id: "l1", reference_id: "c1", person_id: "old", role: "photographer" }],
    ownTypes: OWN,
    newId: ids(),
  });
  assert.ok(planIsEmpty(plan));
});

test("a retyped credit moves the tag, and a duplicate tag is dropped", () => {
  const links: LinkRecord[] = [
    { id: "l1", reference_id: "c1", person_id: "a", role: "photographer" },
    { id: "l2", reference_id: "c2", person_id: "b", role: "photographer" },
    { id: "l3", reference_id: "c2", person_id: "b", role: "photographer" },
  ];
  const plan = planPeopleSync({
    rows: [
      row({ id: "c1", type: "editorial", photographer: "Bea" }),
      row({ id: "c2", type: "editorial", photographer: "Bea" }),
    ],
    people: [person({ id: "a", name: "Ana" }), person({ id: "b", name: "Bea" })],
    links,
    ownTypes: OWN,
    newId: ids(),
  });
  assert.deepEqual(plan.drop.sort(), ["l1", "l3"]);
  assert.deepEqual(plan.add, [{ reference_id: "c1", person_id: "b", role: "photographer" }]);
});

// Trash keeps its tags: a row there is left alone, so Restore brings it back
// onto the same profile.
test("a row in Trash keeps its tags", () => {
  const plan = planPeopleSync({
    rows: [row({ id: "r1", photographer: "Someone Else", deleted_at: "2026-11-02T00:00:00Z" })],
    people: [person({ id: "a", name: "Ana" })],
    links: [{ id: "l1", reference_id: "r1", person_id: "a", role: "photographer" }],
    ownTypes: OWN,
    newId: ids(),
  });
  assert.ok(planIsEmpty(plan));
});

test("planning again after applying a plan changes nothing", () => {
  const rows = [
    row({ id: "r1", photographer: "Ana", location: "Paris" }),
    row({ id: "c1", type: "editorial", photographer: "Ana, Bea", model: "Cleo" }),
    row({ id: "m1", type: "model", model: "Cleo", photographer: "Ana" }),
  ];
  const first = planPeopleSync({ rows, people: [], links: [], ownTypes: OWN, newId: ids() });
  const people = first.create.map((p) => ({ ...p })) as PersonRecord[];
  const links = first.add.map((l, i) => ({ id: `l${i}`, ...l }));
  assert.ok(planIsEmpty(planPeopleSync({ rows, people, links, ownTypes: OWN, newId: ids() })));
  // Ana is on her own row, on the Campaign image, and credited on Cleo's picture.
  const ana = people.find((p) => p.name === "Ana")!;
  assert.deepEqual(links.filter((l) => l.person_id === ana.id).map((l) => l.reference_id).sort(), ["c1", "m1", "r1"]);
});

// A duo is one person: "&" is how the deck names them.
test("a listed credit splits on commas, never on an ampersand", () => {
  assert.deepEqual(creditNames("Ana, Bea", false), ["Ana, Bea", "Ana", "Bea"]);
  assert.deepEqual(creditNames("Louise & Maria Thornfeldt", false), ["Louise & Maria Thornfeldt"]);
  assert.deepEqual(creditNames("Ana, Bea", true), ["Ana, Bea"]);
  assert.deepEqual(creditNames("Unknown", false), []);
});

test("a rename touches only the whole name, never a longer one", () => {
  assert.equal(renameInCredit("Ryan Marie Helfant (DP)", "Ryan Marie Helfant (DP)", "Ryan Marie Helfant"), "Ryan Marie Helfant");
  assert.equal(renameInCredit("Ana, Bea", "bea", "Beatrice"), "Ana, Beatrice");
  assert.equal(renameInCredit("Anastasia", "Ana", "Anna"), "Anastasia");
  assert.equal(renameInCredit(null, "Ana", "Anna"), null);
});

// The six people who showed twice before phase 1: a city from the deck and an
// "Unspecified city" card from an uncity'd picture. A person is filed once, at
// their base, and the other cities move to the profile.
test("the directory files each person once, at their base city", () => {
  const dir = buildDirectoryFromPeople(
    [
      { id: "jh", name: "Jamie Heath", city: "Sydney", ig: null },
      { id: "ap", name: "Adam Peter", city: null, ig: "https://www.instagram.com/adam_peter/" },
      { id: "gone", name: "Nobody Tagged", city: "Rome", ig: null },
    ],
    [
      { reference_id: "1", person_id: "jh" },
      { reference_id: "2", person_id: "jh" },
      { reference_id: "3", person_id: "ap" },
    ],
    [
      { id: "1", location: "Sydney", designer: "A" },
      { id: "2", location: "Paris", designer: "B", photographer_ig: "https://www.instagram.com/jamie_heath/" },
      { id: "3", location: null },
    ]
  );
  assert.deepEqual(dir.cities.map((c) => [c.city, c.photographers.map((p) => p.name)]), [
    ["Sydney", ["Jamie Heath"]],
    ["Unspecified city", ["Adam Peter"]],
  ]);
  const jh = dir.photographers.find((p) => p.key === "jh")!;
  assert.equal(jh.based, "Sydney");
  assert.deepEqual(jh.shotIn, ["Paris"]);
  assert.equal(jh.ig, "https://www.instagram.com/jamie_heath/"); // falls back to a tagged row's
  assert.deepEqual(jh.shotFor, ["A", "B"]);
  // Someone with nothing tagged is not listed — their record waits.
  assert.equal(dir.photographers.some((p) => p.key === "gone"), false);
});

test("a person's card merges and fills blanks as the settings map did", () => {
  const card = mergeCard({ group: "Movement", notes: "keep" }, { starred: true });
  assert.equal(readCard(card).starred, true);
  assert.equal(readCard(card).notes, "keep");
  assert.deepEqual(mergeCard({ notes: "x" }, { notes: "" }), {});
  const kept = cardWithDefaults({ group: "Movement" }, { group: "Directors", role: "Photographer" });
  assert.equal(readCard(kept).group, "Movement");
  assert.equal(readCard(kept).role, "Photographer");
});

// Phase 3: tagging from a picture rewrites its credit, so the planner (which
// reads the credit) agrees with what was tagged — the two can never drift.
test("tagging adds to a credit once, and untagging takes out only that name", async () => {
  const { addToCredit, removeFromCredit } = await import("./peopleRecords.ts");
  assert.equal(addToCredit(null, "Chris Colls"), "Chris Colls");
  assert.equal(addToCredit("Irina Shayk", "Alexandra Agoston"), "Irina Shayk, Alexandra Agoston");
  assert.equal(addToCredit("Irina Shayk, alexandra agoston", "Alexandra Agoston"), "Irina Shayk, alexandra agoston");
  assert.equal(removeFromCredit("Irina Shayk, Alexandra Agoston", "alexandra agoston"), "Irina Shayk");
  assert.equal(removeFromCredit("Ana", "Ana"), null);
  assert.equal(removeFromCredit("Anastasia", "Ana"), "Anastasia");
  // A duo stays whole: "&" is not a separator.
  assert.equal(removeFromCredit("Louise & Maria Thornfeldt", "Louise"), "Louise & Maria Thornfeldt");
});

test("a tag added through the credit is what the planner then sees", () => {
  const rows = [row({ id: "a1", type: "archival", photographer: "Louis Faurer, Mac Scott" })];
  const plan = planPeopleSync({
    rows,
    people: [person({ id: "ms", name: "Mac Scott" })],
    links: [],
    ownTypes: OWN,
    newId: ids(),
  });
  assert.deepEqual(plan.add, [{ reference_id: "a1", person_id: "ms", role: "photographer" }]);
  assert.equal(plan.create.length, 0); // Louis Faurer is offered, never made
});

test("names without a record are offered one by one, never the listed whole", async () => {
  const { unrecordedNames } = await import("./peopleRecords.ts");
  assert.deepEqual(unrecordedNames("Louis Faurer, Mac Scott", false, new Set(["mac scott"])), ["Louis Faurer"]);
  assert.deepEqual(unrecordedNames("Louis Faurer", false, new Set()), ["Louis Faurer"]);
  assert.deepEqual(unrecordedNames("Unknown", false, new Set()), []);
});
