export class SseParser {
  private buffer = "";

  feed(chunk: string): Array<{ event: string; data: string }> {
    this.buffer += chunk.replace(/\r\n/g, "\n");
    const out: Array<{ event: string; data: string }> = [];
    let sep = this.buffer.indexOf("\n\n");
    while (sep !== -1) {
      const block = this.buffer.slice(0, sep);
      this.buffer = this.buffer.slice(sep + 2);
      let event = "message";
      const data: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith(":") || line === "") continue;
        const idx = line.indexOf(":");
        const field = idx === -1 ? line : line.slice(0, idx);
        const value = idx === -1 ? "" : line.slice(idx + 1).replace(/^ /, "");
        if (field === "event") event = value;
        else if (field === "data") data.push(value);
      }
      if (data.length > 0) out.push({ event, data: data.join("\n") });
      sep = this.buffer.indexOf("\n\n");
    }
    return out;
  }
}
