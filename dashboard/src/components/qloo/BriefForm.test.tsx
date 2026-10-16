// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BriefForm } from "./BriefForm";

afterEach(cleanup);

const fill = () => fireEvent.change(screen.getByLabelText("Artist"), { target: { value: "Lumen Vale" } });
const submit = () => fireEvent.click(screen.getByRole("button", { name: "Score markets" }));

describe("BriefForm date window", () => {
  it("submits an optional date window and rejects an end before the start", () => {
    const onSubmit = vi.fn();
    render(<BriefForm onSubmit={onSubmit} />);
    fill();
    fireEvent.change(screen.getByLabelText("Window start"), { target: { value: "2027-03-12" } });
    fireEvent.change(screen.getByLabelText("Window end"), { target: { value: "2027-03-01" } });
    submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Window end must be on or after the start")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Window end"), { target: { value: "2027-04-18" } });
    submit();
    expect(onSubmit.mock.calls[0]![0].dateWindow).toEqual({ start: "2027-03-12", end: "2027-04-18" });
  });
  it("rejects a window longer than 62 days but accepts exactly 62", () => {
    const onSubmit = vi.fn();
    render(<BriefForm onSubmit={onSubmit} />);
    fill();
    fireEvent.change(screen.getByLabelText("Window start"), { target: { value: "2027-03-01" } });
    fireEvent.change(screen.getByLabelText("Window end"), { target: { value: "2027-05-03" } }); // 63 days
    submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Date window can be at most 62 days")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Window end"), { target: { value: "2027-05-02" } }); // 62 days
    submit();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
  it("omits dateWindow when both dates are empty", () => {
    const onSubmit = vi.fn();
    render(<BriefForm onSubmit={onSubmit} />);
    fill();
    submit();
    expect(onSubmit.mock.calls[0]![0].dateWindow).toBeUndefined();
  });
  it("blocks submit when only one date is set", () => {
    const onSubmit = vi.fn();
    render(<BriefForm onSubmit={onSubmit} />);
    fill();
    fireEvent.change(screen.getByLabelText("Window start"), { target: { value: "2027-03-12" } });
    submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Add both dates or neither")).toBeTruthy();
  });
  it("prefills the window from the default brief", () => {
    render(<BriefForm onSubmit={vi.fn()} defaultBrief={{ artist: "A", regions: ["Mexico"], maxStops: 4, dateWindow: { start: "2027-03-12", end: "2027-04-18" } }} />);
    expect((screen.getByLabelText("Window start") as HTMLInputElement).value).toBe("2027-03-12");
    expect((screen.getByLabelText("Window end") as HTMLInputElement).value).toBe("2027-04-18");
  });
});
