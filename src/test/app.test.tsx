// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../App";

afterEach(cleanup);

describe("app shell", () => {
  it("opens with a tree, key chips and the outline", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getAllByRole("treeitem").length).toBeGreaterThan(0);
    });
    expect(document.querySelectorAll(".key-chip").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Tree name")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export" })).toBeTruthy();
  });

  it("adds a child from the row action and increments the version", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole("treeitem")).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Add child" }));
    await waitFor(() => expect(screen.getAllByRole("treeitem").length).toBe(2));
    await waitFor(() => expect(screen.getByTitle("Every change increments the version").textContent).toMatch(/v[2-9]/));
  });

  it("adds a sibling with the Enter key", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole("treeitem").length).toBeGreaterThan(0));
    const input = document.querySelector<HTMLInputElement>("input[data-label-id]");
    expect(input).toBeTruthy();
    fireEvent.keyDown(input as HTMLInputElement, { key: "Enter" });
    await waitFor(() => expect(screen.getAllByRole("treeitem").length).toBeGreaterThan(1));
  });

  it("loads a sample tree from the sidebar", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole("treeitem").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByTitle("Diagnostic tree: why did profit fall, split into revenue, cost and mix."));
    await waitFor(() => expect(screen.getAllByRole("treeitem")).toHaveLength(18), { timeout: 5000 });
  });

  it("shows the four-argument quality panel with the MECE seam disabled", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/AI MECE review/)).toBeTruthy());
    expect(screen.getAllByText(/not configured/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/MECE self-check/)).toBeTruthy();
  });
});
