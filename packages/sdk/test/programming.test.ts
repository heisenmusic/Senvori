import { describe, expect, it } from "vitest";
import type {
  ExecutionPlanDto,
  ProblemDetails,
  ProgramDto,
  ProgramVersionDto,
  RotationPolicyDto,
} from "@senvori/contracts";
import { SenvoriApiError, SenvoriClient } from "../src/index.js";

/* -------------------------------------------------------------------------- */
/* A recording fake fetch: captures the last request and returns a canned      */
/* response. Lets us assert exactly what the SDK put on the wire.              */
/* -------------------------------------------------------------------------- */

interface Captured {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  hasSignal: boolean;
}

const makeClient = (
  responder: (captured: Captured) => { status: number; json?: unknown },
): { client: SenvoriClient; last: () => Captured } => {
  let last: Captured | undefined;
  const fetchImpl: typeof globalThis.fetch = async (input, init) => {
    const req = init ?? {};
    const headers = (req.headers as Record<string, string>) ?? {};
    last = {
      url: String(input),
      method: req.method ?? "GET",
      headers,
      body: req.body ? JSON.parse(String(req.body)) : undefined,
      hasSignal: Boolean(req.signal),
    };
    const { status, json } = responder(last);
    return new Response(json === undefined ? null : JSON.stringify(json), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
  const client = new SenvoriClient({ baseUrl: "https://api.senvori.test", fetch: fetchImpl });
  return {
    client,
    last: () => {
      if (!last) throw new Error("no request captured");
      return last;
    },
  };
};

const program: ProgramDto = {
  id: "11111111-1111-1111-1111-111111111111",
  tenantId: "22222222-2222-2222-2222-222222222222",
  type: "manual",
  name: "Loja — Dia",
  description: null,
  status: "draft",
  publishedVersion: null,
  itemCount: 0,
  createdAt: "2026-07-16T12:00:00.000Z",
  updatedAt: "2026-07-16T12:00:00.000Z",
  archivedAt: null,
};

describe("ProgrammingClient — programs", () => {
  it("createProgram POSTs to /v1/programs with a JSON body and content-type", async () => {
    const { client, last } = makeClient(() => ({ status: 201, json: program }));
    const result = await client.programming.createProgram({ name: "Loja — Dia", type: "manual" });
    const req = last();
    expect(req.method).toBe("POST");
    expect(req.url).toBe("https://api.senvori.test/v1/programs");
    expect(req.headers["content-type"]).toBe("application/json");
    expect(req.body).toEqual({ name: "Loja — Dia", type: "manual" });
    expect(result.id).toBe(program.id);
  });

  it("listPrograms serializes cursor/limit/status/q as query params", async () => {
    const { client, last } = makeClient(() => ({
      status: 200,
      json: { items: [program], nextCursor: "cur_2" },
    }));
    const page = await client.programming.listPrograms({
      limit: 24,
      cursor: "cur_1",
      status: "published",
      q: "loja",
    });
    const url = new URL(last().url);
    expect(url.pathname).toBe("/v1/programs");
    expect(url.searchParams.get("limit")).toBe("24");
    expect(url.searchParams.get("cursor")).toBe("cur_1");
    expect(url.searchParams.get("status")).toBe("published");
    expect(url.searchParams.get("q")).toBe("loja");
    expect(page.nextCursor).toBe("cur_2");
    expect(page.items).toHaveLength(1);
  });

  it("listPrograms omits undefined query params entirely", async () => {
    const { client, last } = makeClient(() => ({
      status: 200,
      json: { items: [], nextCursor: null },
    }));
    await client.programming.listPrograms({ limit: 10 });
    const url = new URL(last().url);
    expect(url.searchParams.has("status")).toBe(false);
    expect(url.searchParams.has("q")).toBe(false);
    expect(url.searchParams.has("cursor")).toBe(false);
  });

  it("getProgram GETs /v1/programs/:id", async () => {
    const { client, last } = makeClient(() => ({ status: 200, json: program }));
    await client.programming.getProgram(program.id);
    const req = last();
    expect(req.method).toBe("GET");
    expect(req.url).toBe(`https://api.senvori.test/v1/programs/${program.id}`);
    expect(req.body).toBeUndefined();
  });

  it("updateProgram PATCHes with the partial body", async () => {
    const { client, last } = makeClient(() => ({
      status: 200,
      json: { ...program, name: "Novo nome" },
    }));
    await client.programming.updateProgram(program.id, { name: "Novo nome" });
    const req = last();
    expect(req.method).toBe("PATCH");
    expect(req.body).toEqual({ name: "Novo nome" });
  });

  it("archiveProgram POSTs archive and tolerates a 204 (no JSON)", async () => {
    const { client, last } = makeClient(() => ({ status: 204 }));
    const out = await client.programming.archiveProgram(program.id);
    expect(out).toBeUndefined();
    expect(last().url).toBe(`https://api.senvori.test/v1/programs/${program.id}/archive`);
  });
});

describe("ProgrammingClient — content & rules", () => {
  it("listItems GETs the ordered content with metadata", async () => {
    const { client, last } = makeClient(() => ({
      status: 200,
      json: [
        {
          position: 0,
          assetId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          title: "Song",
          artist: "Artist",
          durationMs: 210_000,
          type: "track",
          status: "ready",
        },
      ],
    }));
    const items = await client.programming.listItems(program.id);
    const req = last();
    expect(req.method).toBe("GET");
    expect(req.url).toBe(`https://api.senvori.test/v1/programs/${program.id}/items`);
    expect(items[0]?.title).toBe("Song");
    expect(items[0]?.position).toBe(0);
  });

  it("setItems PUTs the ordered assetIds", async () => {
    const ids = ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"];
    const { client, last } = makeClient(() => ({
      status: 200,
      json: { ...program, itemCount: 2 },
    }));
    await client.programming.setItems(program.id, { assetIds: ids });
    const req = last();
    expect(req.method).toBe("PUT");
    expect(req.url).toBe(`https://api.senvori.test/v1/programs/${program.id}/items`);
    expect(req.body).toEqual({ assetIds: ids });
  });

  it("getRotationPolicy GETs the static rotation-policy route", async () => {
    const policy: RotationPolicyDto = {
      minTrackGapMinutes: 60,
      minArtistGapMinutes: 30,
      maxPlaysPerDay: null,
      minCategoryGapMinutes: null,
      fatigueWeightPenalty: null,
      affinityStrength: null,
    };
    const { client, last } = makeClient(() => ({ status: 200, json: policy }));
    const out = await client.programming.getRotationPolicy();
    expect(last().url).toBe("https://api.senvori.test/v1/programs/rotation-policy");
    expect(out.minTrackGapMinutes).toBe(60);
  });

  it("upsertRotationPolicy PUTs the policy body", async () => {
    const policy: RotationPolicyDto = {
      minTrackGapMinutes: 45,
      minArtistGapMinutes: 20,
      maxPlaysPerDay: 3,
      minCategoryGapMinutes: 30,
      fatigueWeightPenalty: 0.5,
      affinityStrength: 0.3,
    };
    const { client, last } = makeClient(() => ({ status: 200, json: policy }));
    await client.programming.upsertRotationPolicy({
      minTrackGapMinutes: 45,
      minArtistGapMinutes: 20,
      maxPlaysPerDay: 3,
    });
    const req = last();
    expect(req.method).toBe("PUT");
    expect(req.body).toEqual({
      minTrackGapMinutes: 45,
      minArtistGapMinutes: 20,
      maxPlaysPerDay: 3,
    });
  });
});

describe("ProgrammingClient — preview", () => {
  const plan: ExecutionPlanDto = {
    compilerVersion: "2.0.0",
    timezone: "America/Sao_Paulo",
    localDate: "2026-07-16",
    windowStartUtc: "2026-07-16T03:00:00.000Z",
    windowEndUtc: "2026-07-17T03:00:00.000Z",
    totalDurationMs: 86_400_000,
    items: [],
    warnings: [{ code: "insufficient_catalog", message: "few tracks" }],
    planHash: "abc123",
    stats: {
      candidateCount: 5,
      itemCount: 0,
      relaxedRules: [],
      fallbackCount: 0,
      engine: {
        fatigueApplied: false,
        affinityApplied: false,
        categoriesApplied: false,
        avoidPairBlocks: 0,
      },
    },
  };

  it("preview POSTs the request and returns the plan with warnings", async () => {
    const { client, last } = makeClient(() => ({ status: 200, json: plan }));
    const result = await client.programming.preview(program.id, {
      timezone: "America/Sao_Paulo",
      localDate: "2026-07-16",
      windowStartLocal: "00:00",
      windowEndLocal: "24:00",
    });
    const req = last();
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`https://api.senvori.test/v1/programs/${program.id}/preview`);
    expect(req.body).toMatchObject({ timezone: "America/Sao_Paulo", localDate: "2026-07-16" });
    expect(result.planHash).toBe("abc123");
    expect(result.warnings[0]?.code).toBe("insufficient_catalog");
  });

  it("preview forwards an AbortSignal for cancellation", async () => {
    const { client, last } = makeClient(() => ({ status: 200, json: plan }));
    const controller = new AbortController();
    await client.programming.preview(
      program.id,
      { timezone: "America/Sao_Paulo", localDate: "2026-07-16" },
      controller.signal,
    );
    expect(last().hasSignal).toBe(true);
  });
});

describe("ProgrammingClient — versions & assignment", () => {
  const version: ProgramVersionDto = {
    id: "33333333-3333-3333-3333-333333333333",
    programId: program.id,
    version: 1,
    resolvedItems: [],
    planHash: "hash-1",
    compilerVersion: "1.0.0",
    publishedBy: "44444444-4444-4444-4444-444444444444",
    resolvedAt: "2026-07-16T12:30:00.000Z",
  };

  it("publish POSTs to /versions with no request body", async () => {
    const { client, last } = makeClient(() => ({ status: 201, json: version }));
    const out = await client.programming.publish(program.id);
    const req = last();
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`https://api.senvori.test/v1/programs/${program.id}/versions`);
    expect(req.body).toBeUndefined();
    expect(req.headers["content-type"]).toBeUndefined();
    expect(out.version).toBe(1);
  });

  it("listVersions GETs the versions collection", async () => {
    const { client, last } = makeClient(() => ({
      status: 200,
      json: { items: [version], nextCursor: null },
    }));
    const out = await client.programming.listVersions(program.id);
    expect(last().url).toBe(`https://api.senvori.test/v1/programs/${program.id}/versions`);
    expect(out.items[0]?.planHash).toBe("hash-1");
  });

  it("getVersion GETs a single version by id", async () => {
    const { client, last } = makeClient(() => ({ status: 200, json: version }));
    await client.programming.getVersion(program.id, version.id);
    expect(last().url).toBe(
      `https://api.senvori.test/v1/programs/${program.id}/versions/${version.id}`,
    );
  });

  it("createAssignment POSTs the scope target", async () => {
    const unitId = "55555555-5555-5555-5555-555555555555";
    const { client, last } = makeClient(() => ({
      status: 201,
      json: { id: "66666666-6666-6666-6666-666666666666", targetType: "unit", targetId: unitId },
    }));
    const out = await client.programming.createAssignment(program.id, {
      targetType: "unit",
      targetId: unitId,
    });
    const req = last();
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`https://api.senvori.test/v1/programs/${program.id}/assignments`);
    expect(req.body).toEqual({ targetType: "unit", targetId: unitId });
    expect(out.targetType).toBe("unit");
  });
});

