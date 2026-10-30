// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as client from "@/lib/qloo/client";
import { AnswerText } from "./AnswerText";
import { StrategistPanel } from "./StrategistPanel";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("document citations in answers", () => {
  const names = { d1: "recap.txt" };
  it("renders [doc:x p.n] as a chip with the file name and page, not as bracket text", () => {
    const { container } = render(<AnswerText text="Austin sold out [doc:d1 p.2]." documentNames={names} />);
    const chip = container.querySelector("[data-doc-cite]")!;
    expect(chip.textContent).toBe("recap.txt, p. 2");
    expect(chip.getAttribute("data-doc-id")).toBe("d1");
    expect(container.textContent).not.toContain("[doc:");
    expect(container.textContent).toBe("Austin sold out recap.txt, p. 2.");
  });
  it("labels a citation of a file that is no longer attached as Your file", () => {
    const { container } = render(<AnswerText text="See [doc:d9 p.1]." documentNames={names} />);
    expect(container.querySelector("[data-doc-cite]")!.textContent).toBe("Your file, p. 1");
  });
  it("renders chips inside list items and next to bold text", () => {
    const { container } = render(<AnswerText text={"- **Austin** was strong [doc:d1 p.1]\n- Plain"} documentNames={names} />);
    expect(container.querySelectorAll("li [data-doc-cite]")).toHaveLength(1);
    expect(container.querySelector("strong")!.textContent).toBe("Austin");
  });
  it("is visually distinct from Qloo evidence chips and carries an accessible name", () => {
    const { container } = render(<AnswerText text="x [doc:d1 p.2]" documentNames={names} />);
    const chip = container.querySelector("[data-doc-cite]")!;
    expect(chip.getAttribute("data-source")).toBe("your-file");
    expect(chip.getAttribute("aria-label")).toBe("From your file recap.txt, page 2");
  });
  it("leaves answers without citations unchanged", () => {
    const { container } = render(<AnswerText text="Plain **answer**." />);
    expect(container.querySelector("[data-doc-cite]")).toBeNull();
  });
  it("shows a flagged document number like any unverified number, in plain words", async () => {
    vi.spyOn(client, "streamStrategist").mockImplementation(async function* () {
      yield { type: "strategist_message", text: "LA drew 9,999 [doc:d1 p.1].", unsupportedNumbers: ["9,999"], stoppedEarly: false, model: "m" } as const;
      yield { type: "done", summary: {} } as const;
    });
    render(<StrategistPanel context={{}} sample={false} title="t" />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "q" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("1 number not found in the cited page or tool results: 9,999")).toBeTruthy();
  });
  it("keeps the existing wording when the answer cites no file", async () => {
    vi.spyOn(client, "streamStrategist").mockImplementation(async function* () {
      yield { type: "strategist_message", text: "Expect 5000 fans.", unsupportedNumbers: ["5000"], stoppedEarly: false, model: "m" } as const;
      yield { type: "done", summary: {} } as const;
    });
    render(<StrategistPanel context={{}} sample={false} title="t" />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "q" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("1 number not found in tool results: 5000")).toBeTruthy();
  });
});
