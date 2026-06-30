import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ── Mocks ─────────────────────────────────────────────────────────────────────
const toastMock = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

const apiMock = vi.fn();
vi.mock("@/lib/api", () => ({ api: (...args: any[]) => apiMock(...args) }));

// Stub Radix Dialog to render children directly — avoids portal/jsdom issues
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: any) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled }: any) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children, onValueChange }: any) => <div onClick={() => onValueChange?.("random")}>{children}</div>,
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: () => <span />,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <div data-value={value}>{children}</div>,
}));

vi.mock("@/components/ui/label", () => ({ Label: ({ children }: any) => <label>{children}</label> }));

import { GenerateDialog } from "./KnockoutBracketTab";

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
describe("GenerateDialog — Plate Flight warning copy (UI guard)", () => {
  it("shows the consolation-specific warning when isPublished=true and consolationEnabled=true", () => {
    render(
      <GenerateDialog
        eventId={1}
        approvedCount={8}
        isPublished={true}
        knockoutType="individual"
        consolationEnabled={true}
        onClose={() => {}}
        onGenerated={() => {}}
      />
    );

    // Primary warning mentioning both brackets
    expect(screen.getByText(/both the Championship and Plate Flight brackets/i)).toBeInTheDocument();

    // Secondary Plate-specific callout
    expect(screen.getByText(/Plate Flight bracket will also be wiped/i)).toBeInTheDocument();

    // Confirmation checkbox label uses "both brackets"
    expect(screen.getByText(/erase both brackets and start fresh/i)).toBeInTheDocument();
  });

  it("does NOT show consolation-specific copy when consolationEnabled=false", () => {
    render(
      <GenerateDialog
        eventId={1}
        approvedCount={8}
        isPublished={true}
        knockoutType="individual"
        consolationEnabled={false}
        onClose={() => {}}
        onGenerated={() => {}}
      />
    );

    expect(screen.queryByText(/Plate Flight bracket will also be wiped/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/both the Championship and Plate Flight brackets/i)).not.toBeInTheDocument();

    // Standard (non-consolation) confirmation copy
    expect(screen.getByText(/erase the current draw and start fresh/i)).toBeInTheDocument();
  });

  it("does NOT show the warning section at all when isPublished=false", () => {
    render(
      <GenerateDialog
        eventId={2}
        approvedCount={4}
        isPublished={false}
        knockoutType="individual"
        consolationEnabled={true}
        onClose={() => {}}
        onGenerated={() => {}}
      />
    );

    expect(screen.queryByText(/Plate Flight bracket will also be wiped/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Draw already published/i)).not.toBeInTheDocument();
  });

  it("Regenerate button is disabled until the understanding checkbox is ticked when isPublished=true", () => {
    render(
      <GenerateDialog
        eventId={1}
        approvedCount={4}
        isPublished={true}
        knockoutType="individual"
        consolationEnabled={true}
        onClose={() => {}}
        onGenerated={() => {}}
      />
    );

    const regenerateBtn = screen.getByRole("button", { name: /regenerate bracket/i });
    expect(regenerateBtn).toBeDisabled();

    // Tick the checkbox
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);

    expect(regenerateBtn).not.toBeDisabled();
  });

  it("calls the generate API and fires onGenerated on success", async () => {
    const onGenerated = vi.fn();
    apiMock.mockResolvedValueOnce({ ok: true, bracket_size: 4, bye_count: 0 });

    render(
      <GenerateDialog
        eventId={5}
        approvedCount={4}
        isPublished={false}
        knockoutType="individual"
        consolationEnabled={false}
        onClose={() => {}}
        onGenerated={onGenerated}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /generate bracket/i }));

    await waitFor(() => expect(onGenerated).toHaveBeenCalledTimes(1));
    expect(apiMock).toHaveBeenCalledWith(
      "/api/portal/knockout/5/generate",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("shows an error toast when the API call fails", async () => {
    apiMock.mockRejectedValueOnce(new Error("Network error"));

    render(
      <GenerateDialog
        eventId={1}
        approvedCount={4}
        isPublished={false}
        knockoutType="individual"
        consolationEnabled={false}
        onClose={() => {}}
        onGenerated={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /generate bracket/i }));

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" })
    ));
  });
});
