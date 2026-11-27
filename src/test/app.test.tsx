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

describe("the right panel", () => {
  it("is present in Tree, and absent in Markdown and Diagram", async () => {
    seedTree([
      { label: "Root?", depth: 1 },
      { label: "A?", depth: 2 },
    ]);
    render(<App />);
    await waitFor(() => expect(document.querySelector(".rightbar")).toBeTruthy());

    // A real click on the view tab, because the panel is not hidden by a class.
    fireEvent.click(screen.getByRole("tab", { name: "Markdown" }));
    await waitFor(() => expect(document.querySelector(".rightbar")).toBeNull());

    fireEvent.click(screen.getByRole("tab", { name: "Tree" }));
    await waitFor(() => expect(document.querySelector(".rightbar")).toBeTruthy());

    fireEvent.click(screen.getByRole("tab", { name: "Diagram" }));
    await waitFor(() => expect(document.querySelector(".rightbar")).toBeNull());
  });

  it("lets the workspace take the whole width where the panel is gone", async () => {
    render(<App />);
    await waitFor(() => expect(document.querySelector(".rightbar")).toBeTruthy());
    expect(document.querySelector(".body")?.className).not.toContain("no-panel");

    fireEvent.click(screen.getByRole("tab", { name: "Markdown" }));
    await waitFor(() => expect(document.querySelector(".body")?.className).toContain("no-panel"));
  });

  it("keeps Ctrl+backslash from touching the panel outside Tree", async () => {
    render(<App />);
    await waitFor(() => expect(document.querySelector(".rightbar")).toBeTruthy());
    fireEvent.click(screen.getByRole("tab", { name: "Markdown" }));
    await waitFor(() => expect(document.querySelector(".rightbar")).toBeNull());

    fireEvent.keyDown(window, { key: "\\", ctrlKey: true });
    fireEvent.click(screen.getByRole("tab", { name: "Tree" }));
    // The panel must come back open, which it would not if the key had collapsed it.
    await waitFor(() => expect(document.querySelector(".rightbar")).toBeTruthy());
    expect(document.querySelector(".body")?.className).not.toContain("panel-collapsed");
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

describe("the column headings", () => {
  it("names the four columns, outside the tree role", async () => {
    seedTree([{ label: "Root?", depth: 1 }]);
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole("treeitem")).toHaveLength(1));

    const head = document.querySelector(".row-head");
    expect(head).toBeTruthy();
    for (const word of ["Item no.", "Item", "Key", "Status"]) {
      expect(head?.textContent).toContain(word);
    }
    expect(head?.closest('[role="tree"]')).toBeNull();
    expect(head?.getAttribute("aria-hidden")).toBe("true");
  });

  it("shows no headings when the tree is empty", async () => {
    sessionStorage.setItem(
      "its.doc",
      JSON.stringify({
        id: "empty",
        name: "Empty",
        rootId: null,
        items: {},
        version: 1,
        createdAt: 1,
        updatedAt: 1,
        settings: {
          showKeysInEditor: true,
          showKeysInExport: true,
          includeOverviewSlide: true,
          includeKeyIndexSlide: false,
        },
      }),
    );
    render(<App />);
    await waitFor(() => expect(document.querySelector(".empty-outline")).toBeTruthy());
    expect(document.querySelector(".row-head")).toBeNull();
  });
});

describe("the footer", () => {
  it("appears in all three views and carries the build", async () => {
    seedTree([{ label: "Root?", depth: 1 }]);
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole("treeitem")).toHaveLength(1));
    expect(document.querySelector(".markdown-foot .footer-build")?.textContent).toContain("0.");

    fireEvent.click(screen.getByRole("tab", { name: "Markdown" }));
    await waitFor(() => expect(document.querySelector(".markdown-area")).toBeTruthy());
    expect(document.querySelector(".markdown-foot .footer-build")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Diagram" }));
    await waitFor(() => expect(document.querySelector(".diagram-svg")).toBeTruthy());
    expect(document.querySelector(".markdown-foot .footer-build")).toBeTruthy();
  });

  it("moves the build out of the top bar and leaves the version pill in it", async () => {
    seedTree([{ label: "Root?", depth: 1 }]);
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole("treeitem")).toHaveLength(1));
    expect(document.querySelector(".topbar .build-stamp")).toBeNull();
    expect(document.querySelector(".topbar .pill.version")).toBeTruthy();
  });

  it("says how many items are on screen when a branch is folded", async () => {
    seedTree([
      { label: "Root?", depth: 1 },
      { label: "A?", depth: 2 },
      { label: "A1?", depth: 3 },
      { label: "B?", depth: 2 },
    ]);
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole("treeitem")).toHaveLength(4));
    expect(document.querySelector(".markdown-foot")?.textContent).toContain("4 items");

    fireEvent.click(screen.getAllByRole("button", { name: /^Collapse A\?/ })[0]);
    await waitFor(() =>
      expect(document.querySelector(".markdown-foot")?.textContent).toContain("3 of 4 items"),
    );
  });
});

