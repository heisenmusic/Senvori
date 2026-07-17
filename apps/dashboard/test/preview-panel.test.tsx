import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { loadMessages, type Messages } from "@senvori/i18n";
import type { ExecutionPlanDto } from "@senvori/contracts";

// Mock the shared SDK client the component uses (hoisted so the mock exists
// before the component module is imported).
const { previewMock, unitsMock } = vi.hoisted(() => ({
  previewMock: vi.fn(),
  unitsMock: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  api: {
    tenancy: { units: unitsMock },
    programming: { preview: previewMock },
  },
}));

import { PreviewPanel } from "@/components/programs/preview-panel";

let messages: Messages;
beforeAll(async () => {
  messages = await loadMessages("pt-BR");
});

const renderPanel = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={messages} timeZone="America/Sao_Paulo">
      <QueryClientProvider client={client}>
        <PreviewPanel programId="11111111-1111-1111-1111-111111111111" />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
};

const plan: ExecutionPlanDto = {
  compilerVersion: "1.0.0",
  timezone: "America/Sao_Paulo",
  localDate: "2026-07-16",
  windowStartUtc: "2026-07-16T03:00:00.000Z",
  windowEndUtc: "2026-07-17T03:00:00.000Z",
  totalDurationMs: 210_000,
  items: [
    {
      position: 0,
      assetId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      title: "Águas de Março",
      artist: "Jobim",
      startOffsetMs: 0,
      durationMs: 210_000,
      source: "program",
      reason: "picked",
    },
  ],
  warnings: [{ code: "insufficient_catalog", message: "few tracks" }],
  planHash: "a82fdeadbeef19cd",
  stats: {
    candidateCount: 3,
    itemCount: 1,
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

beforeEach(() => {
  previewMock.mockReset();
  unitsMock.mockReset();
  unitsMock.mockResolvedValue({ items: [], nextCursor: null });
});

describe("PreviewPanel", () => {
  it("shows the empty prompt before a preview is generated", async () => {
    renderPanel();
    expect(await screen.findByText("Selecione uma data e gere a prévia do dia.")).toBeDefined();
    expect(previewMock).not.toHaveBeenCalled();
  });

  it("generates a preview and renders the timeline, warnings and identifier", async () => {
    previewMock.mockResolvedValue(plan);
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "Gerar prévia" }));

    // The warning code is translated into product copy (not shown as a raw code).
    expect(
      await screen.findByText("Há poucas músicas disponíveis para cumprir todas as regras."),
    ).toBeDefined();
    // The timeline row renders the track title.
    expect(screen.getByText("Águas de Março")).toBeDefined();
    // The plan hash is abbreviated, never shown raw.
    expect(screen.getByText("a82f…19cd")).toBeDefined();
    expect(screen.queryByText("a82fdeadbeef19cd")).toBeNull();
    expect(previewMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces a friendly error and lets the user retry", async () => {
    previewMock.mockRejectedValue(new Error("boom"));
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "Gerar prévia" }));

    expect(
      await screen.findByText(
        "Não foi possível gerar a prévia. Verifique os conteúdos e tente novamente.",
      ),
    ).toBeDefined();
  });
});
