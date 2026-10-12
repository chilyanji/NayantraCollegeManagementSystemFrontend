// Incremental JPEG extraction also tolerates MIME headers split between chunks.
export class JpegParser {
  private bytes = new Uint8Array(0);
  push(chunk: Uint8Array) {
    const all = new Uint8Array(this.bytes.length + chunk.length);
    all.set(this.bytes);
    all.set(chunk, this.bytes.length);
    const frames: Uint8Array[] = [];
    let start = -1,
      last = 0;
    for (let i = 0; i < all.length - 1; i++) {
      if (start < 0 && all[i] === 255 && all[i + 1] === 216) {
        start = i;
        i++;
      } else if (start >= 0 && all[i] === 255 && all[i + 1] === 217) {
        frames.push(all.slice(start, i + 2));
        last = i + 2;
        start = -1;
        i++;
      }
    }
    this.bytes =
      start >= 0 ? all.slice(start) : all.slice(Math.max(last, all.length - 1));
    if (this.bytes.length > 8 * 1024 * 1024) {
      this.bytes = new Uint8Array();
      throw new Error("Camera returned an incomplete or oversized frame.");
    }
    return frames;
  }
}
