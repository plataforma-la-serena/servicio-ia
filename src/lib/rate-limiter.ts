export class PhoneRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs = 60_000,
  ) {}

  allow(phone: string): boolean {
    const now = Date.now();
    const recent = (this.hits.get(phone) ?? []).filter(
      (timestamp) => now - timestamp < this.windowMs,
    );

    if (recent.length >= this.limit) {
      this.hits.set(phone, recent);
      return false;
    }

    recent.push(now);
    this.hits.set(phone, recent);
    this.prune(now);
    return true;
  }

  private prune(now: number): void {
    if (this.hits.size < 5000) {
      return;
    }
    for (const [phone, timestamps] of this.hits) {
      if (timestamps.every((timestamp) => now - timestamp >= this.windowMs)) {
        this.hits.delete(phone);
      }
    }
  }
}