describe("the diagram outline", () => {
  it("keeps every box outline in CSS rather than inline attributes", async () => {
    seedTree([{ label: "Root?", depth: 1 }]);
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole("treeitem")).toHaveLength(1));
    fireEvent.click(screen.getByRole("tab", { name: "Diagram" }));
    await waitFor(() => expect(document.querySelector(".diagram-svg .nrect")).toBeTruthy());

    const box = document.querySelector(".diagram-svg .nrect");
    expect(box?.getAttribute("stroke")).toBeNull();
    expect(box?.getAttribute("stroke-width")).toBeNull();
    expect(box?.classList.contains("root")).toBe(true);
  });
});

describe("the diagram zoom", () => {
  const enter = async (): Promise<void> => {
    seedTree([{ label: "Root?", depth: 1 }]);
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole("treeitem")).toHaveLength(1));
    fireEvent.click(screen.getByRole("tab", { name: "Diagram" }));
    await waitFor(() => expect(document.querySelector(".diagram-svg")).toBeTruthy());
  };

  const label = (): string => document.querySelector(".zoom-level")?.textContent ?? "";
  const canvasWidth = (): string =>
    (document.querySelector(".diagram-svg") as SVGSVGElement | null)?.style.width ?? "";

  it("starts at Fit, remembers the level per tab, and sizes the canvas from it", async () => {
    await enter();
    expect(label()).toBe("100%");
    expect(canvasWidth()).not.toBe("");

    fireEvent.click(screen.getByLabelText("Zoom in"));
    await waitFor(() => expect(label()).toBe("125%"));
    expect(sessionStorage.getItem("its.zoom")).toBe("125");
  });

  it("clamps between 25 and 400 percent", async () => {
    await enter();
    for (let i = 0; i < 20; i += 1) fireEvent.click(screen.getByLabelText("Zoom out"));
    await waitFor(() => expect(label()).toBe("25%"));
    for (let i = 0; i < 40; i += 1) fireEvent.click(screen.getByLabelText("Zoom in"));
    await waitFor(() => expect(label()).toBe("400%"));

    // Four times the level is four times the canvas.
    const atFull = Number.parseFloat(canvasWidth());
    fireEvent.click(screen.getByLabelText("Fit the diagram"));
    await waitFor(() => expect(label()).toBe("100%"));
    expect(Number.parseFloat(canvasWidth()) * 4).toBeCloseTo(atFull, 0);
  });

  it("zooms with control and the wheel, and ignores a plain wheel", async () => {
    await enter();
    const wrap = document.querySelector(".diagram-wrap") as HTMLElement;

    fireEvent.wheel(wrap, { deltaY: -100, ctrlKey: true });
    await waitFor(() => expect(label()).toBe("125%"));
    fireEvent.wheel(wrap, { deltaY: 100, ctrlKey: true });
    await waitFor(() => expect(label()).toBe("100%"));

    fireEvent.wheel(wrap, { deltaY: -100 });
    await waitFor(() => expect(label()).toBe("100%"));
  });

  it("zooms from the keyboard while the canvas has focus", async () => {
    await enter();
    const wrap = document.querySelector(".diagram-wrap") as HTMLElement;
    fireEvent.keyDown(wrap, { key: "+" });
    await waitFor(() => expect(label()).toBe("125%"));
    fireEvent.keyDown(wrap, { key: "0" });
    await waitFor(() => expect(label()).toBe("100%"));
  });

  it("does not select the item it panned over", async () => {
    await enter();
    const wrap = document.querySelector(".diagram-wrap") as HTMLElement;
    const box = document.querySelector(".diagram-svg .nrect") as SVGRectElement;
    fireEvent.pointerDown(wrap, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(wrap, { pointerId: 1, clientX: 60, clientY: 60 });
    fireEvent.pointerUp(wrap, { pointerId: 1 });
    fireEvent.click(box);
    expect(document.querySelector(".row.selected")).toBeNull();
  });
});

