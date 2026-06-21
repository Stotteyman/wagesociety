// bot/rate-limiter.js — Discord API rate limit queue.
const DISCORD_RATE = 10; // requests
const DISCORD_WINDOW = 10 * 1000; // per 10 seconds

class RateLimiter {
  constructor() {
    this.queue = [];
    this.running = false;
    this.count = 0;
    this.windowStart = Date.now();
  }

  async exec(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.running || this.queue.length === 0) return;
    this.running = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      if (now - this.windowStart >= DISCORD_WINDOW) {
        this.count = 0;
        this.windowStart = now;
      }

      if (this.count >= DISCORD_RATE) {
        const waitMs = DISCORD_WINDOW - (now - this.windowStart);
        await this.sleep(Math.max(100, waitMs));
        this.count = 0;
        this.windowStart = Date.now();
        continue;
      }

      const item = this.queue.shift();
      this.count++;
      try {
        const result = await item.fn();
        item.resolve(result);
      } catch (err) {
        item.reject(err);
      }
    }

    this.running = false;
  }

  sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}

module.exports = { RateLimiter };