describe("ProgrammingClient — typed error handling", () => {
  const problem = (status: number, code: string): ProblemDetails => ({
    type: "about:blank",
    title: code,
    status,
    code,
  });

  it.each([
    [401, "UNAUTHENTICATED"],
    [403, "FORBIDDEN"],
    [404, "PROGRAM_NOT_FOUND"],
    [409, "CONFLICT"],
    [422, "VALIDATION_FAILED"],
  ])("maps a %i response to SenvoriApiError with the problem body", async (status, code) => {
    const { client } = makeClient(() => ({ status, json: problem(status, code) }));
    await expect(client.programming.getProgram(program.id)).rejects.toMatchObject({
      status,
      problem: { code, status },
    });
    await expect(client.programming.getProgram(program.id)).rejects.toBeInstanceOf(SenvoriApiError);
  });

  it("synthesizes a ProblemDetails when the error body is not JSON", async () => {
    const fetchImpl: typeof globalThis.fetch = async () =>
      new Response("upstream boom", { status: 500, statusText: "Internal Server Error" });
    const client = new SenvoriClient({ baseUrl: "https://api.senvori.test", fetch: fetchImpl });
    await expect(client.programming.getProgram(program.id)).rejects.toMatchObject({
      status: 500,
      problem: { code: "UNKNOWN_ERROR" },
    });
  });
});
