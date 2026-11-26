// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../App";
import { buildDoc } from "../model/tree";

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

function seedTree(items: { label: string; depth: number }[]): void {
  const doc = buildDoc("Seeded", items);
  sessionStorage.setItem("its.doc", JSON.stringify(doc));
  sessionStorage.setItem("its.versions", JSON.stringify([]));
}

describe("app shell", () => {
  it("opens with a tree, key chips and the outline", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getAllByRole("treeitem").length).toBeGreaterThan(0);
    });
    expect(document.querySelectorAll(".key-chip").length).toBeGreaterThan(0);
    expect(document.querySelector(".doc-title")?.textContent?.trim().length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Export" })).toBeTruthy();
  });

  it("adds a child from the row action and increments the version", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole("treeitem")).toHaveLength(1));
    fireEvent.click(screen.getAllByRole("button", { name: "Add child" })[0]);
    await waitFor(() => expect(screen.getAllByRole("treeitem").length).toBe(2));
    await waitFor(() => expect(screen.getByTitle("Every change increments the version").textContent).toMatch(/v[2-9]/));
  });

  it("adds a sibling with the Enter key", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole("treeitem").length).toBeGreaterThan(0));
    const input = document.querySelector<HTMLTextAreaElement>("textarea[data-label-id]");
    expect(input).toBeTruthy();
    fireEvent.keyDown(input as HTMLTextAreaElement, { key: "Enter" });
    await waitFor(() => expect(screen.getAllByRole("treeitem").length).toBeGreaterThan(1));
  });

  it("restores the tree stored for this tab", async () => {
    seedTree([
      { label: "Stored root?", depth: 1 },
      { label: "Child?", depth: 2 },
    ]);
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole("treeitem")).toHaveLength(2));
    expect(document.querySelector(".doc-title")?.textContent).toContain("Stored root?");
  });

  it("shows the four-argument quality panel with the MECE seam disabled", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/AI MECE review/)).toBeTruthy());
    expect(screen.getAllByText(/not configured/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/MECE self-check/)).toBeTruthy();
  });
});

describe("item status", () => {
  it("marks an item complete from its row checkbox", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole("treeitem").length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByLabelText("Mark this item complete")[0]);
    await waitFor(() => expect(screen.getAllByLabelText("Mark this item open").length).toBeGreaterThan(0));
  });
});

describe("markdown view", () => {
  it("applies an edited outline on Ctrl+Enter", async () => {
    seedTree([
      { label: "Root?", depth: 1 },
      { label: "A?", depth: 2 },
    ]);
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole("treeitem")).toHaveLength(2));

    fireEvent.click(screen.getByRole("tab", { name: "Markdown" }));
    const area = (await screen.findByLabelText("Markdown outline")) as HTMLTextAreaElement;
    expect(area.value).toContain("- [ ] Q0. Root?");

    fireEvent.change(area, { target: { value: "- Root?\n  - A?\n  - B?\n" } });
    fireEvent.keyDown(area, { key: "Enter", ctrlKey: true });

    fireEvent.click(screen.getByRole("tab", { name: "Tree" }));
    await waitFor(() => expect(screen.getAllByRole("treeitem")).toHaveLength(3));
  });

  it("reports the pasted numbering it removed, with the new number", async () => {
    seedTree([{ label: "Root?", depth: 1 }]);
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole("treeitem")).toHaveLength(1));

    fireEvent.click(screen.getByRole("tab", { name: "Markdown" }));
    const area = (await screen.findByLabelText("Markdown outline")) as HTMLTextAreaElement;
    fireEvent.change(area, { target: { value: "- Root?\n  - a) A numbered child?\n" } });
    fireEvent.keyDown(area, { key: "Enter", ctrlKey: true });

    await waitFor(() =>
      expect(document.querySelector(".toasts")?.textContent).toMatch(/Cleaned 1 pasted number/),
    );
    expect(document.querySelector(".toasts")?.textContent).toContain("Q1 A numbered child?");

    fireEvent.click(screen.getByRole("tab", { name: "Tree" }));
    await waitFor(() => expect(screen.getAllByRole("treeitem")).toHaveLength(2));
  });

  it("keeps a draft when the view changes", async () => {
    seedTree([{ label: "Root?", depth: 1 }]);
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole("treeitem")).toHaveLength(1));

    fireEvent.click(screen.getByRole("tab", { name: "Markdown" }));
    const area = (await screen.findByLabelText("Markdown outline")) as HTMLTextAreaElement;
    fireEvent.change(area, { target: { value: "- Root?\n  - Draft?\n" } });

    fireEvent.click(screen.getByRole("tab", { name: "Tree" }));
    await waitFor(() => expect(screen.getAllByRole("treeitem")).toHaveLength(1));

    fireEvent.click(screen.getByRole("tab", { name: "Markdown" }));
    const again = (await screen.findByLabelText("Markdown outline")) as HTMLTextAreaElement;
    expect(again.value).toContain("Draft?");
  });
});

describe("branch collapse", () => {
  it("hides a branch and restores it", async () => {
    seedTree([
      { label: "Root?", depth: 1 },
      { label: "A?", depth: 2 },
      { label: "A1?", depth: 3 },
      { label: "B?", depth: 2 },
    ]);
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole("treeitem")).toHaveLength(4));

    fireEvent.click(screen.getByLabelText("Collapse A?"));
    await waitFor(() => expect(screen.getAllByRole("treeitem")).toHaveLength(3));

    fireEvent.click(screen.getByLabelText("Expand A?"));
    await waitFor(() => expect(screen.getAllByRole("treeitem")).toHaveLength(4));
  });
});

