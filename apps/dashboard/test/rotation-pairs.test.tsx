import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { loadMessages, type Messages } from "@senvori/i18n";
import type { ProgramItemDto, RotationPairDto } from "@senvori/contracts";

/**
 * RotationPairs component (Sprint 07B · §11.5). Mocks the SDK client and proves
 * the list, empty state, and the create flow (pickers from program items).
 */
const { listMock, itemsMock, createMock, updateMock, deleteMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  itemsMock: vi.fn(),
  createMock: vi.fn(),
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  api: {
    programming: {
      listRotationPairs: listMock,
      listItems: itemsMock,
      createRotationPair: createMock,
      updateRotationPair: updateMock,
      deleteRotationPair: deleteMock,
    },
  },
}));

import { RotationPairs } from "@/components/programs/rotation-pairs";

let messages: Messages;
beforeAll(async () => {
  messages = await loadMessages("en-US");
});

const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const items: ProgramItemDto[] = [
  {
    position: 0,
    assetId: A,
    title: "Song A",
    artist: "Artist A",
    durationMs: 180000,
    type: "track",
    status: "ready",
  },
  {
    position: 1,
    assetId: B,
    title: "Song B",
    artist: "Artist B",
    durationMs: 180000,
    type: "track",
    status: "ready",
  },
];

const pair: RotationPairDto = {
  id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  assetA: A,
  assetB: B,
  assetATitle: "Song A",
  assetBTitle: "Song B",
  minGapMinutes: 90,
  active: true,
  createdAt: "2026-07-17T00:00:00.000Z",
  updatedAt: "2026-07-17T00:00:00.000Z",
};

const renderPairs = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <NextIntlClientProvider locale="en-US" messages={messages} timeZone="America/Sao_Paulo">
      <QueryClientProvider client={client}>
        <RotationPairs programId="11111111-1111-1111-1111-111111111111" />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
};

beforeEach(() => {
  listMock.mockReset();
  itemsMock.mockReset();
  createMock.mockReset();
  itemsMock.mockResolvedValue(items);
});

describe("RotationPairs", () => {
  it("shows the empty state when there are no pairs", async () => {
    listMock.mockResolvedValue({ items: [], nextCursor: null });
    renderPairs();
    expect(await screen.findByText("No pairs configured yet.")).toBeTruthy();
  });

  it("renders existing pairs with their titles and status", async () => {
    listMock.mockResolvedValue({ items: [pair], nextCursor: null });
    renderPairs();
    // "Active" and the gap are unique to the row (titles also appear as options).
    expect(await screen.findByText("Active")).toBeTruthy();
    expect(screen.getByText("90 min")).toBeTruthy();
    expect(screen.getAllByText("Song A").length).toBeGreaterThan(0);
  });

  it("creates a pair from the program's tracks", async () => {
    listMock.mockResolvedValue({ items: [], nextCursor: null });
    createMock.mockResolvedValue(pair);
    renderPairs();
    await screen.findByText("No pairs configured yet.");
    await waitFor(() => expect(itemsMock).toHaveBeenCalled());

    const [selA, selB] = screen.getAllByRole("combobox");
    fireEvent.change(selA, { target: { value: A } });
    fireEvent.change(selB, { target: { value: B } });
    fireEvent.click(screen.getByRole("button", { name: "Add pair" }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0][0]).toMatchObject({ assetA: A, assetB: B, active: true });
  });
});
