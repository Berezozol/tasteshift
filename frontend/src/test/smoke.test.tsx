import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
// Smoke: the real API module is used, so any network access fails loudly here.
const LEVEL_NAMES = ["Safe", "Curious", "Experimental", "Wild"];
function blockNetwork() {
  return vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("Network is disabled in smoke tests"));
}
describe("smoke", () => {
  it("renders the preview system without network calls", () => {
    const fetchMock = blockNetwork();
    render(<App />);
    expect(screen.getByText("Preview · sample system")).toBeVisible();
    expect(screen.getAllByRole("button", { name: /^Select / })).toHaveLength(6);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("shows the main controls", () => {
    blockNetwork();
    render(<App />);
    const levels = screen.getByRole("group", { name: "Exploration level" });
    const buttons = within(levels).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(LEVEL_NAMES);
    for (const button of buttons) expect(button).toBeEnabled();
    expect(screen.getByRole("button", { name: /Make it yours/ })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /Explore this pick/ }),
    ).toBeEnabled();
  });
  it("changes the preview level locally and opens both dialogs", async () => {
    const fetchMock = blockNetwork();
    render(<App />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Wild" }));
    expect(screen.getByRole("button", { name: "Wild" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: /Explore this pick/ }));
    const detail = screen.getByRole("dialog", { name: "Portishead" });
    await user.click(
      within(detail).getByRole("button", { name: "Close dialog" }),
    );
    expect(
      screen.queryByRole("dialog", { name: "Portishead" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Make it yours/ }));
    const picker = screen.getByRole("dialog", { name: "Your starting point" });
    expect(
      within(picker).getByRole("textbox", { name: "Search your interests" }),
    ).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
