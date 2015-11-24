class EventEmitterIterator {
  constructor (emitter, event, endEvent) {
    this.queue = [];
    this.cbqueue = [];
    let listener = (...args) => {
      this.sendToQueue({ kind: "data", args });
    };
    let endListener = () => {
      this.sendToQueue({ kind: "end" });
      emitter.removeListener(event, listener);
      emitter.removeListener(endEvent, endListener);
      emitter.removeListener("error", errorListener);
    };
    let errorListener = (err) => {
      this.sendToQueue({ kind: "error", err });
    };
    emitter.on(event, listener);
    emitter.once(endEvent, endListener);
    emitter.once("error", errorListener);
  }

  sendToQueue(data) {
    if (this.cbqueue.length > 0) {
      if (data.kind === "error")
        this.cbqueue.shift().reject(data.err);
      else if (data.kind === "end") {
        this.cbqueue.shift().resolve({ done: true });
        this.queue.push(data);
      } else
        this.cbqueue.shift().resolve({ value: data.args });
    } else
      this.queue.push(data);
  }

  next() {
    return new Promise((resolve, reject) => {
      if (this.queue.length > 0) {
        if (this.queue[0].kind === "end")
          return resolve({ done: true });
        else if (this.queue[0].kind === "data")
          return resolve({ value: this.queue.shift().args });
        else if (this.queue[0].kind === "error")
          return reject(this.queue.shift().err);
      }
      else {
        this.cbqueue.push({resolve, reject});
      }
    });
  }
}

module.exports = EventEmitterIterator;
