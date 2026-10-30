// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { StrategistThinking } from "./StrategistThinking";

afterEach(cleanup);

describe("StrategistThinking", () => {
  it("shows the model's summaries", () => {
    const { container } = render(<StrategistThinking summaries={["Looked at the sponsors card.", "Compared two cities."]} />);
    expect(container.textContent).toContain("Looked at the sponsors card.");
    expect(container.textContent).toContain("Compared two cities.");
  });
  it("drops a summary that names a do-not-book act or a non-sponsor organisation, even collapsed", () => {
    const { container } = render(<StrategistThinking summaries={["Ariel Pink fans overlap.", "Fans also rank UNICEF.", "Plain note."]} />);
    expect(container.textContent).toContain("Plain note.");
    expect(container.textContent).not.toContain("Ariel Pink");
    expect(container.textContent).not.toContain("UNICEF");
  });
  it("removes only the offending sentences and counts them across summaries", () => {
    const { container, getByText } = render(<StrategistThinking summaries={["Looked at sponsors. Ariel Pink fans overlap. Then compared cities.", "Fans also rank UNICEF."]} />);
    expect(container.textContent).toContain("Looked at sponsors. Then compared cities.");
    expect(container.textContent).not.toContain("Ariel Pink");
    expect(container.textContent).not.toContain("UNICEF");
    expect(getByText("2 sentences removed (do-not-book list or not a sponsor)")).toBeTruthy();
  });
  it("renders nothing when every summary is withheld", () => {
    const { container } = render(<StrategistThinking summaries={["Ariel Pink fans overlap."]} />);
    expect(container.innerHTML).toBe("");
  });
});