describe("workspace shell", () => {
  it("switches to the diagram view", async () => {
    seedTree([{ label: "Root?", depth: 1 }]);
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole("treeitem")).toHaveLength(1));
    fireEvent.click(screen.getByRole("tab", { name: "Diagram" }));
    await waitFor(() => expect(document.querySelector(".diagram-svg")).toBeTruthy());
  });

  it("collapses the panel to a rail and opens details again", async () => {
    seedTree([{ label: "Root?", depth: 1 }]);
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole("treeitem")).toHaveLength(1));
    fireEvent.click(screen.getByLabelText("Collapse panel"));
    await waitFor(() => expect(screen.getByLabelText("Open details")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Open details"));
    await waitFor(() => expect(screen.getByRole("tab", { name: /Details/ })).toBeTruthy());
  });

  it("draws a clock on the history button, not a rotation arrow", async () => {
    seedTree([{ label: "Root?", depth: 1 }]);
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole("treeitem")).toHaveLength(1));
    fireEvent.click(screen.getByLabelText("Collapse panel"));

    const history = await screen.findByLabelText("Open history");
    expect(history.getAttribute("title")).toBe("History");
    expect(history.querySelector("svg")).toBeTruthy();
    expect(history.querySelector("circle")).toBeTruthy();
    expect(history.textContent).not.toContain("⟲");

    // The details button keeps its own glyph, and both keep their target size.
    const details = screen.getByLabelText("Open details");
    expect(details.textContent).toContain("▤");
    expect(history.className).toContain("rail-btn");
    expect(details.className).toContain("rail-btn");
  });

  it("opens Settings from the cogwheel, with settings in it and nothing else", async () => {
    seedTree([{ label: "Root?", depth: 1 }]);
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole("treeitem")).toHaveLength(1));
    fireEvent.click(screen.getByLabelText("Settings"));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy());

    expect(screen.getByText("Display and slides. Stored with the tree.")).toBeTruthy();
    expect(screen.getByText("Display", { selector: ".section-head span" })).toBeTruthy();
    expect(screen.getByText("Slides", { selector: ".section-head span" })).toBeTruthy();

    expect(screen.queryByText("Keys", { selector: ".section-head span" })).toBeNull();
    expect(screen.queryByText("Resolve a key")).toBeNull();
    expect(screen.queryByLabelText("Search for a key")).toBeNull();
    expect(document.querySelector(".key-table")).toBeNull();
  });

  it("keeps a display toggle after the dialog is closed and reopened", async () => {
    seedTree([{ label: "Root?", depth: 1 }]);
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole("treeitem")).toHaveLength(1));

    fireEvent.click(screen.getByLabelText("Settings"));
    const toggle = screen.getByLabelText("Show keys in the tree and the diagram") as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(false);
    fireEvent.click(screen.getByLabelText("Close settings"));

    fireEvent.click(screen.getByLabelText("Settings"));
    const reopened = (await screen.findByLabelText("Show keys in the tree and the diagram")) as HTMLInputElement;
    expect(reopened.checked).toBe(false);
  });

  it("says item on every view, and never says the old word", async () => {
    seedTree([{ label: "Root?", depth: 1 }]);
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole("treeitem")).toHaveLength(1));

    const oldWord = /node/i;
    expect(document.body.textContent).not.toMatch(oldWord);

    fireEvent.click(screen.getByRole("tab", { name: "Markdown" }));
    await waitFor(() => expect(document.querySelector(".markdown-area")).toBeTruthy());
    expect(document.body.textContent).not.toMatch(oldWord);

    fireEvent.click(screen.getByRole("tab", { name: "Diagram" }));
    await waitFor(() => expect(document.querySelector(".diagram-svg")).toBeTruthy());
    expect(document.body.textContent).not.toMatch(oldWord);

    fireEvent.click(screen.getByRole("tab", { name: "Tree" }));
    fireEvent.click(screen.getByLabelText("Settings"));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy());
    expect(document.body.textContent).not.toMatch(oldWord);
  });
});

describe("a tab saved before the items rename", () => {
  it("starts a fresh tree instead of failing", async () => {
    const doc = buildDoc("Older tree", [{ label: "Was this written before?", depth: 1 }]);
    const older: Record<string, unknown> = { ...doc, nodes: doc.items };
    delete older.items;
    sessionStorage.setItem("its.doc", JSON.stringify(older));

    render(<App />);
    await waitFor(() => expect(screen.getAllByRole("treeitem").length).toBeGreaterThan(0));
    expect(screen.queryByDisplayValue("Was this written before?")).toBeNull();
    expect(document.querySelector(".topbar")?.textContent).toMatch(/items/);
  });
});

describe("the key record", () => {
  it("shows no previous keys and no key-change count", async () => {
    seedTree([{ label: "Root?", depth: 1 }]);
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole("treeitem")).toHaveLength(1));

    expect(screen.queryByText("Previous keys")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /History/ }));
    expect(document.querySelector(".vmeta")?.textContent ?? "").not.toMatch(/key changes/);
  });
});
