// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./client";
import { getPlaybook, loadPlaybook, playbookKey, resetPlaybooks, usePlaybook } from "./playbookStore";

const gdl = { artist: "Lumen Vale", artistEntityId: "sample-lumen-vale", city: { id: "4005539", name: "Guadalajara", country: "MX" }, sample: true, delayMs: 0 };
afterEach(() => { resetPlaybooks(); vi.restoreAllMocks(); });

describe("playbookStore", () => {
  it("dedupes concurrent loads of the same playbook into one stream", async () => {
    const spy = vi.spyOn(client, "streamCityPlaybook");
    await Promise.all([loadPlaybook(gdl), loadPlaybook(gdl)]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(getPlaybook(playbookKey("sample-lumen-vale", "4005539"))?.status).toBe("done");
  });
  it("reuses a finished playbook without streaming again", async () => {
    await loadPlaybook(gdl);
    const spy = vi.spyOn(client, "streamCityPlaybook");
    await loadPlaybook(gdl);
    expect(spy).not.toHaveBeenCalled();
  });
  it("retries a playbook that ended in error on the next load", async () => {
    const chi = { ...gdl, city: { id: "4887398", name: "Chicago", country: "US" } };
    expect((await loadPlaybook(chi)).status).toBe("error");
    const spy = vi.spyOn(client, "streamCityPlaybook");
    await loadPlaybook(chi);
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it("marks a stream that ends without a terminal event as interrupted", async () => {
    vi.spyOn(client, "streamCityPlaybook").mockImplementation(async function* () { yield { type: "tool_call", tool: "qloo_recommend", args: {}, cached: false } as const; });
    expect((await loadPlaybook(gdl)).status).toBe("interrupted");
  });
  it("a stream still running when the store is reset does not repopulate it", async () => {
    const pending = loadPlaybook(gdl);
    resetPlaybooks();
    await pending;
    expect(getPlaybook(playbookKey("sample-lumen-vale", "4005539"))).toBeUndefined();
  });
  it("usePlaybook publishes streaming then done", async () => {
    const { result } = renderHook(() => usePlaybook(gdl));
    await waitFor(() => expect(result.current.status).toBe("done"));
    expect(result.current.cards).toHaveLength(7);
  });
  it("usePlaybook(null) stays idle", () => {
    const { result } = renderHook(() => usePlaybook(null));
    expect(result.current.status).toBe("idle");
    act(() => {});
  });
  it("keeps the long-name sample set separate from the default one", async () => {
    const curitiba = { ...gdl, city: { id: "3464975", name: "San Juan de los Lagos", country: "BR" } };
    await loadPlaybook(curitiba);
    await loadPlaybook({ ...curitiba, sampleSet: "long" });
    expect(getPlaybook(playbookKey("sample-lumen-vale", "3464975"))?.status).toBe("done");
    expect(getPlaybook(playbookKey("sample-lumen-vale", "3464975", "long"))?.status).toBe("done");
    expect(playbookKey("a", "b")).toBe("a|b|default");
  });
});