describe("folding in the diagram", () => {
  const enter = async (): Promise<void> => {
    seedTree([
      { label: "Root?", depth: 1 },
      { label: "A?", depth: 2 },
      { label: "A1?", depth: 3 },
      { label: "A2?", depth: 3 },
      { label: "B?", depth: 2 },
    ]);
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole("treeitem")).toHaveLength(5));
    fireEvent.click(screen.getByRole("tab", { name: "Diagram" }));
    await waitFor(() => expect(document.querySelector(".diagram-svg")).toBeTruthy());
  };

  const boxes = (): number => document.querySelectorAll(".diagram-svg .nrect").length;
  const legend = (): string => document.querySelector(".legend")?.textContent ?? "";
  const collapseA = (): void => {
    fireEvent.click(screen.getAllByRole("button", { name: /^Collapse A\?/ })[0]);
  };

  it("folds from the connector, closes the gap, and the Tree agrees", async () => {
    await enter();
    expect(boxes()).toBe(5);

    collapseA();
    await waitFor(() => expect(boxes()).toBe(3));
    expect(document.querySelector(".folded-count")?.textContent).toContain("2 hidden");

    fireEvent.click(screen.getByRole("tab", { name: "Tree" }));
    await waitFor(() => expect(screen.getAllByRole("treeitem")).toHaveLength(3));
  });

  it("shows a fold made in the Tree", async () => {
    await enter();
    fireEvent.click(screen.getByRole("tab", { name: "Tree" }));
    collapseA();
    await waitFor(() => expect(screen.getAllByRole("treeitem")).toHaveLength(3));

    fireEvent.click(screen.getByRole("tab", { name: "Diagram" }));
    await waitFor(() => expect(boxes()).toBe(3));
    expect(document.querySelector(".folded-count")?.textContent).toContain("2 hidden");
  });

  it("counts only the leaves still on screen", async () => {
    await enter();
    expect(legend()).toContain("3 leaf rows");
    collapseA();
    // A folded branch has no visible children, so its own row becomes a leaf row.
    await waitFor(() => expect(legend()).toContain("2 leaf rows"));
  });

  it("does not select the item whose chevron was clicked", async () => {
    await enter();
    fireEvent.click(screen.getByRole("tab", { name: "Tree" }));
    fireEvent.click(screen.getAllByRole("treeitem")[0]);
    fireEvent.click(screen.getByRole("tab", { name: "Diagram" }));

    collapseA();
    fireEvent.click(screen.getByRole("tab", { name: "Tree" }));
    await waitFor(() => expect(screen.getAllByRole("treeitem")).toHaveLength(3));
    expect(document.querySelector(".row.selected")?.textContent).toContain("Root?");
  });
});

describe("the findings list", () => {
  // A hundred and sixty-six rows is slow to render under jsdom, so this one gets room.
  it("lists fifty and keeps the rest one click away", { timeout: 30000 }, async () => {
    // Fifty-five parents, each with two identically named children: one duplicate
    // finding each, plus the root's many-branches note. More than fifty.
    const items = [{ label: "Root?", depth: 1 }];
    for (let index = 0; index < 55; index += 1) {
      items.push({ label: `Parent ${index}?`, depth: 2 });
      items.push({ label: "Repeated?", depth: 3 });
      items.push({ label: "Repeated?", depth: 3 });
    }
    seedTree(items);
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole("treeitem").length).toBeGreaterThan(50));

    const shown = (): number => document.querySelectorAll(".finding").length;
    expect(shown()).toBe(50);
    expect(document.querySelector(".finding-more")?.textContent).toContain("50 of");

    fireEvent.click(screen.getByRole("button", { name: /^Show all/ }));
    await waitFor(() => expect(shown()).toBeGreaterThan(50));
  });
});
