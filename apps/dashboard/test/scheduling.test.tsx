import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { loadMessages, type Messages } from "@senvori/i18n";
import type { EffectivePlanDto } from "@senvori/contracts";

/**
 * Scheduling page (Sprint 08). Mocks the SDK client and proves the empty states,
 * the assignment/local-event lists, and the deterministic resolve preview.
 */
const { assignmentsMock, eventsMock, effectivePlanMock, replaceMock } = vi.hoisted(() => ({
  assignmentsMock: vi.fn(),
  eventsMock: vi.fn(),
  effectivePlanMock: vi.fn(),
  replaceMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    scheduling: {
      listAssignments: assignmentsMock,
      listLocalEvents: eventsMock,
      effectivePlan: effectivePlanMock,
    },
  },
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

import SchedulingPage from "@/app/[locale]/(app)/scheduling/page";

let messages: Messages;
beforeAll(async () => {
  messages = await loadMessages("en-US");
});

const UNIT = "11111111-1111-1111-1111-111111111111";
const PROGRAM = "22222222-2222-2222-2222-222222222222";

const plan: EffectivePlanDto = {
  unitId: UNIT,
  localDate: "2026-07-15",
  timezone: "America/Sao_Paulo",
  resolution: {
    selectedAssignmentId: "33333333-3333-3333-3333-333333333333",
    selectedProgramId: PROGRAM,
    selectedProgramVersionId: null,
    targetType: "unit",
    reasonCode: "unit_assignment_selected",
    reason: "Selected the unit assignment.",
    warnings: [],
  },
  basePlanHash: "basehash123",
  effectivePlanHash: "effectivehash456",
  emergencyActive: false,
  overlays: [],
  warnings: [],
};

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <NextIntlClientProvider locale="en-US" messages={messages} timeZone="America/Sao_Paulo">
      <QueryClientProvider client={client}>
        <SchedulingPage />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
};

beforeEach(() => {
  assignmentsMock.mockReset();
  eventsMock.mockReset();
  effectivePlanMock.mockReset();
  replaceMock.mockReset();
});

describe("SchedulingPage", () => {
  it("shows empty states for assignments and local events", async () => {
    assignmentsMock.mockResolvedValue({ items: [], nextCursor: null });
    eventsMock.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    expect(await screen.findByText("No schedule assignments yet.")).toBeTruthy();
    expect(screen.getByText("No local events yet.")).toBeTruthy();
  });

  it("lists an assignment with its window and priority", async () => {
    assignmentsMock.mockResolvedValue({
      items: [
        {
          id: "33333333-3333-3333-3333-333333333333",
          programId: PROGRAM,
          programVersionId: null,
          targetType: "unit",
          targetId: UNIT,
          priority: 7,
          daysOfWeek: [],
          startTimeLocal: "08:00",
          endTimeLocal: "18:00",
          validFrom: null,
          validUntil: null,
          active: true,
          createdAt: "2026-07-17T00:00:00.000Z",
          updatedAt: "2026-07-17T00:00:00.000Z",
        },
      ],
      nextCursor: null,
    });
    eventsMock.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    expect(await screen.findByText("08:00–18:00")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
  });

  it("runs a deterministic resolve preview and shows the effective hash", async () => {
    assignmentsMock.mockResolvedValue({ items: [], nextCursor: null });
    eventsMock.mockResolvedValue({ items: [], nextCursor: null });
    effectivePlanMock.mockResolvedValue(plan);
    renderPage();
    await screen.findByText("No schedule assignments yet.");

    fireEvent.change(screen.getByLabelText("Unit ID"), { target: { value: UNIT } });
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));

    await waitFor(() => expect(effectivePlanMock).toHaveBeenCalledTimes(1));
    expect(effectivePlanMock.mock.calls[0][0]).toMatchObject({ unitId: UNIT });
    expect(await screen.findByText("effectivehash456")).toBeTruthy();
    expect(screen.getByText("Unit assignment selected")).toBeTruthy();
  });
});
