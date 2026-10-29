// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AnswerText, realUnsupportedNumbers } from "./AnswerText";

afterEach(cleanup);

describe("AnswerText", () => {
  it("renders bold and italics as elements, with no literal asterisks", () => {
    const { container } = render(<AnswerText text="Play **Guadalajara** first, *then* Lima." />);
    expect(container.querySelector("strong")!.textContent).toBe("Guadalajara");
    expect(container.querySelector("em")!.textContent).toBe("then");
    expect(container.textContent).toBe("Play Guadalajara first, then Lima.");
  });
  it("renders numbered and bulleted lists and keeps single line breaks", () => {
    const { container } = render(<AnswerText text={"Do this:\n1. First\n2. Second\n\n- a\n- b\nLine one\nLine two"} />);
    expect([...container.querySelectorAll("ol li")].map((l) => l.textContent)).toEqual(["First", "Second"]);
    expect([...container.querySelectorAll("ul li")].map((l) => l.textContent)).toEqual(["a", "b"]);
    expect(container.querySelectorAll("br")).toHaveLength(1);
  });
  it("never injects HTML", () => {
    const { container } = render(<AnswerText text={'**<img src=x onerror=alert(1)>** <script>alert(1)</script>'} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("<script>alert(1)</script>");
  });
});

describe("realUnsupportedNumbers", () => {
  it("drops flagged tokens that were only list markers or step ordinals", () => {
    expect(realUnsupportedNumbers("Plan:\n1. Lead.\n2. Hold.\n3) Confirm.", ["2", "3"])).toEqual([]);
    expect(realUnsupportedNumbers("Step 2 then step 3.", ["2", "3"])).toEqual([]);
  });
  it("keeps tokens that are still real numbers", () => {
    expect(realUnsupportedNumbers("1. Expect 5,000 fans (38%).", ["5,000", "38%"])).toEqual(["5,000", "38%"]);
    expect(realUnsupportedNumbers("1. Fit is 2.", ["1", "2"])).toEqual(["2"]);
  });
});
